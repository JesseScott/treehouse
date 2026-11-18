import { describe, expect, test } from 'vitest';
import { indexTree } from '../gedcom/relatives';
import { testTree, year } from '../gedcom/testTree';
import type { Locate } from '../geocode/focusPlace';
import type { PlaceResult } from '../geocode/types';
import { arc, threadCollection, threadCounts, type ThreadToggles } from './threadData';

// Made-up places with made-up coordinates.
const at = (
  lng: number,
  lat: number,
  status: 'resolved' | 'approximate' = 'resolved',
): PlaceResult => ({
  status,
  lng,
  lat,
  label: '',
  level: 'place',
  source: 'gazetteer',
});
const PLACES: Record<string, PlaceResult> = {
  Westport: at(-120, 50),
  Eastham: at(-5, 57),
  Southby: at(10, 45, 'approximate'),
  Northon: at(20, 60),
  Farside: at(170, -40),
  Nearside: at(-170, -40),
  Nowhere: { status: 'unresolved' },
};
const locate: Locate = (place) => PLACES[place];

const born = (place: string) => [{ type: 'birth' as const, date: year(1900), place }];

// home (Westport) ← dad (Eastham) ← grandad (no place) ← greatgrandad (Northon);
// home ← mum (Southby); home married spouse (Farside); home's child (Westport, same place).
const index = indexTree(
  testTree(
    [
      {
        id: 'home',
        sex: 'M',
        events: [
          { type: 'birth', date: year(1950), place: 'Westport' },
          { type: 'death', date: year(2020), place: 'Northon' },
          { type: 'residence', date: year(1970), place: 'Eastham' },
          { type: 'residence', date: year(1980), place: 'Nowhere' },
        ],
      },
      { id: 'dad', sex: 'M', events: born('Eastham') },
      { id: 'mum', sex: 'F', events: born('Southby') },
      { id: 'grandad', sex: 'M' },
      { id: 'greatgrandad', sex: 'M', events: born('Northon') },
      { id: 'spouse', sex: 'F', events: born('Farside') },
      { id: 'child', events: born('Westport') },
    ],
    [
      { id: 'F1', husband: 'dad', wife: 'mum', children: ['home'] },
      { id: 'F2', husband: 'grandad', children: ['dad'] },
      { id: 'F3', husband: 'greatgrandad', children: ['grandad'] },
      {
        id: 'F4',
        husband: 'home',
        wife: 'spouse',
        children: ['child'],
        events: [{ type: 'marriage', date: year(1975), place: 'Farside' }],
      },
    ],
  ),
);

const only = (kind: keyof ThreadToggles): ThreadToggles => ({
  lineage: false,
  family: false,
  ancestors: false,
  migration: false,
  [kind]: true,
});

const counts = (focusedId: string, on: ThreadToggles) =>
  threadCounts(threadCollection({ index, rootId: 'home', focusedId, locate, on }));

describe('threadCollection', () => {
  test('lineage joins each generation with a place, passing over one without', () => {
    // home → dad → (grandad has none) → greatgrandad: two arcs.
    expect(counts('greatgrandad', only('lineage')).lineage).toBe(2);
    expect(counts('home', only('lineage')).lineage).toBe(0);
  });

  test('family joins the focused person to parents, spouse and children in other places', () => {
    // dad, mum and the spouse; the child was born in the home person's own birthplace.
    expect(counts('home', only('family')).family).toBe(3);
  });

  test('ancestors joins every child and parent that both have a place', () => {
    // home–dad and home–mum; dad–grandad and grandad–greatgrandad lack grandad's place.
    expect(counts('home', only('ancestors')).ancestors).toBe(2);
  });

  test('migration follows a person’s own places in date order', () => {
    const collection = threadCollection({
      index,
      rootId: 'home',
      focusedId: 'home',
      locate,
      on: only('migration'),
    });
    // Westport 1950 → Eastham 1970 → Farside 1975 (marriage) → Northon 2020.
    expect(threadCounts(collection).migration).toBe(3);
    const firsts = collection.features.map((f) => f.geometry.coordinates[0]);
    expect(firsts).toEqual([
      [-120, 50],
      [-5, 57],
      [170, -40],
    ]);
  });

  test('nothing is drawn for kinds that are off, and an approximate end is flagged', () => {
    const none = { lineage: false, family: false, ancestors: false, migration: false };
    expect(
      threadCollection({ index, rootId: 'home', focusedId: 'home', locate, on: none }).features,
    ).toEqual([]);
    const family = threadCollection({
      index,
      rootId: 'home',
      focusedId: 'home',
      locate,
      on: only('family'),
    });
    expect(family.features.filter((f) => f.properties.approximate)).toHaveLength(1);
  });
});

describe('arc', () => {
  test('starts and ends at its two points', () => {
    const line = arc([-120, 50], [-5, 57]);
    expect(line[0]).toEqual([-120, 50]);
    const [lng, lat] = line.at(-1) ?? [0, 0];
    expect(lng).toBeCloseTo(-5, 6);
    expect(lat).toBeCloseTo(57, 6);
  });

  test('bends towards the pole as a great circle does', () => {
    const line = arc([-120, 50], [-5, 57]);
    const highest = Math.max(...line.map(([, lat]) => lat));
    expect(highest).toBeGreaterThan(65);
  });

  test('crosses the date line without jumping round the world', () => {
    const line = arc([170, -40], [-170, -40]);
    for (let i = 1; i < line.length; i++) {
      expect(Math.abs((line[i]?.[0] ?? 0) - (line[i - 1]?.[0] ?? 0))).toBeLessThan(5);
    }
    expect(line.at(-1)?.[0]).toBeCloseTo(190, 6);
  });
});
