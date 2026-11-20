import { useEffect } from 'react';
import { currentMap } from './mapRegistry';

type Box = Pick<DOMRect, 'top' | 'bottom' | 'left' | 'right'>;

/**
 * How much of the map's bottom edge the side panel covers, in pixels: on a phone the panel is a
 * sheet along the bottom (styles.css), and the camera should centre places in the map above it.
 * Zero when the panel sits beside the map, as it does on a wider screen.
 */
export function coveredBottom(panel: Box, map: Box): number {
  const width = map.right - map.left;
  const spansMap = panel.right - panel.left >= width * 0.8;
  const reachesBottom = panel.bottom >= map.bottom - 80;
  if (!spansMap || !reachesBottom || width <= 0) return 0;
  return Math.max(0, Math.round(map.bottom - panel.top));
}

/** Keeps the map's padding in step with the panel, so flights land in the part you can see. */
export function usePanelPadding(screen: string, mapLoaded: boolean): void {
  useEffect(() => {
    const map = currentMap();
    const panel = document.querySelector<HTMLElement>('.panel');
    if (!map || !mapLoaded || !panel) return;
    const update = () => {
      const bottom = coveredBottom(
        panel.getBoundingClientRect(),
        map.getContainer().getBoundingClientRect(),
      );
      if (map.getPadding().bottom !== bottom) map.setPadding({ top: 0, right: 0, bottom, left: 0 });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(panel);
    observer.observe(map.getContainer());
    return () => {
      observer.disconnect();
    };
  }, [screen, mapLoaded]);
}
