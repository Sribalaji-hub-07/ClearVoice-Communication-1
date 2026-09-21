interface Props {
  isRunning: boolean;
  isStarting: boolean;
  suppression: number;
  onStart: () => void;
  onStop: () => void;
  onSuppressionChange: (value: number) => void;
  onResetNoiseProfile: () => void;
}

export default function Controls({
  isRunning,
  isStarting,
  suppression,
  onStart,
  onStop,
  onSuppressionChange,
  onResetNoiseProfile,
}: Props) {
  return (
    <div className="panel">
      <p className="panel-title">Controls</p>

      <div className="button-row">
        <button className="btn btn-primary" onClick={onStart} disabled={isRunning || isStarting}>
          {isStarting ? 'Starting…' : 'Start Processing'}
        </button>
        <button className="btn btn-danger" onClick={onStop} disabled={!isRunning}>
          Stop
        </button>
      </div>

      <div className="slider-block">
        <div className="slider-label-row">
          <span>Suppression strength</span>
          <span className="slider-value">
            {suppression === 0 ? 'Bypass' : suppression.toFixed(1)}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={5}
          step={0.1}
          value={suppression}
          onChange={(e) => onSuppressionChange(parseFloat(e.target.value))}
        />
        <p className="helper-text">
          0 = raw microphone passthrough (bypass). Higher values increase the spectral
          oversubtraction factor, removing more stationary noise at the cost of a small
          risk of "musical noise" artifacts on very aggressive settings.
        </p>
      </div>

      <button
        className="btn"
        style={{ width: '100%', marginTop: 14 }}
        onClick={onResetNoiseProfile}
        disabled={!isRunning}
      >
        Reset noise profile
      </button>
      <p className="helper-text">
        Forces the noise estimator to relearn the background noise from scratch — useful
        if your environment changed (e.g. you turned on a fan or moved rooms).
      </p>
    </div>
  );
}
