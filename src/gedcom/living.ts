import { indexTree } from './relatives';
import type { Family, Person, Tree } from './types';

/** Someone born fewer than this many years ago, with no death or burial, is presumed living. */
export const LIVING_YEARS = 100;

/** Years between a parent's birth and a child's, when one has to be guessed from the other. */
const GENERATION_YEARS = 25;
/** Years before a first residence or marriage that a birth is guessed at. */
const ADULT_YEARS = 20;
/** How far a guessed birth year spreads through the tree. */
const PASSES = 12;

const isDead = (person: Person) =>
  person.events.some((event) => event.type === 'death' || event.type === 'burial');

function ownBirthYear(person: Person, families: Map<string, Family>): number | undefined {
  const exact = person.events.find(
    (e) => (e.type === 'birth' || e.type === 'baptism') && e.date?.year,
  );
  if (exact?.date?.year !== undefined) return exact.date.year;
  const later: number[] = person.events.flatMap((e) =>
    e.date?.year === undefined ? [] : [e.date.year],
  );
  for (const id of person.familyIds) {
    for (const event of families.get(id)?.events ?? []) {
      if (event.date?.year !== undefined) later.push(event.date.year);
    }
  }
  return later.length ? Math.min(...later) - ADULT_YEARS : undefined;
}

/**
 * The people presumed living: no death or burial, and born fewer than `LIVING_YEARS` years
 * before `currentYear`. A birth year is read from birth or baptism, else guessed from the
 * person's earliest dated event, else from their relatives' (a generation from a parent or
 * child, the same as a partner). Someone with no dates anywhere near them is presumed living,
 * since hiding a dead person by mistake costs less than showing a living one.
 */
export function livingIds(tree: Tree, currentYear: number): Set<string> {
  const index = indexTree(tree);
  const born = new Map<string, number>();
  for (const person of tree.people) {
    const year = ownBirthYear(person, index.families);
    if (year !== undefined) born.set(person.id, year);
  }

  for (let pass = 0; pass < PASSES; pass++) {
    const guesses = new Map<string, number>();
    for (const person of tree.people) {
      if (born.has(person.id)) continue;
      const candidates: number[] = [];
      for (const familyId of person.parentFamilyIds) {
        const family = index.families.get(familyId);
        for (const parentId of [family?.husbandId, family?.wifeId]) {
          const year = parentId === undefined ? undefined : born.get(parentId);
          if (year !== undefined) candidates.push(year + GENERATION_YEARS);
        }
      }
      for (const familyId of person.familyIds) {
        const family = index.families.get(familyId);
        if (!family) continue;
        for (const partnerId of [family.husbandId, family.wifeId]) {
          const year =
            partnerId === undefined || partnerId === person.id ? undefined : born.get(partnerId);
          if (year !== undefined) candidates.push(year);
        }
        for (const childId of family.childIds) {
          const year = born.get(childId);
          if (year !== undefined) candidates.push(year - GENERATION_YEARS);
        }
      }
      // The earliest guess, so a person is never made younger than any relative suggests.
      if (candidates.length) guesses.set(person.id, Math.min(...candidates));
    }
    if (guesses.size === 0) break;
    for (const [id, year] of guesses) born.set(id, year);
  }

  const living = new Set<string>();
  for (const person of tree.people) {
    if (isDead(person)) continue;
    const year = born.get(person.id);
    if (year === undefined || year > currentYear - LIVING_YEARS) living.add(person.id);
  }
  return living;
}

/**
 * The tree as shown with living people hidden: each keeps their place in the tree, but their
 * name becomes "Living" and their events and notes are dropped, so none of their dates or
 * places reach the map, the threads, search or the profile. A family loses its events when
 * either partner is living.
 */
export function hideLiving(tree: Tree, living: Set<string>): Tree {
  if (living.size === 0) return tree;
  return {
    ...tree,
    people: tree.people.map((person) =>
      living.has(person.id)
        ? {
            ...person,
            name: 'Living',
            given: 'Living',
            surname: '',
            events: [],
            notes: [],
            living: true,
          }
        : person,
    ),
    families: tree.families.map((family) =>
      (family.husbandId !== undefined && living.has(family.husbandId)) ||
      (family.wifeId !== undefined && living.has(family.wifeId))
        ? { ...family, events: [] }
        : family,
    ),
  };
}
