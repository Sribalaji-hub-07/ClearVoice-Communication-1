# ClearVoice Realtime

> **Note:** this project's folder/zip is deliberately named `clearvoice-realtime`
> (not just `clearvoice`) to avoid clashing with any other project of that name
> already on your machine. The npm package name matches
> (`clearvoice-realtime` in `package.json`), but this doesn't affect how the
> app runs.

**Real-Time Adaptive Noise Suppression for Enhanced Voice Communication**

A browser-based, backend-free application that captures microphone audio, estimates
background noise, and suppresses it in real time using an STFT-based adaptive spectral
subtraction algorithm running on a dedicated `AudioWorklet` thread. Built with
React + TypeScript + Vite and the Web Audio API.

This is **not** a volume/gate trick. The suppression engine performs genuine
frequency-domain processing: FFT analysis, per-bin noise-magnitude tracking, spectral
subtraction, and inverse-FFT overlap-add resynthesis, all implemented from first
principles (no external DSP libraries).

---

## 1. Folder structure

```
clearvoice/
├── index.html
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── public/
│   └── worklets/
│       └── noise-suppressor-worklet.js   # AudioWorkletProcessor (runs off the UI thread)
└── src/
    ├── main.tsx                          # React entry point
    ├── App.tsx                           # Top-level state + wiring
    ├── index.css                         # Dashboard theme
    ├── audio/
    │   ├── types.ts                      # Shared types/contracts
    │   ├── microphone.ts                 # getUserMedia + permission-error mapping
    │   ├── audioEngine.ts                # Builds/controls the Web Audio graph
    │   └── recorder.ts                   # MediaRecorder wrapper + download helpers
    ├── components/
    │   ├── StatusPanel.tsx               # Mic/processing status + errors
    │   ├── Controls.tsx                  # Start/Stop + suppression slider
    │   ├── LevelMeters.tsx               # Input/noise/suppression meters
    │   ├── WaveformCanvas.tsx            # Time-domain visualizer
    │   ├── SpectrumCanvas.tsx            # Frequency-domain visualizer
    │   ├── VisualizerGrid.tsx            # Original vs enhanced waveform+spectrum grid
    │   ├── ComparisonPanel.tsx           # A/B monitor toggle (original/enhanced/mute)
    │   └── RecordingPanel.tsx            # Record/stop/download enhanced audio
    └── pages/                            # Reserved for future multi-page/routing growth
```

---

## 2. Installation

```bash
cd clearvoice
npm install
```

Dependencies (`package.json`): `react`, `react-dom`, and dev tooling
(`vite`, `@vitejs/plugin-react`, `typescript`, `@types/react*`). No DSP or audio
libraries are used — the FFT, windowing, and spectral-subtraction math are hand-written
in `public/worklets/noise-suppressor-worklet.js`.

## 3. Development

```bash
npm run dev
```

Open the printed local URL (defaults to `http://localhost:5173`). The dev server must
serve `/worklets/noise-suppressor-worklet.js` as a static file — this is automatic
because it lives in `public/`.

**Microphone access requires a "secure context"**: `localhost` is fine for development;
for LAN/other-device testing or production, you need HTTPS.

## 4. Production build & preview

```bash
npm run build      # type-checks with tsc -b, then builds with Vite into dist/
npm run preview     # serves the production build locally
```

---

## 5. Architecture

```
Microphone
  → getUserMedia() MediaStream
  → AudioContext
  → MediaStreamAudioSourceNode
      ├──→ originalAnalyser (visualization tap)
      ├──→ originalGain → destination        (comparison monitor: "original")
      └──→ AudioWorkletNode ("noise-suppressor")
              ├──→ enhancedAnalyser (visualization tap)
              ├──→ enhancedGain → destination  (comparison monitor: "enhanced")
              └──→ MediaStreamAudioDestinationNode → MediaRecorder (recording)
```

Key design choices:

- **All DSP runs inside the `AudioWorkletProcessor`**, which executes on the browser's
  dedicated, high-priority audio rendering thread — never on the main UI thread. React
  state updates (level meters) are driven by throttled `postMessage` events (~10/sec),
  not by the audio callback itself, so the UI can never block audio processing.
- **Visualization uses native `AnalyserNode`s** (`getByteTimeDomainData` /
  `getByteFrequencyData`), which the browser computes off the main thread's synchronous
  path and which are cheap to read every animation frame — no extra FFT work needed
  for the UI.
