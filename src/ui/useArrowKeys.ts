import { useEffect } from 'react';
import type { Direction } from '../gedcom/relatives';
import { useAppStore } from '../state/appStore';

const KEYS: Record<string, Direction> = {
  ArrowUp: 'father',
  ArrowDown: 'child',
  ArrowLeft: 'previous',
  ArrowRight: 'next',
};

/** Typing, and arrows on the map itself, keep their usual meaning. */
const ownsArrows = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
    target.closest('.maplibregl-map') !== null);

/** Up for the father (shift+up the mother), down for a child, left and right along the row. */
export function useArrowKeys() {
  const stepFocus = useAppStore((s) => s.stepFocus);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || ownsArrows(event.target)) return;
      const direction = event.key === 'ArrowUp' && event.shiftKey ? 'mother' : KEYS[event.key];
      if (direction === undefined) return;
      event.preventDefault();
      stepFocus(direction);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [stepFocus]);
}
