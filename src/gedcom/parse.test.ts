import { describe, expect, it } from 'vitest';
import { parseGedcom } from './parse';

/** Joins lines with CRLF. Built from an array so no line of this file is itself a GEDCOM header. */
const ged = (...lines: string[]) => lines.join('\r\n') + '\r\n';
const HEAD = ['0 HEAD', '1 SOUR TEST', '1 GEDC', '2 VERS 5.5.1', '1 CHAR UTF-8'];
const BOM = String.fromCharCode(0xfeff);

describe('parseGedcom', () => {
  it('reads people, families and header details', () => {
    const tree = parseGedcom(
      ged(
        ...HEAD,
        '0 @I1@ INDI',
        '1 NAME Rowan /Testfold/',
        '2 GIVN Rowan',
        '2 SURN Testfold',
        '1 SEX M',
        '1 BIRT',
        '2 DATE 05 11 1986',
        '2 PLAC Vancouver, British Columbia, Canada',
        '1 RESI',
        '2 DATE 2010',
        '2 PLAC burnaby, british columbia',
        '1 FAMC @F1@',
        '0 @I2@ INDI',
        '1 NAME Dale /Testfold/',
        '1 SEX M',
        '1 FAMS @F1@',
        '0 @I3@ INDI',
        '1 NAME Edith /Otherby/',
        '1 SEX F',
        '1 FAMS @F1@',
        '0 @F1@ FAM',
        '1 HUSB @I2@',
        '1 WIFE @I3@',
        '1 CHIL @I1@',
        '1 MARR',
        '2 DATE Abt. 1980',
        '2 PLAC Toronto, York, Ontario, Canada',
        '0 TRLR',
      ),
    );
    expect(tree.warnings).toEqual([]);
    expect(tree.meta).toEqual({ source: 'TEST', gedcomVersion: '5.5.1', charset: 'UTF-8' });
    expect(tree.people.map((p) => p.id)).toEqual(['@I1@', '@I2@', '@I3@']);

    const rowan = tree.people[0];
    expect(rowan).toMatchObject({
      name: 'Rowan Testfold',
      given: 'Rowan',
      surname: 'Testfold',
      sex: 'M',
      parentFamilyIds: ['@F1@'],
      familyIds: [],
    });
    expect(rowan?.events).toEqual([
      {
        type: 'birth',
        date: {
          text: '05 11 1986',
          qualifier: 'exact',
          day: 5,
          month: 11,
          year: 1986,
          ambiguous: true,
        },
        place: 'Vancouver, British Columbia, Canada',
      },
      {
        type: 'residence',
        date: { text: '2010', qualifier: 'exact', year: 2010 },
        place: 'burnaby, british columbia',
      },
    ]);

    expect(tree.families).toEqual([
      {
        id: '@F1@',
        husbandId: '@I2@',
        wifeId: '@I3@',
        childIds: ['@I1@'],
        events: [
          {
            type: 'marriage',
            date: { text: 'Abt. 1980', qualifier: 'about', year: 1980 },
            place: 'Toronto, York, Ontario, Canada',
          },
        ],
      },
    ]);
  });

  it('accepts a byte-order mark and LF, CRLF or CR line endings', () => {
    const lines = [...HEAD, '0 @I1@ INDI', '1 NAME A /B/', '0 TRLR'];
    for (const eol of ['\n', '\r\n', '\r']) {
      const tree = parseGedcom(BOM + lines.join(eol) + eol);
      expect(tree.warnings).toEqual([]);
      expect(tree.people).toHaveLength(1);
    }
  });

  it('joins CONC without a space and CONT as a new line', () => {
    const tree = parseGedcom(
      ged(
        ...HEAD,
        '0 @I1@ INDI',
        '1 NAME A /B/',
        '1 NOTE The household left the croft after a run of poor harv',
        '2 CONC ests and sailed',
        '2 CONC  for Quebec.',
        '2 CONT See the rental of 1851.',
        '2 CONT',
        '2 CONT Last line.',
        '1 NOTE A second note.',
      ),
    );
    expect(tree.people[0]?.notes).toEqual([
      'The household left the croft after a run of poor harvests and sailed for Quebec.\nSee the rental of 1851.\n\nLast line.',
      'A second note.',
    ]);
  });

  it('tidies names: trailing spaces, quotes, parentheses, suffixes, missing parts', () => {
    const names = (line: string, ...sub: string[]) =>
      parseGedcom(ged(...HEAD, '0 @I1@ INDI', line, ...sub)).people[0];

    expect(
      names('1 NAME Mòrag (Marion) /MacFennel /', '2 GIVN Mòrag (Marion)', '2 SURN MacFennel '),
    ).toMatchObject({
      name: 'Mòrag (Marion) MacFennel',
      given: 'Mòrag (Marion)',
      surname: 'MacFennel',
    });
    expect(names('1 NAME Murdo "Murchadh Bàn" /MacBriar/')).toMatchObject({
      name: 'Murdo "Murchadh Bàn" MacBriar',
      given: 'Murdo "Murchadh Bàn"',
      surname: 'MacBriar',
    });
    expect(names('1 NAME Walter /Testfold/ Jr.')).toMatchObject({
      name: 'Walter Testfold Jr.',
      given: 'Walter Jr.',
      surname: 'Testfold',
    });
    expect(names('1 NAME   Angus  ')).toMatchObject({ name: 'Angus', given: 'Angus', surname: '' });
    expect(names('1 NAME //')).toMatchObject({ name: '', given: '', surname: '' });
    expect(names('1 SEX X')).toMatchObject({ name: '', sex: 'U' });
  });

  it('keeps every parent family, birth family first', () => {
    const tree = parseGedcom(
      ged(
        ...HEAD,
        '0 @I1@ INDI',
        '1 FAMC @F1@',
        '1 FAMC @F2@',
        '0 @F1@ FAM',
        '1 CHIL @I1@',
        '0 @F2@ FAM',
        '1 CHIL @I1@',
      ),
    );
    expect(tree.people[0]?.parentFamilyIds).toEqual(['@F1@', '@F2@']);
    expect(tree.warnings).toEqual([]);
  });

  it('reads events with a date, a place, both or neither', () => {
    const tree = parseGedcom(
      ged(
        ...HEAD,
        '0 @I1@ INDI',
        '1 BIRT',
        '2 DATE Abt. 1953',
        '1 CHR',
        '2 PLAC Ness, Lewis, Ross and Cromarty, Scotland',
        '1 DEAT Y',
        '1 BURI',
        '1 OCCU Crofter',
      ),
    );
    expect(tree.people[0]?.events).toEqual([
      { type: 'birth', date: { text: 'Abt. 1953', qualifier: 'about', year: 1953 } },
      { type: 'baptism', place: 'Ness, Lewis, Ross and Cromarty, Scotland' },
      { type: 'death' },
      { type: 'burial' },
    ]);
  });

  it('reports problems as warnings instead of throwing', () => {
    const tree = parseGedcom(
      ged(
        '0 @I1@ INDI',
        '1 NAME A /B/',
        'this is not a gedcom line',
        '3 DATE 1900',
        '1 FAMC @F9@',
        '1 FAMS @F1@',
        '0 @I1@ INDI',
        '1 NAME Duplicate /Id/',
        '0 @I2@ INDI',
        '1 FAMC @F1@',
        '0 @F1@ FAM',
        '1 HUSB @I7@',
        '1 CHAR ANSEL',
      ),
    );
    expect(tree.people.map((p) => p.name)).toEqual(['A B', '']);
    expect(tree.warnings).toEqual([
      { code: 'unparseable-line', line: 3 },
      { code: 'unparseable-line', line: 4 },
      { code: 'no-header' },
      { code: 'duplicate-id', id: '@I1@' },
      { code: 'missing-family', id: '@I1@' },
      { code: 'link-not-reciprocated', id: '@I1@' },
      { code: 'link-not-reciprocated', id: '@I2@' },
      { code: 'missing-person', id: '@F1@' },
    ]);
  });

  it('warns about a character set it cannot decode properly', () => {
    const tree = parseGedcom(ged('0 HEAD', '1 CHAR ANSEL', '0 TRLR'));
    expect(tree.warnings).toEqual([{ code: 'unsupported-charset' }]);
    expect(parseGedcom('').warnings).toEqual([{ code: 'no-header' }]);
  });
});
