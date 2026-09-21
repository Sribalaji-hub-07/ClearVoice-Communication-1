// Thin wrapper around MediaRecorder that captures the ENHANCED
// (post-suppression) audio stream produced by AudioEngine's
// recorderDestination, and exposes a simple start/stop/download API.

export interface RecordingResult {
  blob: Blob;
  url: string;
  mimeType: string;
  durationMs: number;
}

function pickMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  for (const type of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(type)) {
      return type;
    }
  }
  return '';
}

export class AudioRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];
  private startTime = 0;
  private mimeType = '';

  get isRecording(): boolean {
    return this.recorder?.state === 'recording';
  }

  start(stream: MediaStream): boolean {
    if (typeof MediaRecorder === 'undefined') return false;
    this.mimeType = pickMimeType();
    this.chunks = [];
    try {
      this.recorder = new MediaRecorder(stream, this.mimeType ? { mimeType: this.mimeType } : undefined);
    } catch {
      this.recorder = new MediaRecorder(stream);
    }
    this.recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };
    this.startTime = performance.now();
    this.recorder.start(250); // gather data every 250ms so we're never far behind
    return true;
  }

  stop(): Promise<RecordingResult | null> {
    return new Promise((resolve) => {
      if (!this.recorder) {
        resolve(null);
        return;
      }
      const durationMs = performance.now() - this.startTime;
      this.recorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.mimeType || 'audio/webm' });
        const url = URL.createObjectURL(blob);
        resolve({ blob, url, mimeType: this.mimeType || blob.type, durationMs });
        this.recorder = null;
      };
      this.recorder.stop();
    });
  }
}

export function downloadBlob(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function extensionForMimeType(mimeType: string): string {
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('mp4')) return 'mp4';
  return 'webm';
}
