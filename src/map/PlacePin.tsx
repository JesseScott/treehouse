import { useEffect, useRef } from 'react';
import { Marker, type MapMouseEvent } from 'maplibre-gl';
import type { PlaceLevel } from '../geocode/types';
import { flags } from '../harness/flags';
import { useAppStore } from '../state/appStore';
import { moveCamera } from './camera';
import { currentMap } from './mapRegistry';

/** How close to look at a place: a town from nearby, a country from far off. */
const ZOOM: Record<PlaceLevel, number> = { place: 9, area: 7, region: 5, country: 3 };

/**
 * The pin of the place selected on the review screen. Selecting a place flies to it; the pin
 * can be dragged, and in pinning mode a click on the map puts it there. Renders nothing itself.
 */
export function PlacePin() {
  const mapLoaded = useAppStore((s) => s.mapLoaded);
  const selected = useAppStore((s) => s.places.find((p) => p.key === s.selectedPlaceKey));
  const pinning = useAppStore((s) => s.pinning);
  const pinPlace = useAppStore((s) => s.pinPlace);

  const key = selected?.key;
  const result = selected?.result;
  const located = result && result.status !== 'unresolved' ? result : null;
  const lng = located?.lng;
  const lat = located?.lat;
  const level = located?.level;
  /** The place the camera last flew to, so moving its pin does not move the camera again. */
  const shownKey = useRef<string | null>(null);

  useEffect(() => {
    const map = currentMap();
    if (!mapLoaded || !map || key === undefined || lng === undefined || lat === undefined) return;
    const marker = new Marker({ draggable: true, color: '#ffb703' }).setLngLat([lng, lat]);
    const element = marker.getElement();
    element.setAttribute('data-testid', 'place-pin');
    element.setAttribute('aria-label', 'The selected place. Drag it to move the place.');
    marker.on('dragend', () => {
      void pinPlace(key, marker.getLngLat());
    });
    marker.addTo(map);
    if (shownKey.current !== key) {
      shownKey.current = key;
      moveCamera(map, { lng, lat, zoom: ZOOM[level ?? 'place'] }, flags().motion);
    }
    return () => {
      marker.remove();
    };
  }, [mapLoaded, key, lng, lat, level, pinPlace]);

  useEffect(() => {
    if (key === undefined) shownKey.current = null;
  }, [key]);

  useEffect(() => {
    const map = currentMap();
    if (!mapLoaded || !map || !pinning || key === undefined) return;
    const onClick = (event: MapMouseEvent) => {
      void pinPlace(key, event.lngLat);
    };
    const canvas = map.getCanvas();
    canvas.style.cursor = 'crosshair';
    map.on('click', onClick);
    return () => {
      canvas.style.cursor = '';
      map.off('click', onClick);
    };
  }, [mapLoaded, pinning, key, pinPlace]);

  return null;
}
