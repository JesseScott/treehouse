import { eventOf } from './people';
import type { Family, Person, Tree } from './types';

/** Lookups by id over one tree. Built once per tree and kept while the tree is alive. */
export interface TreeIndex {
  tree: Tree;
  people: Map<string, Person>;
  families: Map<string, Family>;
}

const indexes = new WeakMap<Tree, TreeIndex>();

export function indexTree(tree: Tree): TreeIndex {
  let index = indexes.get(tree);
  if (!index) {
    index = {
      tree,
      people: new Map(tree.people.map((person) => [person.id, person])),
      families: new Map(tree.families.map((family) => [family.id, family])),
    };
    indexes.set(tree, index);
  }
  return index;
}

/** The year a person was born, or baptised when the birth year is not known. */
export function birthYear(person: Person): number | undefined {
  return eventOf(person, 'birth')?.date?.year ?? eventOf(person, 'baptism')?.date?.year;
}

/** Oldest first; people with no known year keep their file order, after the rest. */
export function byBirth(people: Person[]): Person[] {
  const year = (p: Person) => birthYear(p) ?? Number.POSITIVE_INFINITY;
  return people
    .map((person, i) => ({ person, i }))
    .sort((a, b) => {
      const ya = year(a.person);
      const yb = year(b.person);
      return ya === yb ? a.i - b.i : ya < yb ? -1 : 1;
    })
    .map(({ person }) => person);
}

const unique = (people: (Person | undefined)[]): Person[] => {
  const seen = new Set<string>();
  const out: Person[] = [];
  for (const person of people) {
    if (person && !seen.has(person.id)) {
      seen.add(person.id);
      out.push(person);
    }
  }
  return out;
};

const parentFamilies = (index: TreeIndex, person: Person) =>
  person.parentFamilyIds.flatMap((id) => index.families.get(id) ?? []);

/** The father, from the birth family first, then any other parent family. */
export function fatherOf(index: TreeIndex, person: Person): Person | undefined {
  for (const family of parentFamilies(index, person)) {
    const father = family.husbandId && index.people.get(family.husbandId);
    if (father) return father;
  }
  return undefined;
}

export function motherOf(index: TreeIndex, person: Person): Person | undefined {
  for (const family of parentFamilies(index, person)) {
    const mother = family.wifeId && index.people.get(family.wifeId);
    if (mother) return mother;
  }
  return undefined;
}

/** Everyone recorded as a parent, in every parent family (a foster family counts too). */
export function parentsOf(index: TreeIndex, person: Person): Person[] {
  return unique(
    parentFamilies(index, person).flatMap((family) => [
      family.husbandId ? index.people.get(family.husbandId) : undefined,
      family.wifeId ? index.people.get(family.wifeId) : undefined,
    ]),
  );
}

export interface Partnership {
  spouse: Person;
  family: Family;
}

export function spousesOf(index: TreeIndex, person: Person): Partnership[] {
  const out: Partnership[] = [];
  for (const id of person.familyIds) {
    const family = index.families.get(id);
    if (!family) continue;
    const spouseId = family.husbandId === person.id ? family.wifeId : family.husbandId;
    const spouse = spouseId ? index.people.get(spouseId) : undefined;
    if (spouse && spouse.id !== person.id && !out.some((p) => p.spouse.id === spouse.id)) {
      out.push({ spouse, family });
    }
  }
  return out;
}

export function childrenOf(index: TreeIndex, person: Person): Person[] {
  return byBirth(
    unique(
      person.familyIds.flatMap((id) =>
        (index.families.get(id)?.childIds ?? []).map((childId) => index.people.get(childId)),
      ),
    ),
  );
}

/** Everyone sharing a parent family with the person, the person included, oldest first. */
export function siblingsWithSelf(index: TreeIndex, person: Person): Person[] {
  const families = parentFamilies(index, person);
  if (families.length === 0) return [person];
  return byBirth(
    unique(families.flatMap((family) => family.childIds.map((id) => index.people.get(id)))),
  );
}

export function siblingsOf(index: TreeIndex, person: Person): Person[] {
  return siblingsWithSelf(index, person).filter((p) => p.id !== person.id);
}

// ---- keyboard navigation ----------------------------------------------------

