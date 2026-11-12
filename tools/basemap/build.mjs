// Builds the bundled offline basemap (Natural Earth 1:110m land, public domain)
// from the world-atlas package. The output is committed, so this only needs to
// be re-run to change the basemap: npm run basemap
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { feature } from 'topojson-client';

const require = createRequire(import.meta.url);
const topology = JSON.parse(readFileSync(require.resolve('world-atlas/land-110m.json'), 'utf8'));
const land = feature(topology, topology.objects.land);

// Four decimals (about 11 m) is far finer than the 1:110m source and keeps the file small.
const round = (n) => Math.round(n * 1e4) / 1e4;
const roundCoords = (c) => (typeof c[0] === 'number' ? c.map(round) : c.map(roundCoords));
const features = (land.type === 'FeatureCollection' ? land.features : [land]).map((f) => ({
  type: 'Feature',
  properties: {},
  geometry: { type: f.geometry.type, coordinates: roundCoords(f.geometry.coordinates) },
}));

const out = new URL('../../src/map/basemap/land-110m.geojson', import.meta.url);
mkdirSync(new URL('.', out), { recursive: true });
writeFileSync(out, JSON.stringify({ type: 'FeatureCollection', features }) + '\n');
console.log(`wrote ${out.pathname} (${features.length} feature(s))`);
