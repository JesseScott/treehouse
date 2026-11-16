import type { Tree } from '../gedcom/types';
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

export type Coverage = Record<PlaceStatus, number> & { places: number };

export function coverageOf(places: Pick<TreePlace, 'result'>[]): Coverage {
  const coverage: Coverage = { places: places.length, resolved: 0, approximate: 0, unresolved: 0 };
  for (const place of places) coverage[place.result.status] += 1;
  return coverage;
}