export type Direction = 'father' | 'mother' | 'child' | 'previous' | 'next';

export interface Step {
  personId: string;
  /** The row that left and right move along, kept so that a step back returns. */
  row: string[];
}

/** The people left and right move between: siblings oldest first, then the person's spouses. */
export function rowOf(index: TreeIndex, person: Person): string[] {
  return [
    ...siblingsWithSelf(index, person).map((p) => p.id),
    ...spousesOf(index, person).map((p) => p.spouse.id),
  ];
}

/**
 * Where an arrow key goes from `personId`, or null when there is nobody that way. Down from
 * an ancestor of the home person follows the line back towards the home person.
 */
export function step(
  index: TreeIndex,
  rootId: string | null,
  personId: string,
  direction: Direction,
  row: string[] | null,
): Step | null {
  const person = index.people.get(personId);
  if (!person) return null;
  const to = (next: Person | undefined): Step | null =>
    next ? { personId: next.id, row: rowOf(index, next) } : null;

  switch (direction) {
    case 'father':
      return to(fatherOf(index, person) ?? motherOf(index, person));
    case 'mother':
      return to(motherOf(index, person) ?? fatherOf(index, person));
    case 'child': {
      const root = rootId === null ? undefined : index.people.get(rootId);
      const towardsRoot = root && ancestryOf(index, root).down.get(person.id);
      return to(
        (towardsRoot ? index.people.get(towardsRoot) : undefined) ?? childrenOf(index, person)[0],
      );
    }
    case 'previous':
    case 'next': {
      const current = row?.includes(person.id) ? row : rowOf(index, person);
      const at = current.indexOf(person.id) + (direction === 'next' ? 1 : -1);
      const nextId = current[at];
      return nextId === undefined ? null : { personId: nextId, row: current };
    }
  }
}

// ---- relationship to the home person ---------------------------------------

/** Every ancestor of a person with how many generations up it is, and the step back down. */
interface Ancestry {
  generations: Map<string, number>;
  /** Ancestor id → the id one generation down, towards the start person. */
  down: Map<string, string>;
}

function ancestryOf(index: TreeIndex, start: Person): Ancestry {
  const generations = new Map([[start.id, 0]]);
  const down = new Map<string, string>();
  let frontier = [start];
  for (let generation = 1; frontier.length > 0; generation++) {
    const next: Person[] = [];
    for (const person of frontier) {
      for (const parent of parentsOf(index, person)) {
        if (generations.has(parent.id)) continue;
        generations.set(parent.id, generation);
        down.set(parent.id, person.id);
        next.push(parent);
      }
    }
    frontier = next;
  }
  return { generations, down };
}

/** The ids from an ancestor down to the start person, the ancestor first. */
function lineDown(ancestry: Ancestry, ancestorId: string): string[] {
  const line = [ancestorId];
  let id = ancestorId;
  for (;;) {
    const next = ancestry.down.get(id);
    if (next === undefined) return line;
    line.push(next);
    id = next;
  }
}

export interface Relationship {
  kind: 'self' | 'blood' | 'spouse' | 'in-law' | 'none';
  /** For example "2nd great-grandfather", "Wife of 1st cousin" or "Father-in-law". */
  label: string;
  /** Person ids from the home person to this person, both included. Empty when unrelated. */
  path: string[];
}

const byGender = (person: Person, male: string, female: string, either: string) =>
  person.sex === 'M' ? male : person.sex === 'F' ? female : either;

