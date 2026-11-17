import type { Person } from '../gedcom/types';
import { childrenOf, parentsOf, siblingsOf, spousesOf, type TreeIndex } from '../gedcom/relatives';
import type { PlaceLevel, PlaceResult } from './types';

/** Which event a person is shown at. `relative` borrows the nearest relative's place. */
export type FocusBasis =
  'birth' | 'baptism' | 'residence' | 'marriage' | 'death' | 'burial' | 'relative';

export interface FocusPlace {
  lng: number;
  lat: number;
  level: PlaceLevel;
  basis: FocusBasis;
  /** True unless this is the birthplace itself, found exactly. */
  approximate: boolean;
  /** The place as written in the file. */
  place: string;
  /** Whose place it is, when it is borrowed from a relative. */
  relativeId?: string;
}

/** Where a place string is on the map, or undefined when the tree does not name it. */
export type Locate = (place: string) => PlaceResult | undefined;

/** How far through the family to look for a place to borrow: parents, then their parents. */
const MAX_RELATIVE_STEPS = 3;

const yearOrLast = (year: number | undefined) => year ?? Number.POSITIVE_INFINITY;

/** A person's own events with a place, in the order the plan prefers them. */
function ownCandidates(index: TreeIndex, person: Person): { basis: FocusBasis; place: string }[] {
  const of = (type: Person['events'][number]['type']) =>
    person.events.filter((e) => e.type === type && e.place !== undefined);
  const residences = of('residence')
    .map((event, i) => ({ event, i }))
    .sort((a, b) => yearOrLast(a.event.date?.year) - yearOrLast(b.event.date?.year) || a.i - b.i)
    .map(({ event }) => event);
  const marriages = spousesOf(index, person)
    .flatMap(({ family }) => family.events.filter((e) => e.type === 'marriage' && e.place))
    .sort((a, b) => yearOrLast(a.date?.year) - yearOrLast(b.date?.year));
  return [
    ...of('birth').map((e) => ({ basis: 'birth' as const, place: e.place ?? '' })),
    ...of('baptism').map((e) => ({ basis: 'baptism' as const, place: e.place ?? '' })),
    ...residences.map((e) => ({ basis: 'residence' as const, place: e.place ?? '' })),
    ...marriages.map((e) => ({ basis: 'marriage' as const, place: e.place ?? '' })),
    ...of('death').map((e) => ({ basis: 'death' as const, place: e.place ?? '' })),
    ...of('burial').map((e) => ({ basis: 'burial' as const, place: e.place ?? '' })),
  ];
}

function ownPlace(index: TreeIndex, person: Person, locate: Locate): FocusPlace | null {
  for (const { basis, place } of ownCandidates(index, person)) {
    const result = locate(place);
    if (!result || result.status === 'unresolved') continue;
    return {
      lng: result.lng,
      lat: result.lat,
      level: result.level,
      basis,
      approximate: basis !== 'birth' || result.status === 'approximate',
      place,
    };
  }
  return null;
}

/**
 * Where to show a person: their birthplace, or else their baptism, earliest residence,
 * marriage, death or burial place, or else the place of the nearest relative who has one.
 * Null when nobody close has a place on the map.
 */
export function focusPlaceOf(
  index: TreeIndex,
  personId: string,
  locate: Locate,
): FocusPlace | null {
  const person = index.people.get(personId);
  if (!person) return null;
  const own = ownPlace(index, person, locate);
  if (own) return own;

  // Breadth first, so a parent or spouse is tried before a cousin.
  const seen = new Set([person.id]);
  let frontier = [person];
  for (let steps = 0; steps < MAX_RELATIVE_STEPS && frontier.length > 0; steps++) {
    const next: Person[] = [];
    for (const current of frontier) {
      const near = [
        ...parentsOf(index, current),
        ...spousesOf(index, current).map((p) => p.spouse),
        ...siblingsOf(index, current),
        ...childrenOf(index, current),
      ];
      for (const relative of near) {
        if (seen.has(relative.id)) continue;
        seen.add(relative.id);
        const theirs = ownPlace(index, relative, locate);
        if (theirs) {
          return { ...theirs, basis: 'relative', approximate: true, relativeId: relative.id };
        }
        next.push(relative);
      }
    }
    frontier = next;
  }
  return null;
}