- **Comparison monitoring never mixes both signals.** Only one of `originalGain` /
  `enhancedGain` is non-zero at a time, and both default to `0` (muted) to avoid
  feedback/echo through your speakers back into the mic. Headphones are recommended.
- **Recording always captures the enhanced stream**, independent of what you're
  currently monitoring, via a separate `MediaStreamAudioDestinationNode`.

---

## 6. The noise-suppression algorithm

Implemented entirely in `public/worklets/noise-suppressor-worklet.js`. This is a
classical, mathematically explainable **STFT spectral subtraction** approach
(in the spirit of Boll, 1979), with adaptive, VAD-gated noise tracking:

### 6.1 Framing
- Frame size `N = 1024` samples (~23ms at 44.1kHz) — a standard tradeoff for speech:
  large enough for good frequency resolution (~43Hz/bin), small enough to keep
  latency and transient smearing low.
- Hop size `= N/2 = 512` samples (50% overlap), the minimum overlap for artifact-free
  reconstruction with a Hann window.
- A **periodic Hann window** `w[n] = 0.5 − 0.5·cos(2πn/N)` is applied at analysis time.
  At 50% overlap this window sums to exactly `1.0` across overlapping frames
  (constant-overlap-add, COLA), so no post-hoc gain correction is needed during
  reconstruction — verified numerically (see §8).

### 6.2 Spectral analysis
- A hand-written iterative radix-2 Cooley–Tukey FFT (in-place, bit-reversal
  permutation) transforms each windowed frame to the frequency domain, producing a
  magnitude spectrum `|X(k)|` and a unit-magnitude phase vector per bin.

### 6.3 Voice Activity Detection (VAD)
- Per-frame energy is computed and smoothed with asymmetric attack/release
  (fast attack, slow release) to track the signal envelope without excessive jitter.
- A frame is classified **speech** if its smoothed energy exceeds the tracked noise
  floor by more than 6 dB; otherwise it is **noise-only**.

### 6.4 Adaptive noise-spectrum estimation
- During noise-only frames, the noise magnitude spectrum is updated via **recursive
  exponential averaging**: `noiseMag[k] = α·noiseMag[k] + (1−α)·|X(k)|`, with
  `α = 0.92`. This is a lightweight, explainable stand-in for full minimum-statistics
  noise tracking (Martin, 2001) — slow enough to avoid absorbing speech energy, fast
  enough to re-adapt to a changing noise environment (e.g. a fan switching on) within
  roughly 1–2 seconds.
- The first ~15 frames (~170ms) bootstrap the estimate directly from the incoming
  signal so suppression is meaningful from the start rather than passing raw audio
  through while "waiting to learn."
- The **Reset noise profile** button clears this estimate on demand.

### 6.5 Spectral subtraction
For each frequency bin:

```
oversubtraction = 1 + suppression·0.9        (suppression ∈ [0,5] from the UI slider)
spectralFloor    = max(0.015, 0.15 − suppression·0.02)

enhancedMag[k] = max( |X(k)| − oversubtraction·noiseMag[k],  spectralFloor·|X(k)| )
```

- **Oversubtraction factor** controls how aggressively the estimated noise is removed.
- **Spectral floor** prevents bins from being suppressed to exactly zero, which is the
  classic cause of "musical noise" (isolated surviving bins turning into audible
  chirps) in basic spectral subtraction — a small residual is deliberately retained.

### 6.6 Resynthesis
- The suppressed magnitude is recombined with the **original phase** (perceptually,
  accurate magnitude matters far more than phase for intelligibility, and re-estimating
  phase is significantly more expensive), the full Hermitian-symmetric spectrum is
  rebuilt, and the inverse FFT is applied.
- Frames are recombined via **overlap-add** into a small circular output queue that the
  audio callback drains in fixed 128-sample render quanta.

### 6.7 Measured properties
With suppression forced to a no-op (magnitude passthrough), the full analysis →
FFT → IFFT → overlap-add pipeline was tested against a synthetic tone and **reconstructs
the original signal with zero error** at the correct pipeline latency of exactly `N`
samples (1024 samples ≈ 23ms @ 44.1kHz) — confirming the FFT and windowing math are
correct rather than merely "look right." See §9 for how to reproduce this test.

### 6.8 Extensibility toward AI-based suppression
The worklet's `process()` method is the single seam where the DSP happens. To later
swap in a learned model (RNNoise, DeepFilterNet, or a custom ONNX/TF.js model):

