import type { MicError } from './types';

/**
 * Wraps navigator.mediaDevices.getUserMedia with browser-compatibility
 * checks and translates DOMException names into friendly MicError
 * objects the UI can render directly.
 */

export function checkBrowserSupport(): MicError | null {
  if (typeof window === 'undefined') {
    return { code: 'not-supported', message: 'Not running in a browser environment.' };
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return {
      code: 'not-supported',
      message:
        'This browser does not support microphone capture (getUserMedia). Try the latest Chrome, Edge, or Firefox.',
    };
  }
  const AC = window.AudioContext || (window as any).webkitAudioContext;
  if (!AC) {
    return { code: 'not-supported', message: 'This browser does not support the Web Audio API.' };
  }
  if (!('audioWorklet' in AudioContext.prototype)) {
    return {
      code: 'worklet-unsupported',
      message:
        'This browser does not support AudioWorklet, which ClearVoice requires for real-time processing. Please use an up-to-date Chromium or Firefox based browser, and make sure the page is served over HTTPS or localhost.',
    };
  }
  return null;
}

export async function requestMicrophoneStream(): Promise<
  { stream: MediaStream } | { error: MicError }
> {
  const support = checkBrowserSupport();
  if (support) return { error: support };

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        // Echo cancellation (AEC) is a genuinely different problem from
        // the noise suppression this project implements from scratch:
        // AEC needs a reference signal of what's playing out of your
        // speakers to subtract it back out of what the mic picks up.
        // That's out of scope to hand-roll here, and the browser's
        // built-in AEC is mature and effective - so it stays ON. Without
        // it, calls echo badly (your own voice gets picked back up by
        // your mic and sent back to the other person).
        echoCancellation: true,
        // We still do our own noise suppression, so the browser's
        // built-in noise suppression and auto-gain stay off to avoid
        // double-processing/masking our own algorithm's effect.
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
      video: false,
    });
    return { stream };
  } catch (err) {
    return { error: mapGetUserMediaError(err) };
  }
}

function mapGetUserMediaError(err: unknown): MicError {
  const name = err instanceof DOMException ? err.name : 'Unknown';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return {
        code: 'permission-denied',
        message:
          'Microphone access was denied. Click the padlock/site-info icon in your address bar and allow microphone access, then try again.',
      };
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return {
        code: 'no-device',
        message: 'No microphone was found. Connect a microphone and try again.',
      };
    case 'NotReadableError':
    case 'TrackStartError':
      return {
        code: 'in-use',
        message: 'The microphone could not be started - it may be in use by another application.',
      };
    default:
      return {
        code: 'unknown',
        message: err instanceof Error ? err.message : 'An unknown error occurred while accessing the microphone.',
      };
  }
}

export function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}
