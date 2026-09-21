import type { AudioEngineCallbacks, LevelReport, MonitorMode } from './types';
import { requestMicrophoneStream, stopStream, checkBrowserSupport } from './microphone';

const WORKLET_URL = '/worklets/noise-suppressor-worklet.js';
const WORKLET_NAME = 'noise-suppressor';

/**
 * AudioEngine owns the entire Web Audio graph:
 *
 *   getUserMedia() ---> MediaStreamSource ---+---> originalAnalyser (tap)
 *                                            |
 *                                            +---> originalGain ---> destination   (monitor: original)
 *                                            |
 *                                            +---> AudioWorkletNode (noise-suppressor)
 *                                                        |
 *                                                        +---> enhancedAnalyser (tap)
 *                                                        |
 *                                                        +---> enhancedGain ---> destination (monitor: enhanced)
 *                                                        |
 *                                                        +---> recorderDestination (MediaStreamDestination, for MediaRecorder)
 *
 * Only ONE of originalGain / enhancedGain is ever non-zero at a time
 * (controlled by setMonitorMode), so you never hear both layered, and
 * by default both are muted to avoid feedback/echo when not wearing
 * headphones. The analysers are always tapped (regardless of monitor
 * mode) so the visualizers keep working even while monitoring is off.
 */
export class AudioEngine {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;

  private originalAnalyser: AnalyserNode | null = null;
  private enhancedAnalyser: AnalyserNode | null = null;
  private originalGain: GainNode | null = null;
  private enhancedGain: GainNode | null = null;
  private recorderDestination: MediaStreamAudioDestinationNode | null = null;
  private callDestination: MediaStreamAudioDestinationNode | null = null;

  private callbacks: AudioEngineCallbacks;
  private monitorMode: MonitorMode = 'none';

  constructor(callbacks: AudioEngineCallbacks = {}) {
    this.callbacks = callbacks;
  }

  get context(): AudioContext | null {
    return this.audioContext;
  }

  get analysers(): { original: AnalyserNode | null; enhanced: AnalyserNode | null } {
    return { original: this.originalAnalyser, enhanced: this.enhancedAnalyser };
  }

  get recordingStream(): MediaStream | null {
    return this.recorderDestination?.stream ?? null;
  }

  /**
   * The enhanced (noise-suppressed) audio as a MediaStream, suitable for
   * handing directly to an RTCPeerConnection as the outgoing call track.
   * Kept as a separate destination node from `recordingStream` so calling
   * and recording can run independently without interfering with each
   * other.
   */
  get callStream(): MediaStream | null {
    return this.callDestination?.stream ?? null;
  }

  get isRunning(): boolean {
    return this.audioContext !== null && this.audioContext.state === 'running';
  }

