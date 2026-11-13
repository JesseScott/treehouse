import { describe, expect, it } from 'vitest';
import { median } from './stats.mjs';

describe('median', () => {
  it('ignores one outlier among three runs', () => {
    expect(median([280, 1474, 310])).toBe(310);
    expect(median([0.74, 0.86, 0.88])).toBe(0.86);
  });

  it('handles one value, even counts and unsorted input', () => {
    expect(median([5])).toBe(5);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('does not reorder the caller’s array and rejects an empty one', () => {
    const values = [3, 1, 2];
    median(values);
    expect(values).toEqual([3, 1, 2]);
    expect(() => median([])).toThrow();
  });
});
