import { readFileSync } from 'node:fs';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { ImportError, readGedcom } from '../src/gedcom/readGedcom';

const fixture = new Uint8Array(
  readFileSync(new URL('../fixtures/synthetic/treehouse-30.ged', import.meta.url)),
);
const small = ['0 HEAD', '1 CHAR UTF-8', '0 @I1@ INDI', '1 NAME Mòrag /Testfold/', '0 TRLR'].join(
  '\r\n',
);

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'no error';
  } catch (error) {
    return error instanceof ImportError ? error.code : `unexpected: ${String(error)}`;
  }
}

describe('readGedcom', () => {
  it('reads a plain .ged file and hashes its bytes', async () => {
    const result = await readGedcom(fixture, 'treehouse-30.ged');
    expect(result.tree.people).toHaveLength(30);
    expect(result.tree.warnings).toEqual([]);
    expect(result.gedcomFileName).toBe('treehouse-30.ged');
    expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
    // The same bytes always hash the same; different bytes do not.
    expect((await readGedcom(fixture, 'renamed.ged')).hash).toBe(result.hash);
    expect((await readGedcom(strToU8(small), 'small.ged')).hash).not.toBe(result.hash);
  });

  it('reads the .ged inside a zip export, ignoring other files', async () => {
    const zip = zipSync({
      'media/portrait.jpg': new Uint8Array([1, 2, 3]),
      'Export/Family Tree.ged': fixture,
      'readme.txt': strToU8('not a tree'),
    });
    const result = await readGedcom(zip, 'Family Tree.zip');
    expect(result.tree.people).toHaveLength(30);
    expect(result.gedcomFileName).toBe('Family Tree.ged');
    expect(result.hash).toBe((await readGedcom(fixture, 'x.ged')).hash);
  });

  it('takes the largest .ged when a zip holds several', async () => {
    const zip = zipSync({ 'small.ged': strToU8(small), 'big.ged': fixture });
    expect((await readGedcom(zip, 'two.zip')).gedcomFileName).toBe('big.ged');
  });

  it('decodes UTF-8 with accents, and UTF-16 when a byte-order mark says so', async () => {
    expect((await readGedcom(strToU8(small), 's.ged')).tree.people[0]?.name).toBe('Mòrag Testfold');

    const utf16 = new Uint8Array(2 + small.length * 2);
    utf16.set([0xff, 0xfe]);
    for (let i = 0; i < small.length; i++) {
      utf16[2 + i * 2] = small.charCodeAt(i) & 0xff;
      utf16[3 + i * 2] = small.charCodeAt(i) >> 8;
    }
    expect((await readGedcom(utf16, 's.ged')).tree.people[0]?.name).toBe('Mòrag Testfold');
  });

  it('rejects files that are not family trees, with a code for each reason', async () => {
    expect(await codeOf(readGedcom(new Uint8Array(), 'empty.ged'))).toBe('empty');
    expect(await codeOf(readGedcom(strToU8('Dear diary'), 'notes.ged'))).toBe('not-gedcom');
    expect(await codeOf(readGedcom(strToU8('{"people": []}'), 'tree.json'))).toBe('not-gedcom');
    expect(await codeOf(readGedcom(zipSync({ 'a.txt': strToU8('hello') }), 'a.zip'))).toBe(
      'no-gedcom-in-zip',
    );
    expect(await codeOf(readGedcom(zipSync({ 'a.ged': new Uint8Array() }), 'a.zip'))).toBe('empty');
    expect(await codeOf(readGedcom(new Uint8Array([0x50, 0x4b, 9, 9, 9, 9]), 'broken.zip'))).toBe(
      'bad-zip',
    );
  });
});
