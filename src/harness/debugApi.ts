import { moveCamera, projectionName, whenMapIdle } from '../map/camera';
import { currentMap, mapWhenCreated } from '../map/mapRegistry';
import { placeKey } from '../geocode/normalize';
import { coverageOf } from '../geocode/treePlaces';
import { screenOf, useAppStore } from '../state/appStore';
import { flags } from './flags';
import type { PlaceLocation, TreehouseDebugApi, TreehouseState } from './types';

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
    screen: screenOf(store),
    library: {
      loaded: store.libraryLoaded,
      imports: store.library.map(({ id, name, people, families, rootId }) => ({
        id,
        name,
        people,
        families,
        rootId,
      })),
    },
    tree: store.open && {
      importId: store.open.record.id,
      name: store.open.record.name,
      people: store.open.record.people,
      families: store.open.record.families,
      warnings: store.open.record.warnings,
      rootId: store.open.record.rootId,
    },
    import: {
      busy: store.importing,
      attempts: store.importAttempts,
      error: store.importError,
      lastMs: store.lastImportMs,
      alreadyImported: store.alreadyImported,
    },
    focusedPersonId: store.focusedPersonId,
    threads: { lineage: 0, family: 0, ancestors: 0, migration: 0 },
    geocode: {
      busy: store.geocoding,
      error: store.geocodeError,
      ...coverageOf(store.places),
      pinned: store.places.filter((p) => sourceOf(p.result) === 'manual').length,
      online: store.places.filter((p) => sourceOf(p.result) === 'online').length,
    },
    placeReview: { selected: store.selectedPlaceKey !== null, pinning: store.pinning },
    onlineLookup: { ...store.online },
  };
}

const sourceOf = (result: PlaceLocation) => (result.status === 'unresolved' ? null : result.source);

function place(text: string): PlaceLocation | null {
  const key = placeKey(text);
  const result = useAppStore.getState().places.find((p) => p.key === key)?.result;
  if (!result) return null;
  if (result.status === 'unresolved') return { status: 'unresolved' };
  const { status, lng, lat, level, source } = result;
  return { status, lng, lat, level, source };
}

/** Resolves once the library has been read and no import, geocoding or lookup is running. */
function whenDataSettled(): Promise<void> {
  const settled = () => {
    const { libraryLoaded, importing, geocoding, online } = useAppStore.getState();
    return libraryLoaded && !importing && !geocoding && !online.running;
  };
  if (settled()) return Promise.resolve();
  return new Promise((resolve) => {
    const unsubscribe = useAppStore.subscribe(() => {
      if (settled()) {
        unsubscribe();
        resolve();
      }
    });
  });
}

async function whenIdle(): Promise<void> {
  await whenDataSettled();
  await whenMapIdle(await mapWhenCreated());
}

const api: TreehouseDebugApi = {
  state,
  whenIdle,
  place,
  // Stub: focusing a person and flying to their birthplace arrives with M3.
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
