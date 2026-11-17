import { describe, expect, test } from 'vitest';
import { indexTree } from '../gedcom/relatives';
import { testTree, year } from '../gedcom/testTree';
import { focusPlaceOf, type Locate } from './focusPlace';
import type { PlaceResult } from './types';

// Made-up places with made-up coordinates; only their order and status matter here.
const at = (lng: number, status: 'resolved' | 'approximate' = 'resolved'): PlaceResult => ({
  status,
  lng,
  lat: 50,
  label: '',
  level: status === 'resolved' ? 'place' : 'region',
  source: 'gazetteer',
});
const PLACES: Record<string, PlaceResult> = {
  Birthtown: at(1),
  Vaguely: at(2, 'approximate'),
  Fonttown: at(3),
  'Early Street': at(4),
  'Late Street': at(5),
  Weddingham: at(6),
  Endsby: at(7),
  Nowhere: { status: 'unresolved' },
};
const locate: Locate = (place) => PLACES[place];

const tree = testTree(
  [
    { id: 'born', events: [{ type: 'birth', place: 'Birthtown' }] },
    { id: 'roughly', events: [{ type: 'birth', place: 'Vaguely' }] },
    {
      id: 'baptised',
      events: [
        { type: 'birth', place: 'Nowhere' },
        { type: 'death', place: 'Endsby' },
        { type: 'baptism', place: 'Fonttown' },
      ],
    },
    {
      id: 'resident',
      events: [
        { type: 'residence', date: year(1900), place: 'Late Street' },
        { type: 'residence', date: year(1880), place: 'Early Street' },
        { type: 'death', place: 'Endsby' },
      ],
    },
    { id: 'married', sex: 'M', events: [{ type: 'death', place: 'Endsby' }] },
    { id: 'bride', sex: 'F' },
    {
      id: 'died',
      events: [
        { type: 'birth', place: 'Nowhere' },
        { type: 'death', place: 'Endsby' },
      ],
    },
    { id: 'placeless', sex: 'F' },
    { id: 'child' },
    { id: 'alone' },
  ],
  [
    {
      id: 'F1',
      husband: 'married',
      wife: 'bride',
      events: [{ type: 'marriage', place: 'Weddingham' }],
    },
    { id: 'F2', husband: 'born', wife: 'placeless', children: ['child'] },
  ],
);
const index = indexTree(tree);
const focus = (id: string) => focusPlaceOf(index, id, locate);

describe('where a person is shown', () => {
  test('at their birthplace, exact when the place was found exactly', () => {
    expect(focus('born')).toMatchObject({ basis: 'birth', approximate: false, lng: 1 });
    expect(focus('roughly')).toMatchObject({ basis: 'birth', approximate: true, level: 'region' });
  });

  test('then at baptism, earliest residence, marriage and death, always marked approximate', () => {
    expect(focus('baptised')).toMatchObject({ basis: 'baptism', approximate: true, lng: 3 });
    expect(focus('resident')).toMatchObject({ basis: 'residence', place: 'Early Street' });
    expect(focus('married')).toMatchObject({ basis: 'marriage', place: 'Weddingham' });
    expect(focus('bride')).toMatchObject({ basis: 'marriage', place: 'Weddingham' });
    expect(focus('died')).toMatchObject({ basis: 'death', approximate: true });
  });

  test('then at the nearest relative’s place, saying whose it is', () => {
    expect(focus('placeless')).toMatchObject({
      basis: 'relative',
      relativeId: 'born',
      relativeBasis: 'birth',
      approximate: true,
      lng: 1,
    });
    expect(focus('child')).toMatchObject({ basis: 'relative', relativeId: 'born' });
  });

  test('nowhere when nobody close has a place', () => {
    expect(focus('alone')).toBeNull();
    expect(focus('missing')).toBeNull();
  });
});
