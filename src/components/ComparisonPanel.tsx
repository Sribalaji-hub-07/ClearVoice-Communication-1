import type { MonitorMode } from '../audio/types';

interface Props {
  mode: MonitorMode;
  onChange: (mode: MonitorMode) => void;
  disabled: boolean;
}

const OPTIONS: { mode: MonitorMode; title: string; description: string }[] = [
  { mode: 'none', title: 'Muted', description: 'Nothing routed to speakers. Meters and visualizers still run.' },
  { mode: 'original', title: 'Original', description: 'Listen to the raw, unprocessed microphone signal.' },
  { mode: 'enhanced', title: 'Enhanced', description: 'Listen to the noise-suppressed output.' },
];

export default function ComparisonPanel({ mode, onChange, disabled }: Props) {
  return (
    <div className="panel">
      <p className="panel-title">Original vs. Enhanced Comparison</p>
      <div className="compare-grid">
        {OPTIONS.map((opt) => (
          <div
            key={opt.mode}
            className={`compare-card ${mode === opt.mode ? 'active' : ''}`}
            onClick={() => !disabled && onChange(opt.mode)}
            role="button"
            aria-pressed={mode === opt.mode}
            style={{ opacity: disabled ? 0.5 : 1, pointerEvents: disabled ? 'none' : 'auto' }}
          >
            <h4>{opt.title}</h4>
            <p>{opt.description}</p>
          </div>
        ))}
      </div>
      <p className="helper-text">
        ⚠️ Use headphones while monitoring "Original" or "Enhanced" to avoid feedback from your
        speakers being picked back up by the microphone.
      </p>
    </div>
  );
}