  async start(): Promise<boolean> {
    this.callbacks.onStateChange?.('starting');

    const support = checkBrowserSupport();
    if (support) {
      this.callbacks.onError?.(support.message);
      this.callbacks.onStateChange?.('error');
      return false;
    }

    const micResult = await requestMicrophoneStream();
    if ('error' in micResult) {
      this.callbacks.onError?.(micResult.error.message);
      this.callbacks.onStateChange?.('error');
      return false;
    }
    this.mediaStream = micResult.stream;

    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AC({ latencyHint: 'interactive' });

      try {
        await this.audioContext.audioWorklet.addModule(WORKLET_URL);
      } catch (loadErr) {
        throw new Error(
          `Failed to load the audio processing module (${WORKLET_URL}). ` +
            'Make sure the dev/build server is serving the /worklets directory. ' +
            (loadErr instanceof Error ? loadErr.message : String(loadErr)),
        );
      }

      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

      this.originalAnalyser = this.audioContext.createAnalyser();
      this.originalAnalyser.fftSize = 2048;
      this.originalAnalyser.smoothingTimeConstant = 0.75;

      this.enhancedAnalyser = this.audioContext.createAnalyser();
      this.enhancedAnalyser.fftSize = 2048;
      this.enhancedAnalyser.smoothingTimeConstant = 0.75;

      this.originalGain = this.audioContext.createGain();
      this.originalGain.gain.value = 0;

      this.enhancedGain = this.audioContext.createGain();
      this.enhancedGain.gain.value = 0;

      this.recorderDestination = this.audioContext.createMediaStreamDestination();
      this.callDestination = this.audioContext.createMediaStreamDestination();

      this.workletNode = new AudioWorkletNode(this.audioContext, WORKLET_NAME, {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });

      this.workletNode.port.onmessage = (event) => {
        if (event.data?.type === 'levels') {
          const levels: LevelReport = {
            inputLevel: event.data.inputLevel,
            noiseLevel: event.data.noiseLevel,
            speechProbability: event.data.speechProbability,
            noiseFloorEnergy: event.data.noiseFloorEnergy,
          };
          this.callbacks.onLevels?.(levels);
        }
      };

      this.workletNode.onprocessorerror = () => {
        this.callbacks.onError?.('The audio processing worklet crashed. Try restarting processing.');
        this.callbacks.onStateChange?.('error');
      };

      // Wire the graph.
      this.sourceNode.connect(this.originalAnalyser);
      this.sourceNode.connect(this.originalGain);
      this.originalGain.connect(this.audioContext.destination);

      this.sourceNode.connect(this.workletNode);
      this.workletNode.connect(this.enhancedAnalyser);
      this.workletNode.connect(this.enhancedGain);
      this.enhancedGain.connect(this.audioContext.destination);
      this.workletNode.connect(this.recorderDestination);
      this.workletNode.connect(this.callDestination);

      this.applyMonitorMode();

      this.callbacks.onStateChange?.('running');
      return true;
    } catch (err) {
      this.callbacks.onError?.(err instanceof Error ? err.message : 'Failed to start audio processing.');
      this.callbacks.onStateChange?.('error');
      this.stop();
      return false;
    }
  }

  stop() {
    this.workletNode?.port.close();
    this.workletNode?.disconnect();
    this.sourceNode?.disconnect();
    this.originalAnalyser?.disconnect();
    this.enhancedAnalyser?.disconnect();
    this.originalGain?.disconnect();
    this.enhancedGain?.disconnect();
    this.recorderDestination?.disconnect();
    this.callDestination?.disconnect();

    stopStream(this.mediaStream);
    this.mediaStream = null;

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
    }

    this.audioContext = null;
    this.sourceNode = null;
    this.workletNode = null;
    this.originalAnalyser = null;
    this.enhancedAnalyser = null;
    this.originalGain = null;
    this.enhancedGain = null;
    this.recorderDestination = null;
    this.callDestination = null;

    this.callbacks.onStateChange?.('stopped');
  }

  /** 0 (no suppression / bypass) .. 5 (maximum suppression). */
  setSuppressionAmount(amount: number) {
    const param = this.workletNode?.parameters.get('suppression');
    if (param && this.audioContext) {
      param.setTargetAtTime(amount, this.audioContext.currentTime, 0.05);
    }
  }

  setMonitorMode(mode: MonitorMode) {
    this.monitorMode = mode;
    this.applyMonitorMode();
  }

  private applyMonitorMode() {
    if (!this.audioContext || !this.originalGain || !this.enhancedGain) return;
    const now = this.audioContext.currentTime;
    const target = { original: 0, enhanced: 0 };
    if (this.monitorMode === 'original') target.original = 1;
    if (this.monitorMode === 'enhanced') target.enhanced = 1;
    this.originalGain.gain.setTargetAtTime(target.original, now, 0.02);
    this.enhancedGain.gain.setTargetAtTime(target.enhanced, now, 0.02);
  }

  resetNoiseProfile() {
    this.workletNode?.port.postMessage({ type: 'reset-noise-profile' });
  }
}
