import { moveCamera, projectionName, whenMapIdle } from '../map/camera';
import { currentMap, mapWhenCreated } from '../map/mapRegistry';
import { useAppStore } from '../state/appStore';
import { flags } from './flags';
import type { TreehouseDebugApi, TreehouseState } from './types';

function state(): TreehouseState {
  const map = currentMap();
  const store = useAppStore.getState();
  const center = map?.getCenter();
  return {
    app: { name: 'treehouse', version: __APP_VERSION__, commit: __APP_COMMIT__ },
    flags: { ...flags() },
    map: {
      loaded: store.mapLoaded,
      moving: map?.isMoving() ?? false,
      style: 'offline',
      projection: map ? projectionName(map) : 'unknown',
      center: { lng: center?.lng ?? 0, lat: center?.lat ?? 0 },
      zoom: map?.getZoom() ?? 0,
      bearing: map?.getBearing() ?? 0,
      pitch: map?.getPitch() ?? 0,
    },
    tree: null,
    focusedPersonId: store.focusedPersonId,
    threads: { lineage: 0, family: 0, ancestors: 0, migration: 0 },
    geocode: { places: 0, resolved: 0, approximate: 0, unresolved: 0 },
  };
}

async function whenIdle(): Promise<void> {
  await whenMapIdle(await mapWhenCreated());
}

const api: TreehouseDebugApi = {
  state,
  whenIdle,
  // Stub: there is no tree to focus in until the GEDCOM import (M1) and focus fly-to (M3) land.
  focus: async () => {
    await whenIdle();
    return { ok: false, reason: 'no-tree' };
  },
  flyTo: async (target) => {
    const map = await mapWhenCreated();
    await whenMapIdle(map);
    moveCamera(map, target, flags().motion);
    await whenMapIdle(map);
  },
};

/** Exposes `window.__treehouse` in dev and with `?harness=1`; otherwise does nothing. */
export function installDebugApi(): void {
  if (flags().harness) window.__treehouse = api;
}
