import type { Map as MapLibreMap } from 'maplibre-gl';
import type { CameraTarget } from '../harness/types';

export const HOME_VIEW = { lng: -40, lat: 45, zoom: 1.4 } as const;

/** The one way the app moves the camera: a flight, or a jump cut when motion is off. */
export function moveCamera(map: MapLibreMap, target: CameraTarget, motion: boolean): void {
  const options = {
    center: [target.lng, target.lat] as [number, number],
    zoom: target.zoom ?? map.getZoom(),
  };
  if (motion) {
    map.flyTo({ ...options, essential: true });
  } else {
    map.jumpTo(options);
  }
}

/** Resolves once the map has loaded, stopped moving and rendered what it has. */
export function whenMapIdle(map: MapLibreMap): Promise<void> {
  return new Promise((resolve) => {
    const check = () => {
      if (map.loaded() && !map.isMoving()) {
        requestAnimationFrame(() => {
          resolve();
        });
      } else {
        void map.once('idle').then(check);
      }
    };
    check();
  });
}

/** The projection the map is drawn in: 'globe', 'mercator', or 'custom' for an expression. */
export function projectionName(map: MapLibreMap): string {
  // Typed as always present, but there is no projection before the style has loaded.
  const projection = map.getProjection() as { type?: unknown } | undefined;
  const type = projection?.type;
  return typeof type === 'string' ? type : type === undefined ? 'mercator' : 'custom';
}
