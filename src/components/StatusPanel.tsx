import type { MicPermissionState, ProcessingState } from '../audio/types';

interface Props {
  micPermission: MicPermissionState;
  processingState: ProcessingState;
  error: string | null;
  sampleRate: number | null;
  latencyMs: number | null;
}

function micLabel(state: MicPermissionState): { label: string; tone: 'ok' | 'warn' | 'error' | 'idle' } {
  switch (state) {
    case 'granted':
      return { label: 'Microphone access granted', tone: 'ok' };
    case 'requesting':
      return { label: 'Requesting microphone permission…', tone: 'warn' };
    case 'denied':
      return { label: 'Microphone access denied', tone: 'error' };
    case 'unavailable':
      return { label: 'No microphone available', tone: 'error' };
    default:
      return { label: 'Microphone not yet requested', tone: 'idle' };
  }
}

function processingLabel(state: ProcessingState): { label: string; tone: 'ok' | 'warn' | 'error' | 'idle' } {
  switch (state) {
    case 'running':
      return { label: 'Processing live', tone: 'ok' };
    case 'starting':
      return { label: 'Starting audio pipeline…', tone: 'warn' };
    case 'error':
      return { label: 'Processing error', tone: 'error' };
    default:
      return { label: 'Stopped', tone: 'idle' };
  }
}

export default function StatusPanel({ micPermission, processingState, error, sampleRate, latencyMs }: Props) {
  const mic = micLabel(micPermission);
  const proc = processingLabel(processingState);

  return (
    <div className="panel">
      <p className="panel-title">System Status</p>

      <div className="status-row">
        <span className={`status-dot ${mic.tone === 'idle' ? '' : mic.tone}`} />
        <span className="status-label">{mic.label}</span>
      </div>

      <div className="status-row">
        <span className={`status-dot ${proc.tone === 'idle' ? '' : proc.tone}`} />
        <span className="status-label">{proc.label}</span>
      </div>

      <div className="status-row">
        <span className="status-dot ok" style={{ opacity: sampleRate ? 1 : 0.25 }} />
        <span>Sample rate: {sampleRate ? `${sampleRate.toLocaleString()} Hz` : '—'}</span>
      </div>

      <div className="status-row">
        <span className="status-dot ok" style={{ opacity: latencyMs ? 1 : 0.25 }} />
        <span>Est. algorithmic latency: {latencyMs ? `${latencyMs.toFixed(0)} ms` : '—'}</span>
      </div>

      {error && <div className="error-banner">{error}</div>}
    </div>
  );
}
