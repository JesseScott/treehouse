import { fatherOf, motherOf, parentsOf, relationship, type TreeIndex } from './relatives';
import type { Person } from './types';

/** Which line a journey follows from the home person back in time. */
export type JourneyLine = 'paternal' | 'maternal' | 'ancestor';

/** Father's father's father…, or mother's mother's mother…, starting with the person. */
function straightLine(
  index: TreeIndex,
  start: Person,
  next: (index: TreeIndex, person: Person) => Person | undefined,
): string[] {
  const line = [start.id];
  const seen = new Set(line);
  for (let person = next(index, start); person && !seen.has(person.id);) {
    line.push(person.id);
    seen.add(person.id);
    person = next(index, person);
  }
  return line;
}

/**
 * The people from the home person up to an ancestor, the home person first, each the child of
 * the next. Null when `ancestorId` is not a direct ancestor of the home person.
 */
export function ancestorPath(
  index: TreeIndex,
  rootId: string,
  ancestorId: string,
): string[] | null {
  if (rootId === ancestorId) return null;
  const { kind, path } = relationship(index, rootId, ancestorId);
  if (kind !== 'blood' || path.length < 2) return null;
  for (let i = 1; i < path.length; i++) {
    const child = index.people.get(path[i - 1] ?? '');
    if (!child || !parentsOf(index, child).some((p) => p.id === path[i])) return null;
  }
  return path;
}

/**
 * The stops of a journey: the home person, then one person per generation back. For
 * `ancestor`, the line up to `ancestorId`. Fewer than two stops means there is no journey.
 */
export function journeyStops(
  index: TreeIndex,
  rootId: string,
  line: JourneyLine,
  ancestorId?: string,
): string[] {
  const root = index.people.get(rootId);
  if (!root) return [];
  switch (line) {
    case 'paternal':
      return straightLine(index, root, fatherOf);
    case 'maternal':
      return straightLine(index, root, motherOf);
    case 'ancestor':
      return ancestorId === undefined ? [] : (ancestorPath(index, rootId, ancestorId) ?? []);
  }
}

/** Every ancestor of a person paired with each of their children on the way down. */
export function ancestorLinks(
  index: TreeIndex,
  start: Person,
): { child: Person; parent: Person }[] {
  const links: { child: Person; parent: Person }[] = [];
  const seen = new Set([start.id]);
  let frontier = [start];
  while (frontier.length > 0) {
    const next: Person[] = [];
    for (const child of frontier) {
      for (const parent of parentsOf(index, child)) {
        links.push({ child, parent });
        if (seen.has(parent.id)) continue;
        seen.add(parent.id);
        next.push(parent);
      }
    }
    frontier = next;
  }
  return links;
}
