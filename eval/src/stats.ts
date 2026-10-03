// Wilson score interval for a binomial proportion (RFC-001 §12).

export interface Interval {
  p: number; // observed proportion
  centre: number;
  halfWidth: number;
  low: number;
  high: number;
}

export function wilson(successes: number, n: number, z = 1.96): Interval {
  if (n <= 0) return { p: 0, centre: 0, halfWidth: 0, low: 0, high: 0 };
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const halfWidth = (z / denom) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return { p, centre, halfWidth, low: Math.max(0, centre - halfWidth), high: Math.min(1, centre + halfWidth) };
}

export function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

export function median(xs: number[]): number {
  return percentile(xs, 0.5);
}

/** Nearest-rank percentile. */
export function percentile(xs: number[], q: number): number {
  if (xs.length === 0) return NaN;
  const sorted = [...xs].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil(q * sorted.length));
  return sorted[rank - 1];
}
