import { describe, expect, test } from 'vitest';
import { testTree, year } from '../gedcom/testTree';
import { placeKey } from '../geocode/normalize';
import { placeVisits } from '../geocode/treePlaces';
import type { PlaceResult } from '../geocode/types';
import { markerCollection } from './markerData';

const tree = testTree(
  [
    {
      id: 'a',
      events: [
        { type: 'birth', date: year(1900), place: 'Harbourtown, Someshire' },
        { type: 'death', place: 'harbourtown,  someshire' },
      ],
    },
    { id: 'b', events: [{ type: 'birth', place: 'Hilltop' }] },
    { id: 'c', events: [{ type: 'residence', place: 'Lost Place' }] },
  ],
  [{ id: 'F1', husband: 'a', wife: 'b', events: [{ type: 'marriage', place: 'Hilltop' }] }],
);

const found = (lng: number, status: 'resolved' | 'approximate'): PlaceResult => ({
  status,
  lng,
  lat: 10,
  label: '',
  level: 'place',
  source: 'gazetteer',
});

describe('place markers', () => {
  test('visits group every spelling of a place and credit a marriage to both partners', () => {
    const visits = placeVisits(tree);
    expect(visits.get(placeKey('Harbourtown, Someshire'))).toEqual([
      { personId: 'a', type: 'birth', year: 1900 },
      { personId: 'a', type: 'death' },
    ]);
    expect(visits.get('hilltop')?.map((v) => v.personId)).toEqual(['b', 'a', 'b']);
    expect(placeVisits(tree)).toBe(visits);
  });

  test('one marker per place on the map, sized by the people there', () => {
    const collection = markerCollection(
      [
        { key: placeKey('Harbourtown, Someshire'), result: found(1, 'resolved') },
        { key: 'hilltop', result: found(2, 'approximate') },
        { key: 'lost place', result: { status: 'unresolved' } },
      ],
      placeVisits(tree),
    );
    expect(collection.features.map((f) => f.properties)).toEqual([
      { key: 'harbourtown, someshire', people: 1, approximate: false },
      { key: 'hilltop', people: 2, approximate: true },
    ]);
    expect(collection.features[1]?.geometry.coordinates).toEqual([2, 10]);
  });
});
