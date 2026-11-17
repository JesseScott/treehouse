// Builds small in-memory trees for unit tests. Every name here is made up.
import type { ParsedDate } from './dates';
import type { Family, GedEvent, Person, PersonEventType, Tree } from './types';

export interface TestPerson {
  id: string;
  sex?: 'M' | 'F' | 'U';
  born?: number;
  events?: GedEvent<PersonEventType>[];
}

export interface TestFamily {
  id: string;
  husband?: string;
  wife?: string;
  children?: string[];
  events?: Family['events'];
}

/** A date that is just a year. */
export const year = (y: number): ParsedDate => ({ text: String(y), qualifier: 'exact', year: y });

/** A tree from people and families; the links on each person are filled in from the families. */
export function testTree(people: TestPerson[], families: TestFamily[]): Tree {
  const built = new Map<string, Person>(
    people.map((p) => [
      p.id,
      {
        id: p.id,
        name: `Person ${p.id}`,
        given: 'Person',
        surname: p.id,
        sex: p.sex ?? 'U',
        events: [
          ...(p.born === undefined ? [] : [{ type: 'birth' as const, date: year(p.born) }]),
          ...(p.events ?? []),
        ],
        parentFamilyIds: [],
        familyIds: [],
        notes: [],
      },
    ]),
  );
  const link = (id: string | undefined, key: 'parentFamilyIds' | 'familyIds', familyId: string) => {
    const person = id === undefined ? undefined : built.get(id);
    if (!person) throw new Error(`testTree: no person ${String(id)}`);
    person[key].push(familyId);
  };
  const builtFamilies: Family[] = families.map((f) => {
    if (f.husband) link(f.husband, 'familyIds', f.id);
    if (f.wife) link(f.wife, 'familyIds', f.id);
    for (const child of f.children ?? []) link(child, 'parentFamilyIds', f.id);
    return {
      id: f.id,
      ...(f.husband ? { husbandId: f.husband } : {}),
      ...(f.wife ? { wifeId: f.wife } : {}),
      childIds: f.children ?? [],
      events: f.events ?? [],
    };
  });
  return { people: [...built.values()], families: builtFamilies, meta: {}, warnings: [] };
}
