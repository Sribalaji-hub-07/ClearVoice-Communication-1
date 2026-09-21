// Shared types for the ClearVoice audio subsystem.
// Keeping these in one place makes it easy to see the full "contract"
// between the microphone, the audio engine, the worklet, and the UI.

export type MicPermissionState = 'idle' | 'requesting' | 'granted' | 'denied' | 'unavailable';

export type ProcessingState = 'stopped' | 'starting' | 'running' | 'error';

export type MonitorMode = 'none' | 'enhanced' | 'original';

export interface LevelReport {
  /** 0..1, smoothed input signal level (pre-suppression). */
  inputLevel: number;
  /** 0..1, estimated stationary noise energy level. */
  noiseLevel: number;
  /** 0 or 1 (could be fractional with a softer VAD later). */
  speechProbability: number;
  noiseFloorEnergy: number;
}

export interface AudioEngineCallbacks {
  onLevels?: (levels: LevelReport) => void;
  onError?: (message: string) => void;
  onStateChange?: (state: ProcessingState) => void;
}

/**
 * Thrown/reported when getUserMedia or AudioWorklet setup fails, with a
 * human-readable reason so the UI can show something more useful than
 * "NotAllowedError".
 */
export interface MicError {
  code:
    | 'permission-denied'
    | 'no-device'
    | 'not-supported'
    | 'in-use'
    | 'worklet-unsupported'
    | 'worklet-load-failed'
    | 'unknown';
  message: string;
}
