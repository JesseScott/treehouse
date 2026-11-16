import { describe, expect, it } from 'vitest';
import { dateSortKey, parseDate } from './dates';

/** The parsed fields without the echoed text, for compact assertions. */
function fields(input: string) {
  const { text, ...rest } = parseDate(input);
  expect(text).toBe(input.trim());
  return rest;
}

describe('parseDate', () => {
  it('reads full dates in either case', () => {
    expect(fields('12 Mar 1901')).toEqual({ qualifier: 'exact', day: 12, month: 3, year: 1901 });
    expect(fields('12 MAR 1901')).toEqual({ qualifier: 'exact', day: 12, month: 3, year: 1901 });
    expect(fields('3 September 1928')).toEqual({
      qualifier: 'exact',
      day: 3,
      month: 9,
      year: 1928,
    });
    expect(fields('March 12, 1901')).toEqual({ qualifier: 'exact', day: 12, month: 3, year: 1901 });
    expect(fields('1901-03-12')).toEqual({ qualifier: 'exact', day: 12, month: 3, year: 1901 });
  });

  it('reads partial dates', () => {
    expect(fields('Jul 1823')).toEqual({ qualifier: 'exact', month: 7, year: 1823 });
    expect(fields('1785')).toEqual({ qualifier: 'exact', year: 1785 });
    // No year at all: keep what there is.
    expect(fields('14 Feb')).toEqual({ qualifier: 'exact', day: 14, month: 2 });
    expect(fields('  1785 ')).toEqual({ qualifier: 'exact', year: 1785 });
  });

  it('reads qualifiers as exports write them', () => {
    expect(fields('Abt. 1883')).toEqual({ qualifier: 'about', year: 1883 });
    expect(fields('ABT 1883')).toEqual({ qualifier: 'about', year: 1883 });
    expect(fields('about 12 Mar 1901')).toMatchObject({ qualifier: 'about', day: 12, year: 1901 });
    expect(fields('c. 1880')).toEqual({ qualifier: 'about', year: 1880 });
    expect(fields('After 1881')).toEqual({ qualifier: 'after', year: 1881 });
    expect(fields('AFT 1881')).toEqual({ qualifier: 'after', year: 1881 });
    expect(fields('Bef. 1850')).toEqual({ qualifier: 'before', year: 1850 });
    expect(fields('BEF Jul 1850')).toEqual({ qualifier: 'before', month: 7, year: 1850 });
    expect(fields('EST 1790')).toEqual({ qualifier: 'estimated', year: 1790 });
    expect(fields('CAL 1790')).toEqual({ qualifier: 'calculated', year: 1790 });
  });

  it('reads ranges', () => {
    expect(fields('Bet. 1840-1845')).toEqual({ qualifier: 'between', year: 1840, yearEnd: 1845 });
    expect(fields('BET 1840 AND 1845')).toEqual({
      qualifier: 'between',
      year: 1840,
      yearEnd: 1845,
    });
    expect(fields('1840-1845')).toEqual({ qualifier: 'between', year: 1840, yearEnd: 1845 });
    expect(fields('FROM 1840 TO 1845')).toEqual({
      qualifier: 'between',
      year: 1840,
      yearEnd: 1845,
    });
    expect(fields('BET Jan 1840 AND Mar 1841')).toEqual({
      qualifier: 'between',
      month: 1,
      year: 1840,
      yearEnd: 1841,
    });
  });

  it('flags all-numeric dates that could be read two ways', () => {
    expect(fields('05 11 1977')).toEqual({
      qualifier: 'exact',
      day: 5,
      month: 11,
      year: 1977,
      ambiguous: true,
    });
    expect(fields('05/11/1977').ambiguous).toBe(true);
    // Only one reading is possible when a part is over 12, or both parts are equal.
    expect(fields('25 11 1977')).toEqual({ qualifier: 'exact', day: 25, month: 11, year: 1977 });
    expect(fields('11 25 1977')).toEqual({ qualifier: 'exact', day: 25, month: 11, year: 1977 });
    expect(fields('07 07 1977')).toEqual({ qualifier: 'exact', day: 7, month: 7, year: 1977 });
  });

  it('never throws, and salvages a year from free text', () => {
    expect(fields('')).toEqual({ qualifier: 'exact' });
    expect(fields('unknown')).toEqual({ qualifier: 'exact' });
    expect(fields('Spring of 1867, probably')).toEqual({ qualifier: 'exact', year: 1867 });
    expect(fields('32 Foo 1901')).toEqual({ qualifier: 'exact', year: 1901 });
    expect(fields('32 Mar 1901')).toEqual({ qualifier: 'exact', month: 3, year: 1901 });
    expect(fields('99 99 1901')).toEqual({ qualifier: 'exact', year: 1901 });
  });
});

describe('dateSortKey', () => {
  it('orders by year, then month, then day, with undated last', () => {
    const texts = ['1901', 'unknown', '12 Mar 1901', 'Jul 1823', 'Feb 1901'];
    const sorted = [...texts].sort((a, b) => dateSortKey(parseDate(a)) - dateSortKey(parseDate(b)));
    expect(sorted).toEqual(['Jul 1823', '1901', 'Feb 1901', '12 Mar 1901', 'unknown']);
    expect(dateSortKey(undefined)).toBe(Number.POSITIVE_INFINITY);
  });
});