export function ordinal(n: number): string {
  const tens = n % 100;
  const units = n % 10;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${units === 1 ? 'st' : units === 2 ? 'nd' : units === 3 ? 'rd' : 'th'}`;
}

/** "", "great-", "2nd great-", "3rd great-", ... */
const greats = (n: number) => (n <= 0 ? '' : n === 1 ? 'great-' : `${ordinal(n)} great-`);

const removed = (r: number) =>
  r === 0 ? '' : r === 1 ? ' once removed' : r === 2 ? ' twice removed' : ` ${r} times removed`;

/**
 * The blood relationship of `person`, `up` generations above the shared ancestor on the home
 * person's side and `across` generations below it on theirs, in genealogists' terms.
 */
export function bloodLabel(person: Person, up: number, across: number): string {
  if (up === 0 && across === 0) return 'Home person';
  if (across === 0) {
    if (up === 1) return byGender(person, 'father', 'mother', 'parent');
    return greats(up - 2) + byGender(person, 'grandfather', 'grandmother', 'grandparent');
  }
  if (up === 0) {
    if (across === 1) return byGender(person, 'son', 'daughter', 'child');
    return greats(across - 2) + byGender(person, 'grandson', 'granddaughter', 'grandchild');
  }
  if (up === 1 && across === 1) return byGender(person, 'brother', 'sister', 'sibling');
  if (across === 1) return greats(up - 2) + byGender(person, 'uncle', 'aunt', 'aunt or uncle');
  if (up === 1) return greats(across - 2) + byGender(person, 'nephew', 'niece', 'niece or nephew');
  return `${ordinal(Math.min(up, across) - 1)} cousin${removed(Math.abs(up - across))}`;
}

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

interface Blood {
  up: number;
  across: number;
  path: string[];
}

function bloodBetween(index: TreeIndex, root: Ancestry, person: Person): Blood | null {
  const theirs = ancestryOf(index, person);
  let best: { id: string; up: number; across: number } | null = null;
  for (const [id, across] of theirs.generations) {
    const up = root.generations.get(id);
    if (up === undefined) continue;
    const closer =
      !best ||
      up + across < best.up + best.across ||
      (up + across === best.up + best.across && up < best.up);
    if (closer) best = { id, up, across };
  }
  if (!best) return null;
  // Up from the home person to the shared ancestor, then down to the person.
  const homeSide = lineDown(root, best.id).reverse();
  const theirSide = lineDown(theirs, best.id);
  return { up: best.up, across: best.across, path: [...homeSide, ...theirSide.slice(1)] };
}

const IN_LAW: Record<string, string> = {
  father: 'father-in-law',
  mother: 'mother-in-law',
  parent: 'parent-in-law',
  brother: 'brother-in-law',
  sister: 'sister-in-law',
  sibling: 'sibling-in-law',
};

const spouseWord = (person: Person) => byGender(person, 'husband', 'wife', 'spouse');

/** How `personId` is related to the home person, with the line between them. */
export function relationship(index: TreeIndex, rootId: string, personId: string): Relationship {
  const root = index.people.get(rootId);
  const person = index.people.get(personId);
  if (!root || !person) return { kind: 'none', label: 'Not related', path: [] };
  if (root.id === person.id) return { kind: 'self', label: 'Home person', path: [root.id] };

  const rootAncestry = ancestryOf(index, root);
  const blood = bloodBetween(index, rootAncestry, person);
  if (blood) {
    return {
      kind: 'blood',
      label: capitalise(bloodLabel(person, blood.up, blood.across)),
      path: blood.path,
    };
  }

  const spouses = spousesOf(index, person).map((p) => p.spouse);
  if (spouses.some((spouse) => spouse.id === root.id)) {
    return { kind: 'spouse', label: capitalise(spouseWord(person)), path: [root.id, person.id] };
  }

  // The spouse of a blood relative: "Wife of 1st cousin", the nearest relative first.
  let nearest: (Blood & { spouse: Person }) | null = null;
  for (const spouse of spouses) {
    const found = bloodBetween(index, rootAncestry, spouse);
    if (found && (!nearest || found.path.length < nearest.path.length)) {
      nearest = { ...found, spouse };
    }
  }
  if (nearest) {
    return {
      kind: 'in-law',
      label: `${capitalise(spouseWord(person))} of ${bloodLabel(nearest.spouse, nearest.up, nearest.across)}`,
      path: [...nearest.path, person.id],
    };
  }

  // A blood relative of the home person's spouse: "Father-in-law", "Grandmother of wife".
  for (const { spouse: partner } of spousesOf(index, root)) {
    const found = bloodBetween(index, ancestryOf(index, partner), person);
    if (!found) continue;
    const label = bloodLabel(person, found.up, found.across);
    return {
      kind: 'in-law',
      label: capitalise(IN_LAW[label] ?? `${label} of ${spouseWord(partner)}`),
      path: [root.id, ...found.path],
    };
  }
  return { kind: 'none', label: 'No known relationship', path: [] };
}
