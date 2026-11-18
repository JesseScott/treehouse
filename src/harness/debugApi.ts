import { moveCamera, projectionName, whenMapIdle } from '../map/camera';
import { currentMap, mapWhenCreated } from '../map/mapRegistry';
import { placeKey } from '../geocode/normalize';
import { coverageOf } from '../geocode/treePlaces';
import { placeVisits, peopleCountAt } from '../geocode/treePlaces';
import { MARKER_LAYERS, MARKER_SOURCE, markerCollection } from '../map/markerData';
import { screenOf, useAppStore } from '../state/appStore';
import { focusOf } from '../state/focus';
import { threadsOf } from '../state/threads';
import { threadCounts } from '../map/threadData';
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
    focus: focusState(store),
    markers: {
      places: store.open
        ? markerCollection(store.places, placeVisits(store.open.tree)).features.length
        : 0,
      rendered:
        map?.getSource(MARKER_SOURCE) && map.loaded()
          ? map.queryRenderedFeatures({ layers: [...MARKER_LAYERS] }).length
          : 0,
    },
    placeCard: {
      open: store.openedPlaceKey !== null,
      people:
        store.open && store.openedPlaceKey !== null
          ? peopleCountAt(placeVisits(store.open.tree).get(store.openedPlaceKey))
          : 0,
    },
    threads: threadCounts(threadsOf(store)),
    threadToggles: { ...store.threadsOn },
    journey: store.journey && {
      line: store.journey.line,
      stops: store.journey.stops.length,
      index: store.journey.index,
      personId: store.journey.stops[store.journey.index] ?? '',
      playing: store.journey.playing,
      speed: store.journey.speed,
    },
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

function focusState(store: ReturnType<typeof useAppStore.getState>): TreehouseState['focus'] {
  const focus = focusOf(store);
  if (!focus) return null;
  const { kind, label, path } = focus.relationship;
  const at = focus.place;
  return {
    personId: focus.person.id,
    relationship: { kind, label },
    pathLength: path.length,
    shownAt: at && {
      basis: at.basis,
      approximate: at.approximate,
      level: at.level,
      lng: at.lng,
      lat: at.lat,
    },
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
  focus: async (personId) => {
    await whenIdle();
    const store = useAppStore.getState();
    if (!store.open) return { ok: false, reason: 'no-tree' };
    if (!store.focusPerson(personId)) return { ok: false, reason: 'unknown-person' };
    await whenIdle();
    return { ok: true };
  },
  project: (at) => {
    const map = currentMap();
    if (!map) return null;
    const point = map.project([at.lng, at.lat]);
    const box = map.getCanvas().getBoundingClientRect();
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
    return { x: box.left + point.x, y: box.top + point.y };
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
