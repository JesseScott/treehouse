import { useEffect } from 'react';
import { Marker } from 'maplibre-gl';
import { useAppStore } from '../state/appStore';
import { focusOf } from '../state/focus';
import { currentMap } from './mapRegistry';

export const FOCUS_COLOR = '#ef476f';

/** The pin on the focused person's place; faded when the place is approximate. */
export function FocusPin() {
  const mapLoaded = useAppStore((s) => s.mapLoaded);
  const place = useAppStore((s) => focusOf(s)?.place ?? null);
  const lng = place?.lng;
  const lat = place?.lat;
  const approximate = place?.approximate ?? false;

  useEffect(() => {
    const map = currentMap();
    if (!mapLoaded || !map || lng === undefined || lat === undefined) return;
    const marker = new Marker({ color: FOCUS_COLOR }).setLngLat([lng, lat]);
    const element = marker.getElement();
    element.setAttribute('data-testid', 'focus-pin');
    element.setAttribute('data-approximate', String(approximate));
    element.setAttribute('aria-hidden', 'true');
    if (approximate) element.style.opacity = '0.6';
    marker.addTo(map);
    return () => {
      marker.remove();
    };
  }, [mapLoaded, lng, lat, approximate]);

  return null;
}
