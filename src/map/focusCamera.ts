import type { PlaceLevel } from '../geocode/types';
import { flags } from '../harness/flags';
import { useAppStore } from '../state/appStore';
import { focusOf } from '../state/focus';
import { moveCamera, projectionName } from './camera';
import { currentMap } from './mapRegistry';

/** How close to look at a focused person's place: near enough to see the region around it. */
export const FOCUS_ZOOM: Record<PlaceLevel, number> = {
  place: 6,
  area: 6,
  region: 5,
  country: 3.5,
};

/**
 * Flies the camera to each newly focused person. Runs as a store subscription rather than a
 * React effect, so the flight has started by the time `focus()` in the debug API waits for idle.
 * A person whose places are still being found is flown to once they are.
 *
 * A tree reopened with a remembered camera jumps straight to it instead, and the focused person
 * counts as shown, so the camera stays where it was left.
 */
export function installFocusCamera(): () => void {
  let shown: string | null = null;
  return useAppStore.subscribe((state) => {
    const map = currentMap();
    if (state.focusedPersonId === null) shown = null;
    if (state.mapLoaded && map && projectionName(map) !== state.projection) {
      map.setProjection({ type: state.projection });
    }
    if (state.cameraRestore) {
      shown = state.focusedPersonId;
      if (!state.mapLoaded || !map) return;
      const { lng, lat, zoom } = state.cameraRestore;
      // A jump cut, motion or not: this is where the user left it, not a journey.
      moveCamera(map, { lng, lat, zoom }, false);
      state.cameraRestored();
      return;
    }
    if (!state.mapLoaded || !map || state.focusedPersonId === shown) return;
    const place = focusOf(state)?.place;
    if (!place) return;
    shown = state.focusedPersonId;
    moveCamera(
      map,
      { lng: place.lng, lat: place.lat, zoom: FOCUS_ZOOM[place.level] },
      flags().motion,
    );
  });
}
