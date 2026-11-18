import { describe, expect, test } from 'vitest';
import { ancestorLinks, ancestorPath, journeyStops } from './lines';
import { indexTree } from './relatives';
import { testTree } from './testTree';

// home ← dad ← grandad ← greatgrandad, and home ← mum ← granny; dad's mother is nana.
const index = indexTree(
  testTree(
    [
      { id: 'home', sex: 'M' },
      { id: 'dad', sex: 'M' },
      { id: 'mum', sex: 'F' },
      { id: 'grandad', sex: 'M' },
      { id: 'nana', sex: 'F' },
      { id: 'granny', sex: 'F' },
      { id: 'greatgrandad', sex: 'M' },
      { id: 'brother', sex: 'M' },
      { id: 'uncle', sex: 'M' },
    ],
    [
      { id: 'F1', husband: 'dad', wife: 'mum', children: ['home', 'brother'] },
      { id: 'F2', husband: 'grandad', wife: 'nana', children: ['dad', 'uncle'] },
      { id: 'F3', wife: 'granny', children: ['mum'] },
      { id: 'F4', husband: 'greatgrandad', children: ['grandad'] },
    ],
  ),
);

describe('journeyStops', () => {
  test('the paternal line runs from the home person through each father', () => {
    expect(journeyStops(index, 'home', 'paternal')).toEqual([
      'home',
      'dad',
      'grandad',
      'greatgrandad',
    ]);
  });

  test('the maternal line follows mothers only, stopping where one is not known', () => {
    expect(journeyStops(index, 'home', 'maternal')).toEqual(['home', 'mum', 'granny']);
  });

  test('a line to an ancestor goes through each generation between', () => {
    expect(journeyStops(index, 'home', 'ancestor', 'nana')).toEqual(['home', 'dad', 'nana']);
  });

  test('there is no journey to someone who is not an ancestor', () => {
    expect(journeyStops(index, 'home', 'ancestor', 'uncle')).toEqual([]);
    expect(journeyStops(index, 'home', 'ancestor', 'brother')).toEqual([]);
    expect(journeyStops(index, 'home', 'ancestor', 'home')).toEqual([]);
    expect(journeyStops(index, 'home', 'ancestor')).toEqual([]);
    expect(journeyStops(index, 'nobody', 'paternal')).toEqual([]);
  });

  test('a home person with no father has a one-stop line', () => {
    expect(journeyStops(index, 'granny', 'paternal')).toEqual(['granny']);
  });
});

test('ancestorPath accepts only direct ancestors', () => {
  expect(ancestorPath(index, 'home', 'greatgrandad')).toEqual([
    'home',
    'dad',
    'grandad',
    'greatgrandad',
  ]);
  expect(ancestorPath(index, 'home', 'uncle')).toBeNull();
});

test('ancestorLinks pairs every ancestor with their child', () => {
  const home = index.people.get('home');
  if (!home) throw new Error('no home person');
  const links = ancestorLinks(index, home).map(({ child, parent }) => `${child.id}>${parent.id}`);
  expect(links.sort()).toEqual(
    [
      'home>dad',
      'home>mum',
      'dad>grandad',
      'dad>nana',
      'mum>granny',
      'grandad>greatgrandad',
    ].sort(),
  );
});
