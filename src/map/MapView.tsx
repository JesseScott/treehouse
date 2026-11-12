import { useEffect, useRef } from 'react';
import {
  AttributionControl,
  Map as MapLibreMap,
  NavigationControl,
  setWorkerUrl,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import landUrl from './basemap/land-110m.geojson?url';
import { HOME_VIEW } from './camera';
import { registerMap } from './mapRegistry';
import { offlineStyle } from './offlineStyle';
import { useAppStore } from '../state/appStore';

// The worker script and the land file are loaded from a worker, so they need absolute URLs.
const absolute = (url: string) => new URL(url, document.baseURI).href;
setWorkerUrl(absolute(workerUrl));

export function MapView() {
  const container = useRef<HTMLDivElement>(null);
  const setMapLoaded = useAppStore((s) => s.setMapLoaded);

  useEffect(() => {
    if (!container.current) return;
    const map = new MapLibreMap({
      container: container.current,
      style: offlineStyle(absolute(landUrl)),
      center: [HOME_VIEW.lng, HOME_VIEW.lat],
      zoom: HOME_VIEW.zoom,
      attributionControl: false,
    });
    map.addControl(new AttributionControl({ compact: true }));
    map.addControl(new NavigationControl({ visualizePitch: true }), 'top-right');
    void map.once('load').then(() => {
      setMapLoaded(true);
    });
    registerMap(map);
    return () => {
      registerMap(null);
      setMapLoaded(false);
      map.remove();
    };
  }, [setMapLoaded]);

  return <div ref={container} className="map" data-testid="map" />;
}
