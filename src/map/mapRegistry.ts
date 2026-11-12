import type { Map as MapLibreMap } from 'maplibre-gl';

/** Holds the one live map so code outside React (the debug API) can reach it. */
let current: MapLibreMap | null = null;
let waiters: ((map: MapLibreMap) => void)[] = [];

export function registerMap(map: MapLibreMap | null): void {
  current = map;
  if (map) {
    for (const resolve of waiters) resolve(map);
    waiters = [];
  }
}

export function currentMap(): MapLibreMap | null {
  return current;
}

export function mapWhenCreated(): Promise<MapLibreMap> {
  if (current) return Promise.resolve(current);
  return new Promise((resolve) => waiters.push(resolve));
}
