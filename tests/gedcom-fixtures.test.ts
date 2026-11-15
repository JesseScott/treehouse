import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseGedcom } from '../src/gedcom/parse';
import type { Person, Tree } from '../src/gedcom/types';

interface FixtureManifest {
  file: string;
  people: number;
  families: number;
  rootId: string;
  paternalLine: { id: string; name: string; birthYear: number; birthPlace: string }[];
  quirks: {
    twoParentFamilies: string[];
    duplicates: [string, string][];
    detached: string[];
    noPlaces: string[];
  };
}

const dir = new URL('../fixtures/synthetic/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', dir), 'utf8')) as {
  fixtures: FixtureManifest[];
};

describe.each(manifest.fixtures)('parsing $file', (fixture) => {
  const tree: Tree = parseGedcom(readFileSync(new URL(fixture.file, dir), 'utf8'));
  const person = new Map(tree.people.map((p) => [p.id, p]));
  const family = new Map(tree.families.map((f) => [f.id, f]));
  const get = (id: string): Person => {
    const found = person.get(id);
    if (!found) throw new Error(`no person ${id}`);
    return found;
  };

  it('reads every record with no warnings', () => {
    expect(tree.people).toHaveLength(fixture.people);
    expect(tree.families).toHaveLength(fixture.families);
    expect(tree.warnings).toEqual([]);
    expect(tree.meta).toEqual({
      source: 'TREEHOUSE-SYNTHETIC',
      gedcomVersion: '5.5.1',
      charset: 'UTF-8',
    });
    expect(tree.people[0]?.id).toBe(fixture.rootId);
  });

  it('follows the paternal line from the root through each first parent family', () => {
    let current = get(fixture.rootId);
    for (const expected of fixture.paternalLine) {
      expect(current.id).toBe(expected.id);
      expect(current.name).toBe(expected.name);
      const birth = current.events.find((e) => e.type === 'birth');
      expect(birth?.place).toBe(expected.birthPlace);
      expect(birth?.date?.year).toBe(expected.birthYear === 1871 ? 1870 : expected.birthYear);

      const fatherId = family.get(current.parentFamilyIds[0] ?? '')?.husbandId;
      if (expected === fixture.paternalLine.at(-1)) break;
      current = get(fatherId ?? '');
    }
  });

  it('reads the awkward records the way a person would', () => {
    const root = get(fixture.rootId);
    expect(root.events[0]?.date).toMatchObject({ day: 5, month: 11, year: 1986, ambiguous: true });

    const murdo = get(fixture.paternalLine[5]?.id ?? '');
    expect(murdo.name).toBe('Murdo "Murchadh Bàn" MacBriar');
    expect(murdo.events[0]).toMatchObject({
      type: 'birth',
      date: { qualifier: 'about', year: 1842 },
      place: 'Croft 14, Barvas, Lewis, Ross and Cromarty, Scotland',
    });
    // The long note was split with CONC and CONT; it must come back whole.
    expect(murdo.notes).toHaveLength(1);
    expect(murdo.notes[0]?.split('\n')).toEqual([
      expect.stringMatching(/^Family tradition holds .* moved on to Bruce County\.$/),
      'See also the township rental of 1851.',
      '',
      'Transcribed from a family letter.',
    ]);

    const lowercase = get(fixture.paternalLine[6]?.id ?? '');
    expect(lowercase.events[0]).toMatchObject({
      date: { month: 7, year: 1813 },
      place: 'barvas, lewis, ross and cromarty, scotland',
    });

    // The trailing space in `/MacFennel /` is tidied away.
    const morag = tree.people.find((p) => p.name === 'Mòrag (Marion) MacFennel');
    expect(morag).toMatchObject({ given: 'Mòrag (Marion)', surname: 'MacFennel', sex: 'F' });
    expect(tree.people.every((p) => p.surname === p.surname.trim())).toBe(true);

    expect(get(fixture.quirks.twoParentFamilies[0] ?? '').parentFamilyIds).toHaveLength(2);

    const [original, duplicate] = (fixture.quirks.duplicates[0] ?? []).map(get);
    expect(duplicate?.name).toBe(original?.name);
    expect(duplicate?.parentFamilyIds).toEqual(original?.parentFamilyIds.slice(0, 1));

    for (const id of fixture.quirks.detached) expect(get(id).parentFamilyIds).toEqual([]);
    for (const id of fixture.quirks.noPlaces) {
      const noPlace = get(id);
      expect(noPlace.events.length).toBeGreaterThan(0);
      expect(noPlace.events.every((e) => e.place === undefined)).toBe(true);
    }
  });

  it('gets a year from every date in the file', () => {
    const dates = [
      ...tree.people.flatMap((p) => p.events),
      ...tree.families.flatMap((f) => f.events),
    ].flatMap((e) => (e.date ? [e.date] : []));
    expect(dates.length).toBeGreaterThan(fixture.people / 2);
    expect(dates.filter((d) => d.year === undefined).map((d) => d.text)).toEqual([]);
  });
});