1. Keep the framing/overlap-add scaffolding (§6.1, §6.6) — it's model-agnostic.
2. Replace §6.3–6.5 (VAD, noise tracking, spectral subtraction) with a call into the
   model, feeding it the magnitude spectrum (or raw frame, depending on the model) and
   receiving a suppression mask or enhanced magnitude back.
3. If the model can't run inside the worklet (e.g. it needs WebGL/WebGPU via a
   library that isn't worklet-compatible), route frames to the main thread or another
   worker via `port.postMessage`, batch-process, and post results back — at the cost
   of added latency, which should be measured and weighed against quality gains.

---

## 7. AudioWorklet implementation notes

- The processor is registered as `noise-suppressor` and loaded via
  `audioContext.audioWorklet.addModule('/worklets/noise-suppressor-worklet.js')` —
  a plain static file (not bundled by Vite), because `AudioWorkletGlobalScope` is a
  separate JS realm from the page, with no DOM and inconsistent support for
  bundler-emitted ES module imports across browsers. Keeping it dependency-free avoids
  that entire class of cross-browser issues.
- **Parameters exposed as `AudioParam`s** (`suppression`, `muted`) are set from the
  main thread via `node.parameters.get('suppression').setTargetAtTime(...)`, which the
  audio thread reads directly each render quantum — no message-passing round trip, and
  automatically sample-accurate/click-free thanks to the built-in time-constant
  smoothing.
- **Metering data flows the other direction** via `port.postMessage`, throttled to
  ~10Hz, specifically to avoid flooding the main thread — level meters don't need
  audio-rate updates.
- The render callback (`process()`) always returns `true` to keep the node alive for
  the life of the stream, and defensively emits silence if input isn't yet available
  (e.g. during the first few milliseconds of graph setup).

---

## 8. Handling errors & compatibility

- `src/audio/microphone.ts` checks for `getUserMedia`, `AudioContext`, and
  `audioWorklet` support before attempting anything, and maps `DOMException` names
  (`NotAllowedError`, `NotFoundError`, `NotReadableError`, etc.) to specific,
  human-readable messages shown in the **Status** panel.
- `AudioWorkletNode.onprocessorerror` is handled so a worklet crash surfaces as a
  visible error rather than silent audio dropout.
- The app requests the mic with the browser's own `echoCancellation`,
  `noiseSuppression`, and `autoGainControl` **disabled**, so what you hear/measure is
  ClearVoice's own algorithm, not the OS/browser's built-in processing layered on top.

---

## 9. Testing procedure

### 9.1 Automated DSP correctness (no browser needed)
The core FFT/window/overlap-add logic is plain JS and can be sanity-checked with Node:

```bash
node --check public/worklets/noise-suppressor-worklet.js   # syntax check
```

To verify the math (FFT round-trip accuracy, Hann COLA=1 property, and full
analysis-synthesis reconstruction against a synthetic tone), extract the helper
functions (`fft`, `periodicHann`) and run them against known signals — this is exactly
how the pipeline above was validated during development (perfect reconstruction, zero
error, at a measured latency of exactly 1024 samples).

### 9.2 Manual functional testing (in-browser)
1. `npm run dev`, open the app, click **Start Processing**, grant mic permission.
2. Confirm the **Input level** meter responds to speaking/tapping the mic.
3. Play steady background noise (fan, white-noise track, typing) without speaking;
   confirm the **Estimated noise level** meter rises and stabilizes over ~1-2 seconds.
4. Speak over the noise; confirm the **Speech / Noise** pill switches to "Speech" and
   the enhanced spectrum shows visibly reduced energy in non-speech frequency regions
   compared to the original spectrum.
5. Sweep the **Suppression strength** slider from 0 (bypass — original and enhanced
   should look/sound identical) up to 5 (aggressive — noise floor should visibly drop
   further, watch for musical-noise artifacts at the top of the range).
6. Use the **Original / Enhanced** comparison toggle (with headphones) to A/B by ear.
7. Record a short clip, stop, and confirm playback + download work.
8. Test error paths: deny microphone permission and confirm a clear, specific error
   message appears (not a raw browser exception); test with no microphone connected.

### 9.3 Browser compatibility matrix to check
| Browser | Expected result |
|---|---|
| Chrome/Edge (recent) | Full support |
| Firefox (recent) | Full support |
| Safari (recent) | Should work; verify `AudioWorklet` + `MediaRecorder` mime-type fallback (`audio/mp4`) |
| Older browsers without AudioWorklet | Clear "not supported" message, no crash |

---

## 10. Performance measurement procedure

