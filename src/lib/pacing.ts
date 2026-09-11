/** How long a stage direction stays up in auto mode. Nobody speaks it, so the
 *  only job is to be readable and get out of the way. */

export const DEFAULT_DIRECTION_MS = 1800;
export const DIRECTION_MIN_MS = 400;
export const DIRECTION_MAX_MS = 6000;

export function clampDirectionMs(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_DIRECTION_MS;
  return Math.min(DIRECTION_MAX_MS, Math.max(DIRECTION_MIN_MS, Math.round(value)));
}

/**
 * The setting covers a glance at a short direction; a long paragraph earns more
 * time, but never more than double, so one wordy direction can't stall a scene.
 */
export function directionDwell(text: string, baseMs: number): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const scale = Math.min(2, 0.75 + words / 16);
  return Math.round(clampDirectionMs(baseMs) * scale);
}
