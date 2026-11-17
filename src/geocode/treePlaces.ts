import type { FamilyEventType, PersonEventType, Tree } from '../gedcom/types';
import { placeKey } from './normalize';
import type { PlaceStatus, TreePlace } from './types';

/** The distinct places a tree's events name, in file order, with how many events each has. */
export function collectPlaces(tree: Tree): Omit<TreePlace, 'result'>[] {
  const places = new Map<string, Omit<TreePlace, 'result'>>();
  const events = [
    ...tree.people.flatMap((person) => person.events),
    ...tree.families.flatMap((family) => family.events),
  ];
  for (const { place } of events) {
    if (place === undefined) continue;
    const key = placeKey(place);
    if (key === '') continue;
    const known = places.get(key);
    if (known) known.events += 1;
    else places.set(key, { key, text: place, events: 1 });
  }
  return [...places.values()];
}

/** One person's event at a place. A marriage counts for both partners. */
export interface Visit {
  personId: string;
  type: PersonEventType | FamilyEventType;
  year?: number;
}

const visitsByTree = new WeakMap<Tree, Map<string, Visit[]>>();

/** The events at each place of a tree, by `placeKey`, in file order. */
export function placeVisits(tree: Tree): Map<string, Visit[]> {
  const cached = visitsByTree.get(tree);
  if (cached) return cached;
  const visits = new Map<string, Visit[]>();
  const add = (place: string | undefined, visit: Visit) => {
    if (place === undefined) return;
    const key = placeKey(place);
    if (key === '') return;
    const list = visits.get(key);
    if (list) list.push(visit);
    else visits.set(key, [visit]);
  };
  const yearOf = (year: number | undefined) => (year === undefined ? {} : { year });
  for (const person of tree.people) {
    for (const event of person.events) {
      add(event.place, { personId: person.id, type: event.type, ...yearOf(event.date?.year) });
    }
  }
  for (const family of tree.families) {
    for (const event of family.events) {
      for (const personId of [family.husbandId, family.wifeId]) {
        if (personId !== undefined) {
          add(event.place, { personId, type: event.type, ...yearOf(event.date?.year) });
        }
      }
    }
  }
  visitsByTree.set(tree, visits);
  return visits;
}

/** How many different people have an event at a place. */
export const peopleCountAt = (visits: Visit[] | undefined) =>
  new Set(visits?.map((v) => v.personId)).size;

export type Coverage = Record<PlaceStatus, number> & { places: number };

export function coverageOf(places: Pick<TreePlace, 'result'>[]): Coverage {
  const coverage: Coverage = { places: places.length, resolved: 0, approximate: 0, unresolved: 0 };
  for (const place of places) coverage[place.result.status] += 1;
  return coverage;
}