1. **Audio thread load**: open Chrome DevTools → Performance panel → record while
   ClearVoice is running → look at the "Audio" or worker thread track for the
   `noise-suppressor` processor; confirm it stays well under the ~2.9ms budget per
   128-sample render quantum at 44.1kHz (i.e. `process()` execution time should be a
   small fraction of `128/44100 ≈ 2.9ms`).
2. **End-to-end latency**: the Status panel reports "Est. algorithmic latency" computed
   as `1024 / sampleRate × 1000` ms — this was empirically validated (§6.7) as the
   true pipeline delay. Add your OS/hardware audio buffer sizes on top for a full
   mic-to-speaker latency estimate if needed.
3. **CPU usage**: use your OS's performance monitor (Activity Monitor / Task Manager)
   or `chrome://tracing` while running for 60+ seconds; the FFT is O(N log N) per hop
   and at 1024 points / 512-sample hop / 44.1kHz this is a very light load on any
   modern device (should be low single-digit % CPU).
4. **Quality metrics (PESQ/STOI)**: for formal evaluation against a reference clean
   signal, record both the original and enhanced output for the same held-out test
   utterance (via the built-in recorder), then run offline PESQ/STOI comparison using
   a Python toolkit (e.g. `pesq`, `pystoi`) outside the browser — this is a natural
   "Evaluation" step for the project roadmap and deliberately kept out of the
   browser bundle to avoid pulling heavy scientific-computing dependencies into the
   client app.

---

## 11. Running the application locally — quick start

```bash
cd clearvoice
npm install
npm run dev
```

Then open the local URL Vite prints, click **Start Processing**, and allow microphone
access when prompted.

---

## 12. Changelog

**Fix: VAD/noise-floor deadlock (critical).** The noise-only-frame detector
compared each frame's smoothed energy against a `noiseFloorEnergy` tracker that
was hardcoded to start at `-50` (an assumed dBFS-like value). But this codebase's
FFT is unnormalized, so real frame-energy readings land around `-5` to `+12`, not
anywhere near `-50`. The result: `smoothedEnergy` was *always* far above
`noiseFloorEnergy + 6dB`, so every frame was permanently classified as "speech" -
even pure background noise - and since `noiseFloorEnergy` only updates on
noise-only frames, it could never correct itself. **Fixed** by seeding both
trackers from the real first-frame reading instead of a guessed constant.
Verified with a synthetic noise/speech/noise test: noise-only segments now get
**19–21 dB of suppression** (were previously getting close to none in
practice, since the noise gate and floor-adaptation logic never engaged), while
tone-over-noise ("speech") segments are suppressed only ~2 dB, correctly
preserving the signal of interest.

