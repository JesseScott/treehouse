/**
 * URL flags read once at startup.
 *
 * - `?harness=1` exposes `window.__treehouse` in a production build (it is always on in dev).
 * - `?motion=off` makes every camera move instant, so tests do not wait on animations.
 */
export interface HarnessFlags {
  /** Whether the debug API is exposed on `window`. */
  harness: boolean;
  /** Whether camera moves animate. */
  motion: boolean;
}

export function parseFlags(
  search: string,
  env: { dev: boolean; reducedMotion: boolean },
): HarnessFlags {
  const params = new URLSearchParams(search);
  return {
    harness: env.dev || params.get('harness') === '1',
    motion: params.get('motion') !== 'off' && !env.reducedMotion,
  };
}

let cached: HarnessFlags | undefined;

export function flags(): HarnessFlags {
  cached ??= parseFlags(window.location.search, {
    dev: import.meta.env.DEV,
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  });
  return cached;
}
