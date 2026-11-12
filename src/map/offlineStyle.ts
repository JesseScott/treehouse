import type { StyleSpecification } from 'maplibre-gl';

export const OFFLINE_COLORS = {
  space: '#0d2233',
  ocean: '#16384f',
  land: '#8fd19e',
} as const;

/**
 * A style that needs no network: one bundled GeoJSON file of Natural Earth land
 * polygons, no tiles, no glyphs and no sprites. Tests and the M0 shell use it.
 */
export function offlineStyle(landUrl: string): StyleSpecification {
  return {
    version: 8,
    name: 'treehouse-offline',
    projection: { type: 'globe' },
    sources: {
      land: {
        type: 'geojson',
        data: landUrl,
        attribution: 'Made with Natural Earth',
      },
    },
    layers: [
      { id: 'ocean', type: 'background', paint: { 'background-color': OFFLINE_COLORS.ocean } },
      { id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': OFFLINE_COLORS.land } },
    ],
  };
}
