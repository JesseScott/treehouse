import { updateImport, type ImportView } from '../library/db';
import { currentMap } from '../map/mapRegistry';
import { useAppStore } from './appStore';

/** How long the view has to stay still before it is written, so a flight writes once. */
export const VIEW_SAVE_DELAY_MS = 250;

type State = ReturnType<typeof useAppStore.getState>;

let timer: ReturnType<typeof setTimeout> | undefined;
let latest: State | null = null;
let pending: { promise: Promise<void>; resolve: () => void } | null = null;

/** What to remember about how the open tree is being looked at. Ids and numbers only. */
function viewOf(state: State): ImportView {
  const map = currentMap();
  const center = map?.getCenter();
  return {
    focusedPersonId: state.focusedPersonId,
    camera:
      map && center && state.mapLoaded
        ? { lng: center.lng, lat: center.lat, zoom: map.getZoom(), projection: state.projection }
        : null,
    threads: { ...state.threadsOn },
  };
}

async function flush(): Promise<void> {
  clearTimeout(timer);
  timer = undefined;
  const state = latest;
  const done = pending;
  latest = null;
  pending = null;
  try {
    if (state?.open) await updateImport(state.open.record.id, { view: viewOf(state) });
  } catch {
    // The view is a convenience; failing to remember it must not get in the way.
  } finally {
    done?.resolve();
  }
}

function schedule(state: State): void {
  // Another tree was opened before the last one's view was written: write that one now.
  if (latest?.open && latest.open.record.id !== state.open?.record.id) void flush();
  latest = state;
  if (!pending) {
    let resolve = () => {};
    const promise = new Promise<void>((r) => {
      resolve = r;
    });
    pending = { promise, resolve };
  }
  clearTimeout(timer);
  timer = setTimeout(() => void flush(), VIEW_SAVE_DELAY_MS);
}

/** True while a change of view is waiting to be written. */
export const viewSaving = () => pending !== null;

/** Resolves once any change of view has been written to IndexedDB. */
export function whenViewSaved(): Promise<void> {
  return pending?.promise ?? Promise.resolve();
}

/** Called by the map when the camera stops, so where it stopped is remembered. */
export function cameraMoved(): void {
  const state = useAppStore.getState();
  // Until a remembered camera has been applied, the map is not showing this tree's view.
  if (state.open && !state.cameraRestore && state.mapLoaded) schedule(state);
}

/**
 * Remembers, per import, who is focused, which threads are on and where the camera is, so
 * opening the import again (or reloading the page with it open) brings them back.
 */
export function installViewMemory(): () => void {
  const unsubscribe = useAppStore.subscribe((state, prev) => {
    if (!state.open) {
      // Closing a tree writes what was waiting for it.
      if (latest) void flush();
      return;
    }
    if (state.cameraRestore) return;
    if (
      state.open !== prev.open ||
      state.focusedPersonId !== prev.focusedPersonId ||
      state.threadsOn !== prev.threadsOn ||
      state.projection !== prev.projection
    ) {
      schedule(state);
    }
  });
  const onHide = () => {
    if (latest) void flush();
  };
  addEventListener('pagehide', onHide);
  return () => {
    unsubscribe();
    removeEventListener('pagehide', onHide);
  };
}
