import { describe, expect, test } from 'vitest';
import {
  bloodLabel,
  childrenOf,
  fatherOf,
  indexTree,
  motherOf,
  ordinal,
  relationship,
  rowOf,
  siblingsOf,
  spousesOf,
  step,
} from './relatives';
import { testTree } from './testTree';

// A made-up family seen from "root":
//
//   gg + ggm ─┬─ g + gm ─┬─ uncle + auntInLaw ── cousin + cousinHusband ── cousinChild
//             │          └─ father + mother ─┬─ sister + sisHusband ── niece
//             │                              └─ root + wife ── son
//             └─ greatAunt + gaHusband ── gaSon
//   wifeFather + wifeMother ─┬─ wife
//                            └─ wifeBrother
//   stranger (no links)
const tree = testTree(
  [
    { id: 'gg', sex: 'M', born: 1890 },
    { id: 'ggm', sex: 'F', born: 1892 },
    { id: 'g', sex: 'M', born: 1925 },
    { id: 'gm', sex: 'F', born: 1927 },
    { id: 'greatAunt', sex: 'F', born: 1920 },
    { id: 'gaHusband', sex: 'M', born: 1918 },
    { id: 'gaSon', sex: 'M', born: 1950 },
    { id: 'uncle', sex: 'M', born: 1950 },
    { id: 'auntInLaw', sex: 'F', born: 1951 },
    { id: 'father', sex: 'M', born: 1955 },
    { id: 'mother', sex: 'F', born: 1957 },
    { id: 'cousin', sex: 'F', born: 1975 },
    { id: 'cousinHusband', sex: 'M', born: 1974 },
    { id: 'cousinChild', sex: 'M', born: 2000 },
    { id: 'sister', sex: 'F', born: 1985 },
    { id: 'sisHusband', sex: 'M', born: 1984 },
    { id: 'niece', sex: 'F', born: 2010 },
    { id: 'root', sex: 'M', born: 1988 },
    { id: 'wife', sex: 'F', born: 1989 },
    { id: 'son', sex: 'M', born: 2015 },
    { id: 'wifeFather', sex: 'M', born: 1960 },
    { id: 'wifeMother', sex: 'F', born: 1961 },
    { id: 'wifeBrother', sex: 'M', born: 1992 },
    { id: 'stranger', sex: 'U' },
  ],
  [
    { id: 'F1', husband: 'gg', wife: 'ggm', children: ['g', 'greatAunt'] },
    { id: 'F2', husband: 'g', wife: 'gm', children: ['father', 'uncle'] },
    { id: 'F3', husband: 'father', wife: 'mother', children: ['root', 'sister'] },
    { id: 'F4', husband: 'uncle', wife: 'auntInLaw', children: ['cousin'] },
    { id: 'F5', husband: 'cousinHusband', wife: 'cousin', children: ['cousinChild'] },
    { id: 'F6', husband: 'gaHusband', wife: 'greatAunt', children: ['gaSon'] },
    { id: 'F7', husband: 'root', wife: 'wife', children: ['son'] },
    { id: 'F8', husband: 'wifeFather', wife: 'wifeMother', children: ['wifeBrother', 'wife'] },
    { id: 'F9', husband: 'sisHusband', wife: 'sister', children: ['niece'] },
  ],
);
const index = indexTree(tree);
const person = (id: string) => {
  const found = index.people.get(id);
  if (!found) throw new Error(id);
  return found;
};
const ids = (people: { id: string }[]) => people.map((p) => p.id);

describe('relatives', () => {
  test('parents, spouses, children and siblings are read from the families', () => {
    expect(fatherOf(index, person('root'))?.id).toBe('father');
    expect(motherOf(index, person('root'))?.id).toBe('mother');
    expect(fatherOf(index, person('gg'))).toBeUndefined();
    expect(spousesOf(index, person('root')).map((p) => p.spouse.id)).toEqual(['wife']);
    // Oldest first, whatever order the file lists them in.
    expect(ids(childrenOf(index, person('g')))).toEqual(['uncle', 'father']);
    expect(ids(siblingsOf(index, person('root')))).toEqual(['sister']);
    expect(ids(siblingsOf(index, person('stranger')))).toEqual([]);
    expect(indexTree(tree)).toBe(index);
  });
});

