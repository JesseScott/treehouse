/** The middle value of a list of numbers (the mean of the middle two when the count is even). */
export function median(values) {
  if (values.length === 0) throw new Error('median of no values');
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** The value below which `p` (0 to 1) of the values fall, by the nearest-rank method. */
export function percentile(values, p) {
  if (values.length === 0) throw new Error('percentile of no values');
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(sorted.length, Math.max(1, Math.ceil(p * sorted.length)));
  return sorted[rank - 1];
}
