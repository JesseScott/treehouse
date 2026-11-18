import { useEffect } from 'react';
import type { GeoJSONSource } from 'maplibre-gl';
import { useAppStore } from '../state/appStore';
import { threadsOf } from '../state/threads';
import { currentMap } from './mapRegistry';
import { MARKER_LAYERS } from './markerData';
import { THREAD_COLORS, THREAD_LAYERS, THREAD_SOURCE } from './threadData';

/** Great-circle lines between relatives, drawn under the place markers. */
export function Threads() {
  const mapLoaded = useAppStore((s) => s.mapLoaded);
  const hasTree = useAppStore((s) => s.open !== null);
  const data = useAppStore(threadsOf);

  // Like the markers, the layers exist only while a tree is open.
  useEffect(() => {
    const map = currentMap();
    if (!mapLoaded || !map || !hasTree) return;
    map.addSource(THREAD_SOURCE, { type: 'geojson', data: threadsOf(useAppStore.getState()) });
    const below = MARKER_LAYERS.find((id) => map.getLayer(id));
    map.addLayer(
      {
        id: 'thread-casing',
        type: 'line',
        source: THREAD_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#0b1d2a', 'line-width': 4.5, 'line-opacity': 0.45 },
      },
      below,
    );
    map.addLayer(
      {
        id: 'thread-lines',
        type: 'line',
        source: THREAD_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': [
            'match',
            ['get', 'kind'],
            'lineage',
            THREAD_COLORS.lineage,
            'family',
            THREAD_COLORS.family,
            'ancestors',
            THREAD_COLORS.ancestors,
            'migration',
            THREAD_COLORS.migration,
            '#ffffff',
          ],
          'line-width': 2.5,
          'line-opacity': ['case', ['get', 'approximate'], 0.55, 0.95],
        },
      },
      below,
    );
    return () => {
      for (const layer of [...THREAD_LAYERS].reverse()) {
        if (map.getLayer(layer)) map.removeLayer(layer);
      }
      if (map.getSource(THREAD_SOURCE)) map.removeSource(THREAD_SOURCE);
    };
  }, [mapLoaded, hasTree]);

  useEffect(() => {
    if (!mapLoaded) return;
    void currentMap()?.getSource<GeoJSONSource>(THREAD_SOURCE)?.setData(data);
  }, [mapLoaded, data]);

  return null;
}
