import { describe, expect, it } from 'vitest';
import { testTree, year } from '../gedcom/testTree';
import type { Tree } from '../gedcom/types';
import { carriedOver, diffTrees, isEmptyDiff } from './syncDiff';

const place = (text: string) => ({ type: 'birth' as const, date: year(1900), place: text });

/** A small made-up family: two parents and two children, each born somewhere. */
const before = () =>
  testTree(
    [
      { id: '@I1@', sex: 'M', events: [place('Elmford, Northmark')] },
      { id: '@I2@', sex: 'F', events: [place('Ashby, Northmark')] },
      { id: '@I3@', events: [place('Elmford, Northmark')] },
      { id: '@I4@', events: [place('Brindle, Southmark')] },
    ],
    [{ id: '@F1@', husband: '@I1@', wife: '@I2@', children: ['@I3@', '@I4@'] }],
  );

/** A copy that can be changed without touching the original. */
const copy = (tree: Tree): Tree => structuredClone(tree);

describe('diffTrees', () => {
  it('finds nothing between two readings of the same file', () => {
    const diff = diffTrees(before(), before());
    expect(diff).toEqual({
      added: [],
      removed: [],
      changed: [],
      families: { added: 0, removed: 0, changed: 0 },
      newPlaces: [],
      droppedPlaces: [],
    });
    expect(isEmptyDiff(diff)).toBe(true);
  });

  it('matches people by GEDCOM id: added, removed and changed', () => {
    const after = copy(before());
    // @I4@ leaves the file, @I5@ joins it, @I3@ gets a new name.
    after.people = after.people.filter((p) => p.id !== '@I4@');
    const family = after.families[0];
    if (!family) throw new Error('no family');
    family.childIds = ['@I3@', '@I5@'];
    after.people.push({
      id: '@I5@',
      name: 'Person @I5@',
      given: 'Person',
      surname: '@I5@',
      sex: 'U',
      events: [place('Coldwater, Southmark')],
      parentFamilyIds: ['@F1@'],
      familyIds: [],
      notes: [],
    });
    const third = after.people.find((p) => p.id === '@I3@');
    if (!third) throw new Error('no @I3@');
    third.name = 'Someone Else';

    const diff = diffTrees(before(), after);
    expect(diff.added).toEqual(['@I5@']);
    expect(diff.removed).toEqual(['@I4@']);
    expect(diff.changed).toEqual(['@I3@']);
    expect(diff.families).toEqual({ added: 0, removed: 0, changed: 1 });
    expect(diff.newPlaces).toEqual(['coldwater, southmark']);
    expect(diff.droppedPlaces).toEqual(['brindle, southmark']);
    expect(isEmptyDiff(diff)).toBe(false);
  });

  it('counts a changed event, note or family link as a change, but not record order', () => {
    const after = copy(before());
    after.people.reverse();
    expect(diffTrees(before(), after).changed).toEqual([]);

    const first = after.people.find((p) => p.id === '@I1@');
    const second = after.people.find((p) => p.id === '@I2@');
    if (!first || !second) throw new Error('missing people');
    first.events.push({ type: 'death', date: year(1950) });
    second.notes.push('A note.');
    expect(diffTrees(before(), after).changed.sort()).toEqual(['@I1@', '@I2@']);
  });

  it('notices families added and removed', () => {
    const after = copy(before());
    after.families.push({ id: '@F2@', childIds: [], events: [] });
    expect(diffTrees(before(), after).families).toEqual({ added: 1, removed: 0, changed: 0 });
    expect(diffTrees(after, before()).families).toEqual({ added: 0, removed: 1, changed: 0 });
  });

  it('compares places by key, so a respelling of a known place is not new', () => {
    const after = copy(before());
    const first = after.people[0];
    const event = first?.events[0];
    if (!event) throw new Error('no event');
    event.place = 'ELMFORD,  Northmark';
    const diff = diffTrees(before(), after);
    expect(diff.newPlaces).toEqual([]);
    expect(diff.changed).toEqual(['@I1@']);
  });
});

describe('carriedOver', () => {
  it('keeps a person who is still in the file and falls back otherwise', () => {
    const tree = before();
    expect(carriedOver(tree, '@I2@', '@I1@')).toBe('@I2@');
    expect(carriedOver(tree, '@I9@', '@I1@')).toBe('@I1@');
    expect(carriedOver(tree, null, '@I1@')).toBe('@I1@');
    expect(carriedOver(tree, '@I9@', null)).toBeNull();
  });
});
