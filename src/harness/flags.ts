/**
 * URL flags read once at startup.
 *
 * - `?harness=1` exposes `window.__treehouse` in a production build (it is always on in dev).
 * - `?motion=off` makes every camera move instant, so tests do not wait on animations. Otherwise
 *   the motion setting and the system's reduced-motion setting decide (`state/motion.ts`).
 */
export interface HarnessFlags {
  /** Whether the debug API is exposed on `window`. */
  harness: boolean;
  /** False with `?motion=off`: camera moves never animate, whatever the settings say. */
  motion: boolean;
}

export function parseFlags(search: string, env: { dev: boolean }): HarnessFlags {
  const params = new URLSearchParams(search);
  return {
    harness: env.dev || params.get('harness') === '1',
    motion: params.get('motion') !== 'off',
  };
}

let cached: HarnessFlags | undefined;

export function flags(): HarnessFlags {
  cached ??= parseFlags(window.location.search, { dev: import.meta.env.DEV });
  return cached;
}
