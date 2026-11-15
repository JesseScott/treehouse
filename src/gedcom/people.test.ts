import { describe, expect, it } from 'vitest';
import { parseGedcom } from './parse';
import { displayName, lifespan, searchKey, searchPeople } from './people';

const tree = parseGedcom(
  [
    '0 HEAD',
    '0 @I1@ INDI',
    '1 NAME Rowan /Testfold/',
    '1 BIRT',
    '2 DATE 05 11 1986',
    '0 @I2@ INDI',
    '1 NAME Mòrag (Marion) /MacFennel /',
    '1 BIRT',
    '2 DATE Abt. 1815',
    '1 DEAT',
    '2 DATE 1890',
    '0 @I3@ INDI',
    '1 NAME Murdo "Murchadh Bàn" /MacBriar/',
    '1 BURI',
    '2 DATE 1911',
    '0 @I4@ INDI',
    '1 SEX F',
    '0 @I5@ INDI',
    '1 NAME Morag /Testfold/',
  ].join('\n'),
);
const [rowan, morag, murdo, unnamed] = tree.people;
if (!rowan || !morag || !murdo || !unnamed) throw new Error('fixture people missing');

describe('lifespan', () => {
  it('shows the years that are known', () => {
    expect(lifespan(rowan)).toBe('1986–');
    expect(lifespan(morag)).toBe('1815–1890');
    // A burial year stands in for a missing death.
    expect(lifespan(murdo)).toBe('–1911');
    expect(lifespan(unnamed)).toBe('');
  });
});

describe('displayName', () => {
  it('falls back for a person with no name', () => {
    expect(displayName(rowan)).toBe('Rowan Testfold');
    expect(displayName(unnamed)).toBe('Unnamed person');
  });
});

describe('searchPeople', () => {
  const names = (query: string, limit = 10) => searchPeople(tree, query, limit).map((p) => p.id);

  it('ignores case and accents', () => {
    expect(searchKey('Mòrag Bàn')).toBe('morag ban');
    expect(names('morag')).toEqual(['@I2@', '@I5@']);
    expect(names('MÒRAG')).toEqual(['@I2@', '@I5@']);
    expect(names('ban')).toEqual(['@I3@']);
  });

  it('needs every word, in any order', () => {
    expect(names('testfold rowan')).toEqual(['@I1@']);
    expect(names('morag macfennel')).toEqual(['@I2@']);
    expect(names('rowan macbriar')).toEqual([]);
  });

  it('returns the first people in file order for an empty query, up to the limit', () => {
    expect(names('', 2)).toEqual(['@I1@', '@I2@']);
    expect(names('   ', 10)).toHaveLength(5);
  });
});
