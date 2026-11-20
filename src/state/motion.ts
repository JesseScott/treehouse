import { flags } from '../harness/flags';
import { useAppStore } from './appStore';

/** The motion choice in the app: follow the system's reduced-motion setting, or override it. */
export type MotionSetting = 'system' | 'on' | 'off';

/** The system's reduced-motion setting, read each time so a change applies at once. */
export function systemReducesMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * Whether camera moves animate now: never with `?motion=off`, else as chosen in the app, else
 * as the system says. With motion off, every move is a jump cut (`moveCamera`).
 */
export function motionOn(): boolean {
  if (!flags().motion) return false;
  const setting = useAppStore.getState().motion;
  return setting === 'on' || (setting === 'system' && !systemReducesMotion());
}
