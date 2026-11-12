import { describe, expect, it } from 'vitest';
import { MARKER, inspect, scan } from './privacy-guard.mjs';

// Built at runtime so this test file does not itself contain a header line.
const header = ['0', 'HEAD'].join(' ');
const real = `${header}\r\n1 SOUR Ancestry.com Family Trees\r\n0 TRLR\r\n`;
const synthetic = `${header}\r\n1 SOUR ${MARKER}\r\n0 TRLR\r\n`;

describe('privacy guard', () => {
  it('rejects GEDCOM and zip files outside fixtures/synthetic', () => {
    expect(inspect('family.ged', '')).toMatch(/file type/);
    expect(inspect('local/Export.ZIP', '')).toMatch(/file type/);
    expect(inspect('docs/tree.gedcom', '')).toMatch(/file type/);
  });

  it('rejects a GEDCOM header hidden in any other file', () => {
    expect(inspect('notes.txt', real)).toMatch(/header/);
    expect(inspect('src/sample.ts', `export const x = 1;\n${real}`)).toMatch(/header/);
    expect(inspect('notes.txt', String.fromCharCode(0xfeff) + real)).toMatch(/header/);
  });

  it('allows prose and code that only mention the header', () => {
    expect(inspect('docs/HARNESS.md', 'A GEDCOM starts with a `0 HEAD` line.')).toBeNull();
    expect(inspect('tools/gen.mjs', "const lines = ['0 HEAD',\n  '1 CHAR UTF-8'];")).toBeNull();
  });

  it('allows generated fixtures and rejects unmarked files beside them', () => {
    expect(inspect('fixtures/synthetic/treehouse-30.ged', synthetic)).toBeNull();
    expect(inspect('fixtures/synthetic/manifest.json', '{}')).toBeNull();
    expect(inspect('fixtures/synthetic/mine.ged', real)).toMatch(/marker/);
  });

  it('passes on this repository', () => {
    expect(scan().problems).toEqual([]);
  });
});
