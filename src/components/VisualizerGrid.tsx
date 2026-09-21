import WaveformCanvas from './WaveformCanvas';
import SpectrumCanvas from './SpectrumCanvas';

interface Props {
  originalAnalyser: AnalyserNode | null;
  enhancedAnalyser: AnalyserNode | null;
  active: boolean;
}

export default function VisualizerGrid({ originalAnalyser, enhancedAnalyser, active }: Props) {
  return (
    <div className="panel">
      <p className="panel-title">Waveform &amp; Spectrum</p>
      <div className="viz-grid">
        <div className="canvas-card">
          <div className="canvas-card-title">Original — waveform</div>
          <WaveformCanvas analyser={originalAnalyser} color="#5aa9f2" active={active} />
        </div>
        <div className="canvas-card">
          <div className="canvas-card-title">Enhanced — waveform</div>
          <WaveformCanvas analyser={enhancedAnalyser} color="#3fd6b0" active={active} />
        </div>
        <div className="canvas-card">
          <div className="canvas-card-title">Original — spectrum (0–8kHz)</div>
          <SpectrumCanvas analyser={originalAnalyser} color="#5aa9f2" active={active} />
        </div>
        <div className="canvas-card">
          <div className="canvas-card-title">Enhanced — spectrum (0–8kHz)</div>
          <SpectrumCanvas analyser={enhancedAnalyser} color="#3fd6b0" active={active} />
        </div>
      </div>
    </div>
  );
}
