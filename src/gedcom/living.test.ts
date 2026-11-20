import { describe, expect, it } from 'vitest';
import { hideLiving, livingIds } from './living';
import { searchPeople } from './people';
import { testTree, year } from './testTree';

const NOW = 2026;

describe('livingIds', () => {
  it('presumes living anyone born within a hundred years with no death or burial', () => {
    const tree = testTree(
      [
        { id: 'young', born: 1980 },
        { id: 'old', born: 1900 },
        { id: 'youngDead', born: 1980, events: [{ type: 'death' }] },
        { id: 'buried', born: 1990, events: [{ type: 'burial', date: year(2001) }] },
        { id: 'edge', born: NOW - 100 },
      ],
      [],
    );
    expect([...livingIds(tree, NOW)].sort()).toEqual(['young']);
  });

  it('reads a baptism, then the earliest dated event less twenty years', () => {
    const tree = testTree(
      [
        { id: 'baptised', events: [{ type: 'baptism', date: year(1960) }] },
        { id: 'resident', events: [{ type: 'residence', date: year(1960) }] },
        { id: 'married' },
        { id: 'partner', events: [{ type: 'death' }] },
      ],
      [
        {
          id: 'F1',
          husband: 'married',
          wife: 'partner',
          events: [{ type: 'marriage', date: year(1915) }],
        },
      ],
    );
    // 1960 - 20 = 1940 is within a hundred years of 2026; 1915 - 20 = 1895 is not.
    expect([...livingIds(tree, NOW)].sort()).toEqual(['baptised', 'resident']);
  });

  it('guesses an undated person from parents, children and partners', () => {
    const tree = testTree(
      [
        { id: 'grandfather', born: 1850 },
        { id: 'father' },
        { id: 'child' },
        { id: 'grandchild', born: 1990 },
        { id: 'grandchildWife' },
      ],
      [
        { id: 'F1', husband: 'grandfather', children: ['father'] },
        { id: 'F2', husband: 'father', children: ['child'] },
        { id: 'F3', husband: 'grandchild', wife: 'grandchildWife' },
      ],
    );
    // father ≈ 1875 and child ≈ 1900, from the grandfather; the wife ≈ 1990, like her husband.
    expect([...livingIds(tree, NOW)].sort()).toEqual(['grandchild', 'grandchildWife']);
  });

  it('takes the earliest guess, so nobody is made younger than a relative suggests', () => {
    const tree = testTree(
      [{ id: 'oldParent', born: 1800 }, { id: 'undated' }, { id: 'youngChild', born: 2000 }],
      [
        { id: 'F1', husband: 'oldParent', children: ['undated'] },
        { id: 'F2', husband: 'undated', children: ['youngChild'] },
      ],
    );
    expect(livingIds(tree, NOW).has('undated')).toBe(false);
  });

  it('presumes living someone with no dates anywhere near them', () => {
    const tree = testTree([{ id: 'alone' }], []);
    expect([...livingIds(tree, NOW)]).toEqual(['alone']);
  });
});

describe('hideLiving', () => {
  const tree = testTree(
    [
      { id: 'parent', born: 1890, events: [{ type: 'death', date: year(1960) }] },
      { id: 'living', born: 1985, events: [{ type: 'residence', place: 'Somewhere' }] },
      { id: 'partner', born: 1984 },
    ],
    [
      { id: 'F1', husband: 'parent', children: ['living'] },
      {
        id: 'F2',
        husband: 'living',
        wife: 'partner',
        events: [{ type: 'marriage', date: year(2010) }],
      },
    ],
  );
  const shown = hideLiving(tree, livingIds(tree, NOW));

  it('keeps each living person in the tree but drops their name, events and notes', () => {
    const person = shown.people.find((p) => p.id === 'living');
    expect(person).toMatchObject({ name: 'Living', events: [], notes: [], living: true });
    expect(person?.parentFamilyIds).toEqual(['F1']);
    expect(shown.people.find((p) => p.id === 'parent')).toBe(tree.people[0]);
  });

  it('drops the events of a family with a living partner', () => {
    expect(shown.families.find((f) => f.id === 'F2')?.events).toEqual([]);
    expect(shown.families.find((f) => f.id === 'F1')).toBe(tree.families[0]);
  });

  it('leaves the tree untouched when nobody is living', () => {
    expect(hideLiving(tree, new Set())).toBe(tree);
  });

  it('keeps hidden people out of name search', () => {
    expect(searchPeople(shown, 'living', 10)).toEqual([]);
    expect(searchPeople(shown, '', 10)).toHaveLength(3);
  });
});
