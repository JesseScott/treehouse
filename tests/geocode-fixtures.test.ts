import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseGedcom } from '../src/gedcom/parse';
import { distanceKm } from '../src/geocode/match';
import { collectPlaces, coverageOf } from '../src/geocode/treePlaces';
import { diskGeocoder } from './gazetteer';

const dir = new URL('../fixtures/synthetic/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', dir), 'utf8')) as {
  places: { name: string; lat: number; lng: number }[];
  fixtures: { file: string }[];
};
/** Where the generator says a place string is: its known place, whatever precedes it. */
const expected = (text: string) =>
  manifest.places.find((p) =>
    p.name.toLowerCase().startsWith(text.toLowerCase().replace(/^croft \d+, |^\d+ [^,]+, /, '')),
  );

describe.each(manifest.fixtures)('geocoding $file', ({ file }) => {
  const tree = parseGedcom(readFileSync(new URL(file, dir), 'utf8'));
  const places = collectPlaces(tree);

  it('puts every place within 15 km of where the generator says it is', async () => {
    const results = await diskGeocoder().match(places.map((p) => p.text));
    const off: string[] = [];
    for (const [i, place] of places.entries()) {
      const result = results[i];
      const truth = expected(place.text);
      if (!truth) throw new Error(`no expected coordinates for ${place.text}`);
      if (!result || result.status === 'unresolved') off.push(`${place.text}: unresolved`);
      else if (distanceKm(result, truth) > 15)
        off.push(`${place.text}: ${distanceKm(result, truth).toFixed(0)} km off (${result.label})`);
    }
    expect(off).toEqual([]);
    const coverage = coverageOf(
      places.map((_, i) => ({ result: results[i] ?? { status: 'unresolved' } })),
    );
    expect(coverage.unresolved).toBe(0);
    // Lingwick is a township, known only as an area, so it is approximate; the rest are towns.
    expect(coverage.approximate / coverage.places).toBeLessThan(0.1);
  });
});
