// check:data — runs the importer over a real export on this machine and reports
// aggregate numbers only. It never prints or stores a name, a place or a date.
//
//   npm run check:data -- "C:\path\to\export.ged"   (or a .zip)
//
// Skipped unless TREEHOUSE_DATA is set (harness/check-data.mjs sets it). The
// summary goes to the console and to git-ignored reports/data.json.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { expect, test } from 'vitest';
import { readGedcom } from '../src/gedcom/readGedcom';
import { collectPlaces } from '../src/geocode/treePlaces';
import { diskGeocoder } from './gazetteer';

const path = process.env.TREEHOUSE_DATA;

const tally = (values: string[]) => {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
};

/** Masks text to its shape: letters become "a", digits become "9". */
const mask = (text: string) => text.replace(/\p{L}/gu, 'a').replace(/\d/g, '9');

test.skipIf(!path)('real export: aggregate import report', async () => {
  const bytes = new Uint8Array(readFileSync(path ?? ''));
  const started = performance.now();
  const { tree } = await readGedcom(bytes, 'export');
  const milliseconds = Math.round(performance.now() - started);

  const events = [
    ...tree.people.flatMap((p) => p.events),
    ...tree.families.flatMap((f) => f.events),
  ];
  const dates = events.flatMap((e) => (e.date ? [e.date] : []));
  const places = events.flatMap((e) => (e.place ? [e.place] : []));
  const births = tree.people.map((p) => p.events.find((e) => e.type === 'birth'));

  // Geocoding against the bundled gazetteer only: no lookup leaves this machine.
  const treePlaces = collectPlaces(tree);
  const geocodeStarted = performance.now();
  const results = await diskGeocoder().match(treePlaces.map((p) => p.text));
  const geocodeMilliseconds = Math.round(performance.now() - geocodeStarted);
  const outcome = (i: number) => {
    const result = results[i];
    return !result || result.status === 'unresolved'
      ? 'unresolved'
      : `${result.status} (${result.level})`;
  };
  const eventsBy: Record<string, number> = {};
  for (const [i, place] of treePlaces.entries()) {
    eventsBy[outcome(i)] = (eventsBy[outcome(i)] ?? 0) + place.events;
  }

  const report = {
    fileKilobytes: Math.round(bytes.length / 1024),
    milliseconds,
    people: tree.people.length,
    families: tree.families.length,
    source: tree.meta.source ?? null,
    charset: tree.meta.charset ?? null,
    warnings: tally(tree.warnings.map((w) => w.code)),
    peopleWithoutName: tree.people.filter((p) => p.name === '').length,
    peopleWithoutEvents: tree.people.filter((p) => p.events.length === 0).length,
    peopleWithoutParents: tree.people.filter((p) => p.parentFamilyIds.length === 0).length,
    peopleWithSeveralParentFamilies: tree.people.filter((p) => p.parentFamilyIds.length > 1).length,
    peopleWithBirthPlace: births.filter((b) => b?.place).length,
    peopleWithBirthYear: births.filter((b) => b?.date?.year !== undefined).length,
    events: events.length,
    eventTypes: tally(events.map((e) => e.type)),
    dates: dates.length,
    datesWithoutYear: dates.filter((d) => d.year === undefined).length,
    // Shapes only: every letter becomes "a" and every digit "9", so no date is revealed.
    datesWithoutYearShapes: tally(
      dates.filter((d) => d.year === undefined).map((d) => mask(d.text)),
    ),
    datesAmbiguous: dates.filter((d) => d.ambiguous).length,
    dateQualifiers: tally(dates.map((d) => d.qualifier)),
    places: places.length,
    distinctPlaces: new Set(places).size,
    placesAllLowercase: places.filter((p) => p === p.toLowerCase() && /[a-z]/.test(p)).length,
    placesStartingWithNumber: places.filter((p) => /^\d/.test(p)).length,
    geocode: {
      milliseconds: geocodeMilliseconds,
      places: treePlaces.length,
      // Distinct places by outcome, then the events at those places by outcome.
      placesByOutcome: tally(treePlaces.map((_, i) => outcome(i))),
      eventsByOutcome: eventsBy,
    },
  };

  // The places that need attention, for Jesse to read. Written to git-ignored reports/
  // only, never printed: this file holds real place names.
  mkdirSync('reports', { recursive: true });
  writeFileSync(
    'reports/data-places.json',
    JSON.stringify(
      treePlaces
        .map((place, i) => ({ place: place.text, events: place.events, result: results[i] }))
        .filter((row) => row.result?.status !== 'resolved'),
      null,
      2,
    ) + String.fromCharCode(10),
  );

  mkdirSync('reports', { recursive: true });
  writeFileSync('reports/data.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));

  expect(report.people).toBeGreaterThan(0);
});