describe('relationship to the home person', () => {
  const cases: [string, string][] = [
    ['root', 'Home person'],
    ['father', 'Father'],
    ['mother', 'Mother'],
    ['g', 'Grandfather'],
    ['gg', 'Great-grandfather'],
    ['sister', 'Sister'],
    ['uncle', 'Uncle'],
    ['greatAunt', 'Great-aunt'],
    ['cousin', '1st cousin'],
    ['cousinChild', '1st cousin once removed'],
    ['gaSon', '1st cousin once removed'],
    ['niece', 'Niece'],
    ['son', 'Son'],
    ['wife', 'Wife'],
    ['auntInLaw', 'Wife of uncle'],
    ['cousinHusband', 'Husband of 1st cousin'],
    ['sisHusband', 'Husband of sister'],
    ['wifeFather', 'Father-in-law'],
    ['wifeBrother', 'Brother-in-law'],
    ['stranger', 'No known relationship'],
  ];
  test.each(cases)('%s is "%s"', (id, label) => {
    expect(relationship(index, 'root', id).label).toBe(label);
  });

  test('the path runs from the home person up to the shared ancestor and down again', () => {
    expect(relationship(index, 'root', 'cousinChild').path).toEqual([
      'root',
      'father',
      'g',
      'uncle',
      'cousin',
      'cousinChild',
    ]);
    expect(relationship(index, 'root', 'gg').path).toEqual(['root', 'father', 'g', 'gg']);
    expect(relationship(index, 'root', 'auntInLaw').path).toEqual([
      'root',
      'father',
      'g',
      'uncle',
      'auntInLaw',
    ]);
    expect(relationship(index, 'root', 'wifeBrother').path).toEqual([
      'root',
      'wife',
      'wifeFather',
      'wifeBrother',
    ]);
    expect(relationship(index, 'root', 'stranger')).toMatchObject({ kind: 'none', path: [] });
  });

  test('distant relationships use genealogists’ terms', () => {
    const man = person('root');
    const someone = person('stranger');
    expect(bloodLabel(man, 4, 0)).toBe('2nd great-grandfather');
    expect(bloodLabel(man, 7, 0)).toBe('5th great-grandfather');
    expect(bloodLabel(someone, 3, 0)).toBe('great-grandparent');
    expect(bloodLabel(man, 0, 4)).toBe('2nd great-grandson');
    expect(bloodLabel(man, 1, 3)).toBe('great-nephew');
    expect(bloodLabel(man, 5, 1)).toBe('3rd great-uncle');
    expect(bloodLabel(man, 3, 3)).toBe('2nd cousin');
    expect(bloodLabel(man, 3, 5)).toBe('2nd cousin twice removed');
    expect(bloodLabel(man, 6, 2)).toBe('1st cousin 4 times removed');
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 111].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '23rd',
      '111th',
    ]);
  });
});

describe('arrow-key steps', () => {
  const go = (from: string, direction: Parameters<typeof step>[3], row: string[] | null = null) =>
    step(index, 'root', from, direction, row);

  test('up goes to the father, shift+up to the mother, each falling back to the other', () => {
    expect(go('root', 'father')?.personId).toBe('father');
    expect(go('root', 'mother')?.personId).toBe('mother');
    expect(go('gg', 'father')).toBeNull();
    const motherOnly = testTree(
      [{ id: 'child' }, { id: 'mum', sex: 'F' }],
      [{ id: 'F1', wife: 'mum', children: ['child'] }],
    );
    expect(step(indexTree(motherOnly), null, 'child', 'father', null)?.personId).toBe('mum');
  });

  test('down follows the line back to the home person, or else goes to the eldest child', () => {
    // The uncle is older, but the father is on the way back to the home person.
    expect(go('g', 'child')?.personId).toBe('father');
    expect(go('uncle', 'child')?.personId).toBe('cousin');
    expect(go('root', 'child')?.personId).toBe('son');
    expect(go('son', 'child')).toBeNull();
  });

  test('left and right move along siblings then spouses, and a step back returns', () => {
    expect(rowOf(index, person('root'))).toEqual(['sister', 'root', 'wife']);
    const right = go('root', 'next');
    expect(right).toEqual({ personId: 'wife', row: ['sister', 'root', 'wife'] });
    // From the wife, the kept row leads back to the home person rather than her own siblings.
    expect(go('wife', 'previous', right?.row ?? null)?.personId).toBe('root');
    expect(go('root', 'previous')?.personId).toBe('sister');
    expect(go('sister', 'previous', ['sister', 'root', 'wife'])).toBeNull();
    expect(go('stranger', 'next')).toBeNull();
  });
});
