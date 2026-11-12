import { describe, expect, it } from 'vitest';
import { parseFlags } from './flags';

const prod = { dev: false, reducedMotion: false };

describe('parseFlags', () => {
  it('keeps the debug API off in production by default', () => {
    expect(parseFlags('', prod)).toEqual({ harness: false, motion: true });
  });

  it('turns the debug API on with ?harness=1 only', () => {
    expect(parseFlags('?harness=1', prod).harness).toBe(true);
    expect(parseFlags('?harness=0', prod).harness).toBe(false);
    expect(parseFlags('?harness', prod).harness).toBe(false);
  });

  it('always exposes the debug API in dev', () => {
    expect(parseFlags('', { dev: true, reducedMotion: false }).harness).toBe(true);
  });

  it('turns animation off with ?motion=off or reduced motion', () => {
    expect(parseFlags('?harness=1&motion=off', prod).motion).toBe(false);
    expect(parseFlags('', { dev: false, reducedMotion: true }).motion).toBe(false);
    expect(parseFlags('?motion=on', prod).motion).toBe(true);
  });
});
