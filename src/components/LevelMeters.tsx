import type { LevelReport } from '../audio/types';

interface Props {
  levels: LevelReport | null;
  suppression: number;
}

function Meter({
  label,
  value,
  className,
  displayValue,
}: {
  label: string;
  value: number;
  className: string;
  displayValue: string;
}) {
  const pct = Math.max(0, Math.min(100, value * 100));
  return (
    <div className="meter-block">
      <div className="meter-label-row">
        <span>{label}</span>
        <span className="meter-value">{displayValue}</span>
      </div>
      <div className="meter-track">
        <div className={`meter-fill ${className}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function LevelMeters({ levels, suppression }: Props) {
  const input = levels?.inputLevel ?? 0;
  const noise = levels?.noiseLevel ?? 0;
  const suppressionPct = suppression / 5;

  return (
    <div className="panel">
      <p className="panel-title">
        Live Levels
        {levels && (
          <span
            className="pill"
            style={{
              background: levels.speechProbability > 0.5 ? 'rgba(63,214,176,0.15)' : 'rgba(148,163,184,0.12)',
              color: levels.speechProbability > 0.5 ? '#3fd6b0' : '#94a3b8',
            }}
          >
            {levels.speechProbability > 0.5 ? 'Speech' : 'Noise / Silence'}
          </span>
        )}
      </p>

      <Meter label="Input level" value={input} className="input" displayValue={`${Math.round(input * 100)}%`} />
      <Meter
        label="Estimated noise level"
        value={noise}
        className="noise"
        displayValue={`${Math.round(noise * 100)}%`}
      />
      <Meter
        label="Suppression amount"
        value={suppressionPct}
        className="suppression"
        displayValue={suppression === 0 ? 'Bypass' : `${suppression.toFixed(1)} / 5.0`}
      />
    </div>
  );
}
