import type { GedEvent, Person, PersonEventType, Tree } from './types';

export function eventOf(
  person: Person,
  type: PersonEventType,
): GedEvent<PersonEventType> | undefined {
  return person.events.find((event) => event.type === type);
}

/** "1842–1911", "1986–", "–1911" or "" when neither year is known. */
export function lifespan(person: Person): string {
  const born = eventOf(person, 'birth')?.date?.year;
  const died = (eventOf(person, 'death') ?? eventOf(person, 'burial'))?.date?.year;
  if (born === undefined && died === undefined) return '';
  return `${born ?? ''}–${died ?? ''}`;
}

export function displayName(person: Person): string {
  return person.name || 'Unnamed person';
}

/** Lowercases and strips accents, so "morag" finds "Mòrag". */
export function searchKey(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/**
 * People whose name contains every word of the query, in file order. An empty
 * query returns the first people in the file (an export lists its home person first).
 */
export function searchPeople(tree: Tree, query: string, limit: number): Person[] {
  const words = searchKey(query).split(/\s+/).filter(Boolean);
  const matches: Person[] = [];
  for (const person of tree.people) {
    const key = searchKey(person.name);
    if (words.every((word) => key.includes(word))) {
      matches.push(person);
      if (matches.length === limit) break;
    }
  }
  return matches;
}
