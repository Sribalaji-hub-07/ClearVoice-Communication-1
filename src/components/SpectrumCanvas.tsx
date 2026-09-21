import { useEffect, useRef } from 'react';

interface Props {
  analyser: AnalyserNode | null;
  color: string;
  active: boolean;
}

/**
 * Draws a live frequency-domain bar spectrum from an AnalyserNode.
 * getByteFrequencyData already gives us a windowed FFT magnitude
 * spectrum computed natively by the browser - ideal for visualization
 * without adding extra main-thread DSP work.
 */
export default function SpectrumCanvas({ analyser, color, active }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const binCount = analyser?.frequencyBinCount ?? 1024;
    const dataArray = new Uint8Array(binCount);

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      ctx.clearRect(0, 0, width, height);

      if (!analyser || !active) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      analyser.getByteFrequencyData(dataArray);

      // Only show up to ~8kHz (speech-relevant band) for a more legible
      // display rather than compressing the whole Nyquist range into a
      // few visible pixels.
      const usableBins = Math.floor((8000 / (analyser.context.sampleRate / 2)) * binCount);
      const bins = Math.min(usableBins, binCount);
      const barWidth = width / bins;

      for (let i = 0; i < bins; i++) {
        const v = dataArray[i] / 255;
        const barHeight = v * height;
        const x = i * barWidth;
        const gradient = ctx.createLinearGradient(0, height - barHeight, 0, height);
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(x, height - barHeight, Math.max(1, barWidth - 1), barHeight);
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [analyser, active, color]);

  return (
    <canvas ref={canvasRef} style={{ width: '100%', height: '120px' }} aria-label="Frequency spectrum" />
  );
}
