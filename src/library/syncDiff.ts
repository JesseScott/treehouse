import type { Family, Person, Tree } from '../gedcom/types';
import { collectPlaces } from '../geocode/treePlaces';

/**
 * What changed between the tree an import holds and a newer reading of its file. People and
 * families are matched by their GEDCOM id, which family tree sites keep across exports, so the
 * home person, the focused person and pins (which belong to places) carry over.
 */
export interface SyncDiff {
  /** Person ids in the file but not in the import, in file order. */
  added: string[];
  /** Person ids in the import but no longer in the file, in the import's order. */
  removed: string[];
  /** Person ids in both whose name, sex, events, notes or family links differ. */
  changed: string[];
  families: { added: number; removed: number; changed: number };
  /** `placeKey`s the file names that the import did not, in file order. */
  newPlaces: string[];
  /** `placeKey`s the import named that the file no longer does. */
  droppedPlaces: string[];
}

/** A stable text form of a record, so two readings can be compared field by field. */
const personShape = (person: Person) =>
  JSON.stringify([
    person.name,
    person.given,
    person.surname,
    person.sex,
    person.events,
    person.parentFamilyIds,
    person.familyIds,
    person.notes,
  ]);

const familyShape = (family: Family) =>
  JSON.stringify([family.husbandId ?? null, family.wifeId ?? null, family.childIds, family.events]);

function compare<T extends { id: string }>(
  before: T[],
  after: T[],
  shape: (item: T) => string,
): { added: string[]; removed: string[]; changed: string[] } {
  const old = new Map(before.map((item) => [item.id, item]));
  const next = new Set(after.map((item) => item.id));
  const added: string[] = [];
  const changed: string[] = [];
  for (const item of after) {
    const was = old.get(item.id);
    if (!was) added.push(item.id);
    else if (shape(was) !== shape(item)) changed.push(item.id);
  }
  const removed = before.filter((item) => !next.has(item.id)).map((item) => item.id);
  return { added, removed, changed };
}

export function diffTrees(before: Tree, after: Tree): SyncDiff {
  const people = compare(before.people, after.people, personShape);
  const families = compare(before.families, after.families, familyShape);
  const oldPlaces = new Set(collectPlaces(before).map((place) => place.key));
  const nextPlaces = collectPlaces(after).map((place) => place.key);
  const nextSet = new Set(nextPlaces);
  return {
    ...people,
    families: {
      added: families.added.length,
      removed: families.removed.length,
      changed: families.changed.length,
    },
    newPlaces: nextPlaces.filter((key) => !oldPlaces.has(key)),
    droppedPlaces: [...oldPlaces].filter((key) => !nextSet.has(key)),
  };
}

/** True when a sync would change nothing anyone can see. */
export const isEmptyDiff = (diff: SyncDiff) =>
  diff.added.length === 0 &&
  diff.removed.length === 0 &&
  diff.changed.length === 0 &&
  diff.families.added + diff.families.removed + diff.families.changed === 0 &&
  diff.newPlaces.length === 0 &&
  diff.droppedPlaces.length === 0;

/** A person id that is still in the new tree, or the fallback. */
export function carriedOver(tree: Tree, id: string | null, fallback: string | null): string | null {
  if (id !== null && tree.people.some((person) => person.id === id)) return id;
  return fallback;
}
