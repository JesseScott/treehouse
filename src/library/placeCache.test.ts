import { describe, expect, it } from 'vitest';
import type { StoredPlace } from './db';
import {
  mergePlaces,
  placeFile,
  placeFileName,
  PlaceFileReadError,
  readPlaceFile,
} from './placeCache';

const pin = (key: string, updatedAt = '2026-01-01T00:00:00.000Z'): StoredPlace => ({
  key,
  source: 'manual',
  location: { lng: 10.5, lat: 50.25 },
  label: '',
  updatedAt,
});

const answer = (key: string, updatedAt = '2026-01-01T00:00:00.000Z'): StoredPlace => ({
  key,
  source: 'online',
  location: { lng: -3, lat: 55 },
  label: 'An answer',
  updatedAt,
});

const errorCode = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return error instanceof PlaceFileReadError ? error.code : 'other';
  }
  return null;
};

describe('place file', () => {
  it('round-trips pins and answers, sorted, with only the known fields', () => {
    const extra = { ...pin('elmford, northmark'), name: 'not a field' } as StoredPlace;
    const nothing: StoredPlace = { ...answer('nowhere'), location: null, label: '' };
    const file = placeFile([answer('ashby'), extra, nothing], new Date('2026-11-19T02:00:00Z'));
    expect(file.format).toBe('treehouse-places');
    expect(file.exportedAt).toBe('2026-11-19T02:00:00.000Z');
    expect(file.places.map((p) => p.key)).toEqual(['ashby', 'elmford, northmark', 'nowhere']);
    expect(Object.keys(file.places[1] ?? {})).toEqual([
      'key',
      'source',
      'location',
      'label',
      'updatedAt',
    ]);
    expect(readPlaceFile(JSON.stringify(file))).toEqual({ places: file.places, invalid: 0 });
    expect(placeFileName(new Date('2026-11-19T02:00:00Z'))).toBe(
      'treehouse-places-2026-11-19.json',
    );
  });

  it('refuses a file that is not a place file, or comes from a newer version', () => {
    expect(errorCode(() => readPlaceFile('not json'))).toBe('not-a-place-file');
    expect(errorCode(() => readPlaceFile('[]'))).toBe('not-a-place-file');
    expect(errorCode(() => readPlaceFile('{"format":"other","places":[]}'))).toBe(
      'not-a-place-file',
    );
    expect(
      errorCode(() => readPlaceFile('{"format":"treehouse-places","version":2,"places":[]}')),
    ).toBe('newer-version');
  });

  it('leaves out entries that are not valid places and counts them', () => {
    const good = pin('elmford');
    const text = JSON.stringify({
      format: 'treehouse-places',
      version: 1,
      places: [
        good,
        { ...good, key: '' },
        { ...good, source: 'guess' },
        { ...good, location: { lng: 200, lat: 0 } },
        { ...good, location: { lng: 'x', lat: 0 } },
        { ...good, location: null }, // a pin must have a location
        { ...good, updatedAt: 'yesterday' },
        'a string',
        null,
      ],
    });
    expect(readPlaceFile(text)).toEqual({ places: [good], invalid: 8 });
  });
});

describe('mergePlaces', () => {
  it('adds new places and skips identical ones', () => {
    const result = mergePlaces([pin('a')], [pin('a'), pin('b')]);
    expect(result).toMatchObject({ added: 1, updated: 0, skipped: 1 });
    expect(result.save.map((p) => p.key)).toEqual(['b']);
  });

  it('keeps a pin over an online answer, whichever is newer', () => {
    const newerAnswer = answer('a', '2027-01-01T00:00:00.000Z');
    expect(mergePlaces([pin('a')], [newerAnswer])).toMatchObject({ skipped: 1, save: [] });
    const olderPin = pin('b', '2020-01-01T00:00:00.000Z');
    expect(mergePlaces([answer('b')], [olderPin])).toMatchObject({ updated: 1, save: [olderPin] });
  });

  it('otherwise keeps the more recent of the two', () => {
    const newer = { ...pin('a', '2027-01-01T00:00:00.000Z'), location: { lng: 1, lat: 2 } };
    const older = { ...pin('a', '2020-01-01T00:00:00.000Z'), location: { lng: 3, lat: 4 } };
    expect(mergePlaces([pin('a')], [newer])).toMatchObject({ updated: 1, save: [newer] });
    expect(mergePlaces([pin('a')], [older])).toMatchObject({ skipped: 1, save: [] });
  });
});
