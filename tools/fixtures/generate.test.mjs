import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MARKER, OUT_DIR, SIZES, fileName, generate } from './generate.mjs';

/** A tiny structural read of a GEDCOM: records with their level-1 tags. Not the app's parser. */
function records(gedcom) {
  const out = [];
  for (const line of gedcom.slice(1).split('\r\n')) {
    const m = /^(\d+) (?:(@[^@]+@) )?(\S+)(?: (.*))?$/.exec(line);
    if (!m) continue;
    if (m[1] === '0') out.push({ id: m[2], tag: m[3], kids: [] });
    else if (m[1] === '1') out.at(-1).kids.push({ tag: m[3], value: m[4] ?? '' });
  }
  return out;
}

const CRLF = String.fromCharCode(13, 10);

describe.each(SIZES)('synthetic fixture of %i people', (size) => {
  const { gedcom, manifest } = generate(size);
  const recs = records(gedcom);
  const people = recs.filter((r) => r.tag === 'INDI');
  const families = recs.filter((r) => r.tag === 'FAM');
  const byId = new Map(recs.filter((r) => r.id).map((r) => [r.id, r]));

  it('has exactly the requested number of people', () => {
    expect(people).toHaveLength(size);
    expect(manifest.people).toBe(size);
    expect(manifest.families).toBe(families.length);
  });

  it('is deterministic and matches the committed file', () => {
    expect(generate(size).gedcom).toBe(gedcom);
    const committed = readFileSync(new URL(fileName(size), OUT_DIR), 'utf8');
    expect(committed === gedcom, 'run `npm run fixtures` and commit the result').toBe(true);
  });

  it('looks like an export: BOM, CRLF, 5.5.1 header, synthetic marker, trailer', () => {
    expect(gedcom.charCodeAt(0)).toBe(0xfeff);
    expect(gedcom.slice(1).startsWith('0 HEAD' + CRLF)).toBe(true);
    expect(gedcom).toContain(`1 SOUR ${MARKER}\r\n`);
    expect(gedcom).toContain('2 VERS 5.5.1\r\n');
    expect(gedcom.endsWith('0 TRLR\r\n')).toBe(true);
    expect(gedcom.replaceAll('\r\n', '')).not.toMatch(/[\r\n]/);
    expect(Math.max(...gedcom.split('\r\n').map((l) => l.length))).toBeLessThanOrEqual(255);
  });

  it('links people and families both ways', () => {
    for (const person of people) {
      for (const { tag, value } of person.kids) {
        if (tag === 'FAMC') {
          expect(byId.get(value)?.kids).toContainEqual({ tag: 'CHIL', value: person.id });
        }
        if (tag === 'FAMS') {
          const partners = byId
            .get(value)
            ?.kids.filter((k) => k.tag === 'HUSB' || k.tag === 'WIFE');
          expect(partners?.map((k) => k.value)).toContain(person.id);
        }
      }
    }
    for (const family of families) {
      for (const { tag, value } of family.kids) {
        if (tag === 'HUSB' || tag === 'WIFE') {
          expect(byId.get(value)?.kids).toContainEqual({ tag: 'FAMS', value: family.id });
        }
        if (tag === 'CHIL') {
          expect(byId.get(value)?.kids).toContainEqual({ tag: 'FAMC', value: family.id });
        }
      }
    }
  });

  it('follows the paternal line from Vancouver through Ontario and Quebec to Lewis', () => {
    const line = manifest.paternalLine;
    expect(line[0].id).toBe(manifest.rootId);
    expect(line.map((p) => p.birthPlace.split(', ').at(-2).toLowerCase())).toEqual([
      'british columbia',
      'british columbia',
      'ontario',
      'quebec',
      'quebec',
      'ross and cromarty',
      'ross and cromarty',
      'ross and cromarty',
    ]);
    expect(line[0]).toMatchObject({ lat: 49.2827, lng: -123.1207 });
    expect(line.at(-1).lat).toBeGreaterThan(58);
    // Each generation is the father named by the previous person's first parent family.
    for (let i = 0; i < line.length - 1; i++) {
      const famc = byId.get(line[i].id).kids.find((k) => k.tag === 'FAMC').value;
      expect(byId.get(famc).kids).toContainEqual({ tag: 'HUSB', value: line[i + 1].id });
    }
  });

  it('copies the quirks of real exports', () => {
    expect(gedcom).toMatch(/\r\n2 CONC \S/);
    expect(gedcom).toMatch(/\r\n2 CONT/);
    expect(gedcom).toMatch(/2 DATE Abt\. \d{4}\r\n/);
    expect(gedcom).toMatch(/2 DATE After \d{4}\r\n/);
    expect(gedcom).toMatch(/2 DATE Jul 1813\r\n/);
    expect(gedcom).toMatch(/2 DATE 05 11 1986\r\n/);
    expect(gedcom).toContain('2 PLAC barvas, lewis, ross and cromarty, scotland\r\n');
    expect(gedcom).toContain('2 PLAC Croft 14, Barvas, Lewis');
    expect(gedcom).toMatch(/2 PLAC 312 Alder Street, Vancouver/);
    expect(gedcom).toContain('1 NAME Murdo "Murchadh Bàn" /MacBriar/\r\n');
    expect(gedcom).toContain('1 NAME Mòrag (Marion) /MacFennel /\r\n');

    const twoFamilies = byId.get(manifest.quirks.twoParentFamilies[0]);
    expect(twoFamilies.kids.filter((k) => k.tag === 'FAMC')).toHaveLength(2);

    const [original, duplicate] = manifest.quirks.duplicates[0].map((id) => byId.get(id));
    expect(duplicate.kids.find((k) => k.tag === 'NAME')).toEqual(
      original.kids.find((k) => k.tag === 'NAME'),
    );

    for (const id of manifest.quirks.detached) {
      expect(byId.get(id).kids.some((k) => k.tag === 'FAMC')).toBe(false);
    }
    const noPlaces = people.filter(
      (p) => !p.kids.some((k) => ['BIRT', 'DEAT', 'RESI'].includes(k.tag)),
    );
    expect(manifest.quirks.noPlaces).toHaveLength(1);
    if (size >= 500) expect(noPlaces.length).toBeGreaterThan(0);
  });
});
