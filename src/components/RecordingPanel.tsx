import type { RecordingResult } from '../audio/recorder';
import { downloadBlob, extensionForMimeType } from '../audio/recorder';

interface Props {
  isRecording: boolean;
  canRecord: boolean;
  onStart: () => void;
  onStop: () => void;
  recordings: RecordingResult[];
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function RecordingPanel({ isRecording, canRecord, onStart, onStop, recordings }: Props) {
  return (
    <div className="panel">
      <p className="panel-title">Recording</p>

      <div className="button-row">
        <button className="btn btn-primary" onClick={onStart} disabled={!canRecord || isRecording}>
          {isRecording ? 'Recording…' : 'Record enhanced output'}
        </button>
        <button className="btn btn-danger" onClick={onStop} disabled={!isRecording}>
          Stop
        </button>
      </div>
      <p className="helper-text">
        Recordings capture the noise-suppressed (enhanced) output, independent of your
        current comparison-monitor selection.
      </p>

      {recordings.length > 0 && (
        <div className="recording-list">
          {recordings.map((rec, i) => (
            <div className="recording-item" key={rec.url}>
              <audio controls src={rec.url} />
              <span className="recording-meta">{formatDuration(rec.durationMs)}</span>
              <button
                className="link-btn"
                onClick={() =>
                  downloadBlob(rec.url, `clearvoice-enhanced-${i + 1}.${extensionForMimeType(rec.mimeType)}`)
                }
              >
                Download
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
