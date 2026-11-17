import { peopleCountAt, type Visit } from '../geocode/treePlaces';
import type { TreePlace } from '../geocode/types';

export const MARKER_SOURCE = 'places';
export const MARKER_LAYERS = ['place-clusters', 'place-markers'] as const;
export const MARKER_COLOR = '#fb8500';

export interface MarkerProperties {
  key: string;
  /** Different people with an event here: what the marker is sized by. */
  people: number;
  approximate: boolean;
}

/** A GeoJSON feature collection of points, as the map's GeoJSON source takes it. */
export interface MarkerCollection {
  type: 'FeatureCollection';
  features: {
    type: 'Feature';
    geometry: { type: 'Point'; coordinates: [number, number] };
    properties: MarkerProperties;
  }[];
}

/** One marker per place on the map. Places that are not found have no marker. */
export function markerCollection(
  places: Pick<TreePlace, 'key' | 'result'>[],
  visits: Map<string, Visit[]>,
): MarkerCollection {
  const features: MarkerCollection['features'] = [];
  for (const { key, result } of places) {
    if (result.status === 'unresolved') continue;
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [result.lng, result.lat] },
      properties: {
        key,
        people: Math.max(1, peopleCountAt(visits.get(key))),
        approximate: result.status === 'approximate',
      },
    });
  }
  return { type: 'FeatureCollection', features };
}
