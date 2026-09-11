/** Shared mic plumbing, so the setup meter and the rehearsal both read the
 *  same numbers and light up at exactly the same moment. */

/** Audio poll rate. 25Hz is plenty for level and silence work, and unlike
 *  requestAnimationFrame it keeps running when the tab isn't frontmost. */
export const POLL_MS = 40;

export const DEFAULT_THRESHOLD = 0.045;
export const THRESHOLD_MIN = 0.006;
export const THRESHOLD_MAX = 0.22;

/** Silence has to fall below the talking line with room to spare, or a voice
 *  hovering right at the line would chatter the state back and forth. */
export function floorFor(threshold: number): number {
  return threshold * 0.45;
}

export function clampThreshold(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_THRESHOLD;
  return Math.min(THRESHOLD_MAX, Math.max(THRESHOLD_MIN, value));
}

/** RMS is bunched up near zero; the curve spreads speaking range across the
 *  meter so the control has usable resolution where it matters. */
export function meterPercent(rms: number): number {
  return Math.min(100, Math.sqrt(Math.max(0, rms) / 0.25) * 100);
}

export type MicHandle = {
  /** Current RMS of the input, 0..~1 */
  read: () => number;
  close: () => void;
};

export async function openMic(): Promise<MicHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true },
  });
  const context = new AudioContext();
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.7;
  source.connect(analyser);
  const buffer = new Float32Array(analyser.fftSize);

  return {
    read() {
      analyser.getFloatTimeDomainData(buffer);
      let sum = 0;
      for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
      return Math.sqrt(sum / buffer.length);
    },
    close() {
      stream.getTracks().forEach((t) => t.stop());
      void context.close();
    },
  };
}
