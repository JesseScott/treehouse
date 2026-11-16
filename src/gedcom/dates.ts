/**
 * GEDCOM date parsing. Real exports hold free text ("Abt. 1883", "After 1881",
 * "Jul 1823", "05 11 1977"), so this never throws: it extracts what it can and
 * keeps the original text.
 */
export type DateQualifier =
  'exact' | 'about' | 'before' | 'after' | 'between' | 'estimated' | 'calculated';

export interface ParsedDate {
  /** The date exactly as written in the file. */
  text: string;
  qualifier: DateQualifier;
  year?: number;
  /** 1 to 12. */
  month?: number;
  day?: number;
  /** The later year of a "between" range. */
  yearEnd?: number;
  /** True for all-numeric dates where day and month could be swapped ("05 11 1977"). */
  ambiguous?: boolean;
}

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const QUALIFIERS: [RegExp, DateQualifier][] = [
  [/^(abt|about|circa|ca|c)\.?\s+/i, 'about'],
  [/^(bef|before)\.?\s+/i, 'before'],
  [/^(aft|after)\.?\s+/i, 'after'],
  [/^(est|estimated)\.?\s+/i, 'estimated'],
  [/^(cal|calculated)\.?\s+/i, 'calculated'],
];

const YEAR = String.raw`(\d{3,4})`;
const BETWEEN = [
  new RegExp(String.raw`^(?:bet|btw|between)\.?\s+(.+?)\s+(?:and|&)\s+(.+)$`, 'i'),
  new RegExp(String.raw`^(?:bet|btw|between)\.?\s+(.+?)\s*[-–]\s*(.+)$`, 'i'),
  new RegExp(String.raw`^from\s+(.+?)\s+to\s+(.+)$`, 'i'),
  new RegExp(String.raw`^${YEAR}\s*[-–]\s*${YEAR}$`),
];

function monthNumber(word: string): number | undefined {
  return MONTHS[word.slice(0, 3).toLowerCase()];
}

const inRange = (value: number, lo: number, hi: number) => value >= lo && value <= hi;

type DateParts = Omit<ParsedDate, 'text' | 'qualifier'>;

/** Parses one plain date: "12 Mar 1901", "Mar 1901", "1901", "March 12, 1901", "05 11 1977", "1901-03-12". */
function readSimple(text: string): DateParts {
  const clean = text.replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();

  let m = /^(\d{1,2}) ([A-Za-z]{3,9}) (\d{3,4})$/.exec(clean);
  if (m?.[1] && m[2] && m[3]) {
    const month = monthNumber(m[2]);
    if (month) return { day: Number(m[1]), month, year: Number(m[3]) };
  }
  m = /^([A-Za-z]{3,9}) (\d{1,2}) (\d{3,4})$/.exec(clean);
  if (m?.[1] && m[2] && m[3]) {
    const month = monthNumber(m[1]);
    if (month) return { day: Number(m[2]), month, year: Number(m[3]) };
  }
  m = /^([A-Za-z]{3,9}) (\d{3,4})$/.exec(clean);
  if (m?.[1] && m[2]) {
    const month = monthNumber(m[1]);
    if (month) return { month, year: Number(m[2]) };
  }
  // A day and month with no year ("14 Feb"): seen in real exports.
  m = /^(\d{1,2}) ([A-Za-z]{3,9})$/.exec(clean);
  if (m?.[1] && m[2]) {
    const month = monthNumber(m[2]);
    if (month) return { day: Number(m[1]), month };
  }
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(clean);
  if (m?.[1] && m[2] && m[3] && inRange(Number(m[2]), 1, 12)) {
    return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  }
  // All numeric with the year last: day and month may be either way round.
  m = /^(\d{1,2})[ /-](\d{1,2})[ /-](\d{3,4})$/.exec(clean);
  if (m?.[1] && m[2] && m[3]) {
    const first = Number(m[1]);
    const second = Number(m[2]);
    const year = Number(m[3]);
    if (first > 12 && inRange(second, 1, 12)) return { day: first, month: second, year };
    if (second > 12 && inRange(first, 1, 12)) return { day: second, month: first, year };
    if (inRange(first, 1, 12) && inRange(second, 1, 12)) {
      // Day first, as GEDCOM writes dates; flagged unless both readings agree.
      return { day: first, month: second, year, ...(first === second ? {} : { ambiguous: true }) };
    }
    return { year };
  }
  m = /^(\d{3,4})$/.exec(clean);
  if (m?.[1]) return { year: Number(m[1]) };

  // Anything else: take a four-digit year if there is one.
  m = /\b(1\d{3}|20\d{2})\b/.exec(clean);
  return m?.[1] ? { year: Number(m[1]) } : {};
}

/** As `readSimple`, but an impossible day ("32 Mar 1901") is dropped rather than kept. */
function parseSimple(text: string): DateParts {
  const parts = readSimple(text);
  if (parts.day !== undefined && !inRange(parts.day, 1, 31)) delete parts.day;
  return parts;
}

export function parseDate(input: string): ParsedDate {
  const text = input.trim();

  for (const pattern of BETWEEN) {
    const m = pattern.exec(text);
    if (m?.[1] && m[2]) {
      const start = parseSimple(m[1]);
      const end = parseSimple(m[2]);
      if (start.year !== undefined) {
        return {
          text,
          qualifier: 'between',
          ...start,
          ...(end.year !== undefined ? { yearEnd: end.year } : {}),
        };
      }
    }
  }

  for (const [pattern, qualifier] of QUALIFIERS) {
    if (pattern.test(text)) {
      return { text, qualifier, ...parseSimple(text.replace(pattern, '')) };
    }
  }
  return { text, qualifier: 'exact', ...parseSimple(text) };
}

/** A number that orders dates in time; undated values sort last. */
export function dateSortKey(date: ParsedDate | undefined): number {
  if (date?.year === undefined) return Number.POSITIVE_INFINITY;
  return date.year * 10000 + (date.month ?? 0) * 100 + (date.day ?? 0);
}
