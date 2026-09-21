/**
 * noise-suppressor-worklet.js
 * ----------------------------------------------------------------------
 * Runs on the dedicated real-time audio rendering thread (NOT the main
 * UI thread). This implements genuine DSP: an STFT analysis/synthesis
 * pipeline with adaptive noise-floor estimation and spectral subtraction.
 * It is dependency-free because AudioWorkletGlobalScope is a separate JS
 * realm with no DOM and inconsistent support for bundler-style imports.
 *
 * Pipeline (every HOP_SIZE = 512 new input samples, i.e. every 4 render
 * quanta of 128 samples each):
 *   1. Slide a FRAME_SIZE = 1024 analysis window forward by HOP_SIZE.
 *   2. Apply a periodic Hann window and take the FFT -> magnitude+phase.
 *   3. Voice Activity Detection (VAD) compares smoothed frame energy to
 *      a tracked noise floor to decide "speech" vs "noise-only".
 *   4. During noise-only frames, recursively average the magnitude
 *      spectrum into a running noise-spectrum estimate (a lightweight,
 *      explainable stand-in for full minimum-statistics tracking).
 *   5. Spectral subtraction: subtract (oversubtraction * noiseMag) from
 *      the frame magnitude, floored to avoid harsh "musical noise".
 *   6. Recombine the suppressed magnitude with the ORIGINAL phase,
 *      inverse-FFT, and overlap-add into a small output queue that the
 *      process() callback drains 128 samples at a time.
 *   7. Periodically postMessage() level metrics to the main thread.
 *
 * With a Hann window at 50% overlap (periodic definition), the
 * overlap-add sum is exactly 1.0, so no extra gain normalization is
 * needed after reconstruction.
 */

const FRAME_SIZE = 1024; // ~23ms @ 44.1kHz - standard speech STFT frame
const HOP_SIZE = FRAME_SIZE / 2; // 50% overlap for Hann COLA reconstruction
const RENDER_QUANTUM = 128; // fixed by the Web Audio spec

// ---------------------------------------------------------------------
// Minimal, self-contained radix-2 Cooley-Tukey FFT (iterative, in place).
// ---------------------------------------------------------------------
function fft(real, imag, invert) {
  const n = real.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = real[i]; real[i] = real[j]; real[j] = t;
      t = imag[i]; imag[i] = imag[j]; imag[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((invert ? -1 : 1) * 2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      const half = len / 2;
      for (let j = 0; j < half; j++) {
        const uRe = real[i + j];
        const uIm = imag[i + j];
        const vRe = real[i + j + half] * curRe - imag[i + j + half] * curIm;
        const vIm = real[i + j + half] * curIm + imag[i + j + half] * curRe;
        real[i + j] = uRe + vRe;
        imag[i + j] = uIm + vIm;
        real[i + j + half] = uRe - vRe;
        imag[i + j + half] = uIm - vIm;
        const nextRe = curRe * wRe - curIm * wIm;
        const nextIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
        curIm = nextIm;
      }
    }
  }
  if (invert) {
    for (let i = 0; i < n; i++) {
      real[i] /= n;
      imag[i] /= n;
    }
  }
}

// Periodic Hann window: w[n] = 0.5 - 0.5*cos(2*pi*n/N). This (as opposed
// to the "symmetric" N-1 denominator version) gives an exact
// constant-overlap-add of 1.0 at 50% hop, so no post-hoc gain correction
// is required after overlap-add.
function periodicHann(size) {
  const w = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size);
  }
  return w;
}

// Small fixed-capacity circular FIFO of samples, used to decouple the
// "produce 512 samples every hop" analysis/synthesis cadence from the
// "consume 128 samples every callback" render cadence.
class SampleQueue {
  constructor(capacity) {
    this.buf = new Float32Array(capacity);
    this.capacity = capacity;
    this.readPos = 0;
    this.writePos = 0;
    this.count = 0;
  }
  push(samples) {
    for (let i = 0; i < samples.length; i++) {
      this.buf[this.writePos] = samples[i];
      this.writePos = (this.writePos + 1) % this.capacity;
      this.count = Math.min(this.count + 1, this.capacity);
    }
  }
  pop(outArray) {
    for (let i = 0; i < outArray.length; i++) {
      if (this.count === 0) {
        outArray[i] = 0; // underflow (startup latency window) -> silence
        continue;
      }
      outArray[i] = this.buf[this.readPos];
      this.readPos = (this.readPos + 1) % this.capacity;
      this.count--;
    }
  }
}

class NoiseSuppressorProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      // 0 = bypass (no suppression at all), 5 = maximum suppression.
      { name: 'suppression', defaultValue: 2.0, minValue: 0, maxValue: 5, automationRate: 'k-rate' },
      // 0 = normal, 1 = mute the processed output entirely (instant, no
      // graph rewiring needed).
      { name: 'muted', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();

    this.window = periodicHann(FRAME_SIZE);

    this.hopAccum = new Float32Array(HOP_SIZE);
    this.hopAccumPos = 0;

    // One-pole high-pass state (removes DC offset and sub-80Hz rumble -
    // mic handling noise, room hum - which is inaudible-to-negligible
    // for voice but reads as a persistent low-frequency "noise floor").
    this.hpPrevIn = 0;
    this.hpPrevOut = 0;
    const hpCutoffHz = 80;
    const rc = 1 / (2 * Math.PI * hpCutoffHz);
    this.hpAlpha = rc / (rc + 1 / sampleRate);

    // Persistent per-bin gain state for temporal smoothing (reduces
    // frame-to-frame gain jitter, a primary cause of "musical noise").
    this.prevGain = new Float32Array(FRAME_SIZE / 2 + 1).fill(1);

    this.slidingFrame = new Float32Array(FRAME_SIZE); // last FRAME_SIZE input samples
    this.olaBuffer = new Float32Array(FRAME_SIZE); // overlap-add accumulator
    this.outQueue = new SampleQueue(HOP_SIZE * 4);

    this.fftReal = new Float32Array(FRAME_SIZE);
    this.fftImag = new Float32Array(FRAME_SIZE);

    const half = FRAME_SIZE / 2 + 1;
    this.noiseMag = new Float32Array(half);
    this.noiseInitialized = false;
    this.framesSeen = 0;

    // Energy trackers for VAD, in the FFT's own (unnormalized) log-energy
    // units - NOT dBFS. These are seeded from the first real frame instead
    // of a hardcoded guess, because a fixed constant here was previously
    // wildly out of scale with actual frame energies and permanently
    // stuck the VAD in "speech" mode (see runAnalysisSynthesis).
    this.smoothedEnergy = null;
    this.noiseFloorEnergy = null;

    this.samplesSinceReport = 0;
    this.reportIntervalSamples = Math.round(sampleRate * 0.1);
    this.lastInputLevel = 0;
    this.lastNoiseLevel = 0;
    this.lastSpeechProbability = 0;

    this.port.onmessage = (event) => {
      if (event.data && event.data.type === 'reset-noise-profile') {
        this.noiseMag.fill(0);
        this.noiseInitialized = false;
        this.framesSeen = 0;
      }
    };
  }

  runAnalysisSynthesis(suppressionAmount, muted) {
    for (let i = 0; i < FRAME_SIZE; i++) {
      this.fftReal[i] = this.slidingFrame[i] * this.window[i];
      this.fftImag[i] = 0;
    }
    fft(this.fftReal, this.fftImag, false);

    const half = FRAME_SIZE / 2 + 1;
    const mag = new Float32Array(half);
    const phaseRe = new Float32Array(half);
    const phaseIm = new Float32Array(half);

    let frameEnergy = 0;
    for (let k = 0; k < half; k++) {
      const re = this.fftReal[k];
      const im = this.fftImag[k];
      const m = Math.sqrt(re * re + im * im);
      mag[k] = m;
      phaseRe[k] = m > 1e-8 ? re / m : 1;
      phaseIm[k] = m > 1e-8 ? im / m : 0;
      frameEnergy += m * m;
    }

    const logEnergy = 10 * Math.log10(frameEnergy / half + 1e-12);

    if (this.smoothedEnergy === null) {
      // First frame ever: seed both trackers directly from real data
      // instead of a guessed constant, so the VAD threshold comparison
      // is meaningful from frame one.
      this.smoothedEnergy = logEnergy;
      this.noiseFloorEnergy = logEnergy;
    } else {
      const attack = 0.6;
      const release = 0.05;
      this.smoothedEnergy =
        logEnergy > this.smoothedEnergy
          ? attack * this.smoothedEnergy + (1 - attack) * logEnergy
          : release * this.smoothedEnergy + (1 - release) * logEnergy;
    }

    // --- VAD -------------------------------------------------------
    const vadThresholdDb = 6;
    const isSpeech = this.smoothedEnergy > this.noiseFloorEnergy + vadThresholdDb;
    this.lastSpeechProbability = isSpeech ? 1 : 0;
    if (!isSpeech) {
      this.noiseFloorEnergy = 0.95 * this.noiseFloorEnergy + 0.05 * this.smoothedEnergy;
    }

    // --- Noise spectrum tracking ------------------------------------
    if (!this.noiseInitialized) {
      for (let k = 0; k < half; k++) {
        this.noiseMag[k] = this.framesSeen === 0 ? mag[k] : 0.9 * this.noiseMag[k] + 0.1 * mag[k];
      }
      this.framesSeen++;
      if (this.framesSeen > 8) this.noiseInitialized = true;
    } else if (!isSpeech) {
      const noiseAdaptRate = 0.92;
      for (let k = 0; k < half; k++) {
        this.noiseMag[k] = noiseAdaptRate * this.noiseMag[k] + (1 - noiseAdaptRate) * mag[k];
      }
    }

    // --- Spectral subtraction, computed as a GAIN MASK ------------------
    // Working in gain-space (0..1 multiplier per bin) instead of directly
    // subtracting magnitudes lets us smooth the mask both across
    // frequency and across time before applying it. Raw per-bin, per-frame
    // subtraction is what produces "musical noise": isolated bins survive
    // the floor in one frame and not the next, which the ear hears as
    // random narrowband chirps. Smoothing the mask (not the audio itself)
    // removes that jitter while still tracking real level changes.
    const oversubtraction = 1 + suppressionAmount * 0.9; // 1 .. 5.5
    const spectralFloor = Math.max(0.015, 0.15 - suppressionAmount * 0.02);
    const bypass = suppressionAmount <= 0.001;

    const rawGain = new Float32Array(half);
    let noiseEnergyAccum = 0;
    for (let k = 0; k < half; k++) {
      noiseEnergyAccum += this.noiseMag[k] * this.noiseMag[k];
      if (bypass) { rawGain[k] = 1; continue; }
      const denom = mag[k] > 1e-6 ? mag[k] : 1e-6;
      const sub = (mag[k] - oversubtraction * this.noiseMag[k]) / denom;
      rawGain[k] = Math.max(spectralFloor, Math.min(1, sub));
    }

    // Frequency-domain smoothing: 3-tap moving average across neighbouring
    // bins flattens isolated spikes/dips in the mask.
    const freqSmoothedGain = new Float32Array(half);
    for (let k = 0; k < half; k++) {
      const a = rawGain[Math.max(0, k - 1)];
      const b = rawGain[k];
      const c = rawGain[Math.min(half - 1, k + 1)];
      freqSmoothedGain[k] = (a + b + c) / 3;
    }

    // Time-domain smoothing: single-pole IIR per bin against last frame's
    // mask. Fast enough to follow real speech onsets, slow enough to
    // damp frame-to-frame noise jitter.
    const timeSmooth = bypass ? 1 : 0.55;
    const enhancedMag = new Float32Array(half);
    // Extra "noise gate" attenuation applied only during confirmed
    // noise-only frames - safe to push harder here since there's no
    // speech to protect, and it meaningfully cleans up silent gaps.
    const gateFactor = !bypass && !isSpeech ? 0.5 : 1;
    for (let k = 0; k < half; k++) {
      const smoothed = timeSmooth * this.prevGain[k] + (1 - timeSmooth) * freqSmoothedGain[k];
      this.prevGain[k] = smoothed;
      const finalGain = bypass ? 1 : Math.max(spectralFloor, smoothed * gateFactor);
      enhancedMag[k] = mag[k] * finalGain;
    }

    // --- Reconstruct full Hermitian-symmetric spectrum + inverse FFT --
    for (let k = 0; k < half; k++) {
      this.fftReal[k] = enhancedMag[k] * phaseRe[k];
      this.fftImag[k] = enhancedMag[k] * phaseIm[k];
      if (k > 0 && k < FRAME_SIZE - k) {
        this.fftReal[FRAME_SIZE - k] = this.fftReal[k];
        this.fftImag[FRAME_SIZE - k] = -this.fftImag[k];
      }
    }
    fft(this.fftReal, this.fftImag, true);

    // --- Overlap-add ----------------------------------------------------
    // olaBuffer currently holds the still-pending tail of the previous
    // frame in [0, FRAME_SIZE - HOP_SIZE). Emit the first HOP_SIZE
    // samples (now final), shift, zero the new tail, then add this
    // frame's full synthesis in.
    const finalized = this.olaBuffer.slice(0, HOP_SIZE);
    this.outQueue.push(muted > 0.5 ? new Float32Array(HOP_SIZE) : finalized);

    this.olaBuffer.copyWithin(0, HOP_SIZE);
    this.olaBuffer.fill(0, FRAME_SIZE - HOP_SIZE, FRAME_SIZE);
    for (let i = 0; i < FRAME_SIZE; i++) {
      this.olaBuffer[i] += this.fftReal[i];
    }

    // --- Metering ---------------------------------------------------
    let inRms = 0;
    for (let i = 0; i < FRAME_SIZE; i++) inRms += this.slidingFrame[i] * this.slidingFrame[i];
    inRms = Math.sqrt(inRms / FRAME_SIZE);
    this.lastInputLevel = Math.min(1, inRms * 4);
    this.lastNoiseLevel = Math.min(1, (Math.sqrt(noiseEnergyAccum / half) / (FRAME_SIZE / 4)) * 4);
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    const outChannel = output && output[0];
    if (!outChannel) return true;

    const suppression = parameters.suppression[0];
    const muted = parameters.muted[0];

    if (input && input[0]) {
      const inChannel = input[0];

      // Apply the high-pass filter sample-by-sample as data arrives, so
      // its state stays continuous across render quanta and hops.
      for (let i = 0; i < inChannel.length; i++) {
        const x = inChannel[i];
        const y = this.hpAlpha * (this.hpPrevOut + x - this.hpPrevIn);
        this.hpPrevIn = x;
        this.hpPrevOut = y;
        this.hopAccum[this.hopAccumPos + i] = y;
      }
      this.hopAccumPos += RENDER_QUANTUM;

      if (this.hopAccumPos >= HOP_SIZE) {
        this.hopAccumPos = 0;
        this.slidingFrame.copyWithin(0, HOP_SIZE);
        this.slidingFrame.set(this.hopAccum, FRAME_SIZE - HOP_SIZE);
        this.runAnalysisSynthesis(suppression, muted);
      }
    }

    this.outQueue.pop(outChannel);

    this.samplesSinceReport += RENDER_QUANTUM;
    if (this.samplesSinceReport >= this.reportIntervalSamples) {
      this.samplesSinceReport = 0;
      this.port.postMessage({
        type: 'levels',
        inputLevel: this.lastInputLevel,
        noiseLevel: this.lastNoiseLevel,
        speechProbability: this.lastSpeechProbability,
        noiseFloorEnergy: this.noiseFloorEnergy,
      });
    }

    return true;
  }
}

registerProcessor('noise-suppressor', NoiseSuppressorProcessor);
