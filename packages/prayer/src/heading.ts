/**
 * Compass heading helpers. Pure and circular-safe: 359 and 1 are 2 degrees apart, not 358.
 * (Idea of a stability score from the spread of recent headings is borrowed from Mihrab's compass.)
 */
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const norm360 = (d: number) => ((d % 360) + 360) % 360;

export interface HeadingSmoother {
  /** Feed a raw heading (degrees), get the smoothed heading (0..360). */
  push(degrees: number): number;
  reset(): void;
}

/**
 * Exponential smoothing on the unit circle. alpha in (0,1]: higher = more responsive, lower = steadier.
 * The first sample is returned unchanged.
 */
export function createHeadingSmoother(alpha = 0.25): HeadingSmoother {
  if (!(alpha > 0 && alpha <= 1)) throw new RangeError("alpha must be in (0, 1]");
  let x: number | null = null;
  let y = 0;
  return {
    push(degrees) {
      const sx = Math.cos(rad(degrees));
      const sy = Math.sin(rad(degrees));
      if (x === null) { x = sx; y = sy; } else { x = x + alpha * (sx - x); y = y + alpha * (sy - y); }
      return norm360(deg(Math.atan2(y, x)));
    },
    reset() { x = null; y = 0; },
  };
}

/** Circular standard deviation of headings in degrees (0 = perfectly steady). */
export function headingSpread(samples: readonly number[]): number {
  if (samples.length < 2) return 0;
  let sx = 0;
  let sy = 0;
  for (const h of samples) { sx += Math.cos(rad(h)); sy += Math.sin(rad(h)); }
  const mean = deg(Math.atan2(sy, sx));
  let sum = 0;
  for (const h of samples) {
    const d = ((h - mean + 540) % 360) - 180;
    sum += d * d;
  }
  return Math.sqrt(sum / samples.length);
}

/** 0..100, 100 = still. Needs at least 4 samples; below that it reports a neutral 55. */
export function headingStability(samples: readonly number[]): number {
  if (samples.length < 4) return 55;
  return Math.min(100, Math.max(0, 100 - headingSpread(samples) * 6));
}