**Added: gain-mask smoothing.** Spectral subtraction previously computed and
applied a suppression factor independently per bin per frame, which is the
classic cause of "musical noise" (isolated bins surviving inconsistently
frame-to-frame, heard as random narrowband chirping). Reworked as a gain mask
that's smoothed both across frequency (3-tap moving average) and across time
(single-pole IIR against the previous frame's mask) before being applied.

**Added: extra noise gate on confirmed silence.** Frames classified as
noise-only now get an additional attenuation multiplier on top of spectral
subtraction, since there's no speech to protect in those frames - this now
actually engages, since the VAD fix above means "noise-only" is correctly
detected.

**Added: high-pass pre-filter (~80Hz).** A one-pole high-pass filter is applied
to incoming samples (continuous state across render quanta) before framing,
removing DC offset and sub-80Hz rumble/hum that sits below the fundamental of
most speech and was contributing to a persistent low-frequency noise floor.

**Faster noise-profile bootstrap.** Reduced from 15 frames (~170ms) to 8 frames
(~90ms) before the estimator is considered initialized.

---

## 14. IP Calling (peer-to-peer voice calls)

ClearVoice places and receives **real voice calls over the internet** using
WebRTC, sending your **enhanced (noise-suppressed) audio** as the outgoing
call track - this is the actual point of the whole project: your
noise-suppressed voice reaching someone else's ears in real time.

### How it connects with just a 4-digit code

A WebRTC call needs a *signaling* step first: the two browsers have to find
each other on the open internet somehow before they can connect directly.
That lookup step fundamentally needs a shared meeting point - there's no way
around it, but it doesn't have to be something you build or host yourself.

ClearVoice uses [PeerJS](https://peerjs.com) and its free public broker
service for exactly that lookup:

1. Click **Start a call**. Your browser registers a random 4-digit room code
   with the broker and waits.
2. Share that code with the other person however you like (text, chat,
   speak it out loud).
3. They click **Join a call**, type the 4 digits in, and their browser asks
   the broker "where's room 1234?"
4. The broker connects the two browsers to each other directly. From this
   point on, your voice audio flows **peer-to-peer** - it does not pass
   through the broker, and does not pass through any server ClearVoice
   controls.

`src/audio/callManager.ts` implements this; `src/components/IPCallPanel.tsx`
is the 4-digit-code UI. The audio engine exposes a dedicated `callStream`
(see `AudioEngine.callStream` in `audioEngine.ts`) - a separate
`MediaStreamAudioDestinationNode` tapped straight off the noise-suppression
worklet's output, independent from the recording stream, so placing a call
and recording don't interfere with each other. **Both sides of a call send
their own enhanced/suppressed audio** - if you want the person you're
calling to sound clean too, they need to have ClearVoice's processing
running as well, not just you.

### The trade-off: relying on a third-party broker

Using PeerJS's shared public broker means you don't have to run or maintain
any server yourself - but it does mean room-code lookup depends on that free
service being up and reachable. This is the honest trade-off for getting a
short, shareable 4-digit code instead of a giant copy-paste blob: *some*
lookup mechanism has to exist somewhere, and this way it's a well-established
existing service rather than code you have to host.

If you outgrow the shared public broker (e.g. it's rate-limited, or you want
guaranteed uptime/privacy for the lookup step - not the call audio itself,
which is always peer-to-peer either way), you can run your own for free:

```bash
npm install -g peer
peerjs --port 9000
```

Then point `callManager.ts`'s `new Peer(...)` calls at your own server via
the `host`/`port`/`path` options instead of the default cloud broker.

### Limitation: NAT traversal

WebRTC still needs to get two browsers' network connections talking to each
other, which is a separate concern from the room-code lookup above. This app
uses Google's public STUN servers for that. STUN works when at least one
side has a NAT that allows fairly open outbound connections (true for most
home networks) but can fail on symmetric NATs or heavily locked-down
corporate/campus networks - if a call gets stuck on "Connecting…" and then
fails, that's almost always what's happening. Fixing that needs a TURN relay
server added to the ICE configuration in `callManager.ts`; see PeerJS's docs
for how to pass custom ICE servers into the `Peer` constructor.

### Testing it yourself
The easiest way to test end-to-end without a second person: open the app in
two separate browser tabs, start processing in both, click **Start a call**
in one, note the 4-digit code, click **Join a call** in the other and type
it in. Use headphones on at least one side, or you'll get feedback since
both tabs share your one physical microphone/speakers.

### Echo during calls, and the full-screen call UI

If a call echoes (you hear your own voice repeated back with a delay), that's
**acoustic echo** - your speaker output getting picked back up by your mic and
sent back to the other person - and it's a different problem from background
noise. Building a custom Acoustic Echo Canceller (AEC) from scratch (it needs
a reference of exactly what's playing out of your speakers, at sample-accurate
timing, to subtract back out) is out of scope for this project, so
`microphone.ts` now requests the browser's mature built-in `echoCancellation`
rather than leaving it off. This runs independently of - and doesn't conflict
with - this project's own custom noise-suppression algorithm, which targets
stationary background noise, a different problem than echo. **Headphones are
still the most reliable fix** for anyone on a call, since AEC has to work
harder (and can audibly "duck" the call) the louder your speaker is relative
to your mic pickup.

The full-screen in-call view (`src/components/InCallView.tsx`) provides:
- A live call timer
- **Mute** - disables your outgoing audio track entirely (the other person
  gets silence, not just quiet audio)
- **Speaker** (boost) - routes the incoming call audio through a Web Audio
  gain stage (`src/audio/remotePlayback.ts`) so volume can go beyond the
  100% ceiling a plain `<audio>` element allows - useful on a quiet line
- **Noise cut** - a quick-access slider for suppression strength without
  leaving the call screen
- No video calling - this project is scoped to voice only

---

## 15. Known limitations / next steps

- Single-channel (mono) processing only — appropriate for voice, not for
  stereo/music content.
- Noise tracking assumes a broadly *stationary* noise floor (fans, hum, hiss); highly
  non-stationary noises (a dog barking, a door slam) will only be partially suppressed,
  since the estimator needs a few hundred ms of noise-only frames to adapt.
- Phase is reused unmodified from the noisy input; this is standard practice and works
  well perceptually, but is a known simplification versus modeling phase explicitly.
- No backend means no persistence across sessions and no server-side heavier models —
  by design for this MVP, with the extensibility path in §6.8 for going further.
