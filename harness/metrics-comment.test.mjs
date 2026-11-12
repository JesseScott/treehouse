import { describe, expect, it } from 'vitest';
import { COMMENT_MARKER, renderComment } from './metrics-comment.mjs';

const report = (value, ok = true) => ({
  ok,
  commit: 'abcdef1234567',
  seconds: 30,
  steps: [{ name: 'Performance budgets', status: ok ? 'passed' : 'failed' }],
  tests: { unit: { passed: 30, total: 30 }, e2e: { passed: 9, total: 9 }, smoke: null },
  metrics: [
    { name: 'bundle: JS (gzip)', value, budget: 550, unit: 'kB', direction: 'max', ok },
    {
      name: 'lighthouse: performance',
      value: 0.9,
      budget: 0.7,
      unit: 'score',
      direction: 'min',
      ok: true,
    },
  ],
});

describe('metrics comment', () => {
  it('compares each metric with main', () => {
    const text = renderComment(report(500), report(490));
    expect(text.startsWith(COMMENT_MARKER)).toBe(true);
    expect(text).toContain('| bundle: JS (gzip) | 500 kB | 490 kB | +10 | ≤ 550 | pass |');
    expect(text).toContain('| lighthouse: performance | 0.9 | 0.9 | 0 | ≥ 0.7 | pass |');
  });

  it('still renders without a base report', () => {
    const text = renderComment(report(500), null);
    expect(text).toContain('| bundle: JS (gzip) | 500 kB | n/a | n/a | ≤ 550 | pass |');
    expect(text).toContain('No metrics from `main`');
  });

  it('names the failed steps', () => {
    const text = renderComment(report(600, false), report(490));
    expect(text).toContain('verify: FAILED');
    expect(text).toContain('Failed steps: Performance budgets');
    expect(text).toContain('**FAIL**');
  });
});
