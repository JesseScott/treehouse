import { describe, expect, it } from 'vitest';
import { parseGedcom } from '../gedcom/parse';
import { Gazetteer } from './gazetteer';
import { Geocoder } from './geocoder';
import { countriesOf, matchPlace } from './match';
import { NOMINATIM_URL, nominatimRequest, parseNominatim } from './nominatim';
import { collectPlaces, coverageOf } from './treePlaces';
import type { GazetteerIndex } from './types';

// A tiny made-up gazetteer, so these tests do not depend on the real one.
const index: GazetteerIndex = {
  source: 'test',
  built: '2026-01-01',
  detail: [],
  countries: [
    { code: 'AA', name: 'Aland', lat: 10, lng: 10 },
    { code: 'BB', name: 'Georgia', lat: -20, lng: 40 },
  ],
  regions: [
    { country: 'AA', code: '01', name: 'Northmark', lat: 12, lng: 10 },
    { country: 'AA', code: '02', name: 'Georgia', lat: 8, lng: 11 },
  ],
  shards: { AA: 4, BB: 1 },
};
const TAB = String.fromCharCode(9);
const lines = (...rows: (string | number)[][]) =>
  rows.map((row) => row.join(TAB)).join('\n') + '\n';
const AA = lines(
  ['Elmford', 12.1, 10.1, '01', 900],
  ['Elmford', 8.1, 11.1, '02', 40000],
  ['Wick County', 12.3, 10.2, '01', '', 'a'],
  ['Saint-Rémy', 12.5, 10.5, '01'],
);
const BB = lines(['Elmford', -20.5, 40.5, '09', 5000]);

function loaded(): Gazetteer {
  const gazetteer = new Gazetteer(index);
  gazetteer.addShard('AA', AA);
  gazetteer.addShard('BB', BB);
  return gazetteer;
}

describe('matchPlace', () => {
  const gazetteer = loaded();

  it('uses the region to choose between two towns of one name', () => {
    expect(matchPlace(gazetteer, 'Elmford, Northmark, Aland')).toMatchObject({
      status: 'resolved',
      lat: 12.1,
      label: 'Elmford, Northmark, Aland',
    });
    expect(matchPlace(gazetteer, 'Elmford, Aland')).toMatchObject({ lat: 8.1 }); // the larger
  });

  it('tries a name that is both a country and a region both ways', () => {
    expect(countriesOf(gazetteer, 'Elmford, Georgia').sort()).toEqual(['AA', 'BB']);
    // Both readings find an Elmford; the one in the larger town wins.
    expect(matchPlace(gazetteer, 'Elmford, Georgia')).toMatchObject({ lat: 8.1 });
  });

  it('matches accents, "St." and "County" loosely', () => {
    expect(matchPlace(gazetteer, 'st remy, northmark, aland')).toMatchObject({ lat: 12.5 });
    expect(matchPlace(gazetteer, 'Nowhere, Wick, Northmark, Aland')).toMatchObject({
      status: 'approximate',
      level: 'area',
      lat: 12.3,
    });
  });

  it('flags a town reached past an unknown part as approximate', () => {
    expect(matchPlace(gazetteer, 'Mill Farm, Elmford, Northmark, Aland')).toMatchObject({
      status: 'approximate',
      level: 'place',
      lat: 12.1,
    });
    expect(matchPlace(gazetteer, '12 High Street, Elmford, Northmark, Aland')).toMatchObject({
      status: 'resolved',
    });
  });
});

describe('Geocoder', () => {
  it('loads only the files the places call for, once each', async () => {
    const read: string[] = [];
    const files: Record<string, string> = {
      'index.json': JSON.stringify(index),
      'AA.txt': AA,
      'BB.txt': BB,
      'world.txt': lines(['Bigtown', 1, 2, '01', 99000, '', 'BB']),
    };
    const geocoder = new Geocoder((name) => {
      read.push(name);
      return Promise.resolve(files[name] ?? '');
    });
    const first = await geocoder.match(['Elmford, Northmark, Aland', 'Elmford, Aland']);
    expect(first.map((r) => r.status)).toEqual(['resolved', 'resolved']);
    expect(read).toEqual(['index.json', 'AA.txt']);

    // A place that names no country brings in the world list; nothing is read twice.
    expect(await geocoder.match(['Bigtown', 'Elmford, Aland'])).toMatchObject([
      { status: 'resolved', label: 'Bigtown, Georgia' },
      { status: 'resolved' },
    ]);
    expect(read).toEqual(['index.json', 'AA.txt', 'world.txt']);
  });

  it('rejects when a file cannot be read', async () => {
    const geocoder = new Geocoder(() => Promise.reject(new Error('offline')));
    await expect(geocoder.match(['Elmford, Aland'])).rejects.toThrow('offline');
  });
});

describe('collectPlaces', () => {
  const tree = parseGedcom(
    [
      '0 HEAD',
      '0 @I1@ INDI',
      '1 BIRT',
      '2 PLAC Elmford, Northmark, Aland',
      '1 DEAT',
      '2 PLAC elmford,  northmark, ALAND',
      '0 @I2@ INDI',
      '1 BIRT',
      '2 DATE 1900',
      '0 @F1@ FAM',
      '1 MARR',
      '2 PLAC Saint-Rémy, Northmark, Aland',
    ].join('\n'),
  );

  it('counts each place once however it is spelled, with its events', () => {
    expect(collectPlaces(tree)).toEqual([
      { key: 'elmford, northmark, aland', text: 'Elmford, Northmark, Aland', events: 2 },
      { key: 'saint remy, northmark, aland', text: 'Saint-Rémy, Northmark, Aland', events: 1 },
    ]);
  });

  it('adds up coverage', () => {
    const gazetteer = loaded();
    const places = [...collectPlaces(tree), { key: 'x', text: 'Qqq', events: 1 }];
    const results = places.map((place) => ({ result: matchPlace(gazetteer, place.text) }));
    expect(coverageOf(results)).toEqual({ places: 3, resolved: 2, approximate: 0, unresolved: 1 });
  });
});

describe('the online lookup request', () => {
  it('carries the place text and nothing else', () => {
    const url = new URL(nominatimRequest('Elmford, Northmark & Aland'));
    expect(url.origin + url.pathname).toBe(NOMINATIM_URL);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      format: 'jsonv2',
      limit: '1',
      q: 'Elmford, Northmark & Aland',
    });
  });

  it('reads the first hit, and treats anything else as not found', () => {
    expect(parseNominatim([{ lat: '12.5', lon: '-3.25', display_name: 'Elmford' }])).toEqual({
      lat: 12.5,
      lng: -3.25,
      label: 'Elmford',
    });
    expect(parseNominatim([])).toBeNull();
    expect(parseNominatim({ error: 'x' })).toBeNull();
    expect(parseNominatim([{ lat: 'north', lon: '1' }])).toBeNull();
    expect(parseNominatim([{ display_name: 'no coordinates' }])).toBeNull();
  });
});
