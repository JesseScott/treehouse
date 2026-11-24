import { useEffect, useMemo } from 'react';
import type { GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl';
import { placeVisits } from '../geocode/treePlaces';
import { motionOn } from '../state/motion';
import { useAppStore } from '../state/appStore';
import { moveCamera } from './camera';
import { currentMap } from './mapRegistry';
import {
  MARKER_COLOR,
  MARKER_LAYERS,
  MARKER_SOURCE,
  markerCollection,
  type MarkerCollection,
} from './markerData';

const EMPTY: MarkerCollection = { type: 'FeatureCollection', features: [] };

/** The markers of the open tree's places: sized by people, clustered when zoomed out. */
export function PlaceMarkers() {
  const mapLoaded = useAppStore((s) => s.mapLoaded);
  const open = useAppStore((s) => s.open);
  const places = useAppStore((s) => s.places);
  const openPlace = useAppStore((s) => s.openPlace);

  const data = useMemo(
    () => (open ? markerCollection(places, placeVisits(open.tree)) : EMPTY),
    [open, places],
  );

  const hasTree = open !== null;

  // The layers exist only while a tree is open. Setting up circle layers is costly with
  // software WebGL, and the library screen, the first thing anyone sees, has nothing to draw.
  useEffect(() => {
    const map = currentMap();
    if (!mapLoaded || !map || !hasTree) return;
    map.addSource(MARKER_SOURCE, {
      type: 'geojson',
      data: EMPTY,
      cluster: true,
      clusterRadius: 36,
      clusterMaxZoom: 7,
      clusterProperties: { people: ['+', ['get', 'people']] },
    });
    map.addLayer({
      id: 'place-clusters',
      type: 'circle',
      source: MARKER_SOURCE,
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': MARKER_COLOR,
        'circle-opacity': 0.75,
        'circle-radius': ['interpolate', ['linear'], ['sqrt', ['get', 'people']], 1, 8, 20, 26],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
      },
    });
    map.addLayer({
      id: 'place-markers',
      type: 'circle',
      source: MARKER_SOURCE,
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-color': MARKER_COLOR,
        'circle-opacity': ['case', ['get', 'approximate'], 0.5, 0.9],
        'circle-radius': ['interpolate', ['linear'], ['sqrt', ['get', 'people']], 1, 5, 10, 18],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1,
      },
    });

    const onMarker = (event: MapLayerMouseEvent) => {
      const key: unknown = event.features?.[0]?.properties.key;
      // While a place is being pinned, a click belongs to the pin.
      if (typeof key === 'string' && !useAppStore.getState().pinning) openPlace(key);
    };
    const onCluster = (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      const clusterId: unknown = feature?.properties.cluster_id;
      const source = map.getSource<GeoJSONSource>(MARKER_SOURCE);
      if (typeof clusterId !== 'number' || !source || useAppStore.getState().pinning) return;
      void source.getClusterExpansionZoom(clusterId).then((zoom) => {
        moveCamera(map, { lng: event.lngLat.lng, lat: event.lngLat.lat, zoom }, motionOn());
      });
    };
    const pointer = () => {
      map.getCanvas().style.cursor = useAppStore.getState().pinning ? 'crosshair' : 'pointer';
    };
    const plain = () => {
      map.getCanvas().style.cursor = useAppStore.getState().pinning ? 'crosshair' : '';
    };
    map.on('click', 'place-markers', onMarker);
    map.on('click', 'place-clusters', onCluster);
    for (const layer of MARKER_LAYERS) {
      map.on('mouseenter', layer, pointer);
      map.on('mouseleave', layer, plain);
    }
    return () => {
      map.off('click', 'place-markers', onMarker);
      map.off('click', 'place-clusters', onCluster);
      for (const layer of MARKER_LAYERS) {
        map.off('mouseenter', layer, pointer);
        map.off('mouseleave', layer, plain);
        if (map.getLayer(layer)) map.removeLayer(layer);
      }
      if (map.getSource(MARKER_SOURCE)) map.removeSource(MARKER_SOURCE);
    };
  }, [mapLoaded, hasTree, openPlace]);

  useEffect(() => {
    if (!mapLoaded) return;
    void currentMap()?.getSource<GeoJSONSource>(MARKER_SOURCE)?.setData(data);
  }, [mapLoaded, data]);

  return null;
}
