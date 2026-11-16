import { parseDate } from './dates';
import type {
  Family,
  FamilyEventType,
  GedEvent,
  ParseWarning,
  Person,
  PersonEventType,
  Tree,
} from './types';

/** `level [@xref@] TAG [value]`, as in the planning session's reference parser. */
const LINE = /^\s*(\d+)\s+(?:(@[^@]+@)\s+)?(\S+)(?: (.*))?$/;
const BOM = String.fromCharCode(0xfeff);

interface Node {
  tag: string;
  xref: string | undefined;
  value: string;
  children: Node[];
}

const PERSON_EVENTS: Record<string, PersonEventType> = {
  BIRT: 'birth',
  BAPM: 'baptism',
  CHR: 'baptism',
  DEAT: 'death',
  BURI: 'burial',
  RESI: 'residence',
};
const FAMILY_EVENTS: Record<string, FamilyEventType> = { MARR: 'marriage', DIV: 'divorce' };

/** Turns the text into a forest of records, folding CONT and CONC into their parent's value. */
function readRecords(text: string, warnings: ParseWarning[]): Node[] {
  const records: Node[] = [];
  const stack: Node[] = [];
  const lines = text.split(/\r\n|\r|\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = i === 0 ? (lines[i] ?? '').replace(BOM, '') : (lines[i] ?? '');
    if (!raw.trim()) continue;
    const m = LINE.exec(raw);
    if (!m?.[1] || !m[3]) {
      warnings.push({ code: 'unparseable-line', line: i + 1 });
      continue;
    }
    const level = Number(m[1]);
    const tag = m[3].toUpperCase();
    const value = m[4] ?? '';

    if ((tag === 'CONT' || tag === 'CONC') && level > 0 && level === stack.length) {
      const parent = stack[level - 1];
      if (parent) parent.value += (tag === 'CONT' ? '\n' : '') + value;
      continue;
    }
    if (level > stack.length) {
      warnings.push({ code: 'unparseable-line', line: i + 1 });
      continue;
    }
    stack.length = level;
    const node: Node = { tag, xref: m[2], value, children: [] };
    const parent = stack[level - 1];
    if (parent) parent.children.push(node);
    else records.push(node);
    stack.push(node);
  }
  return records;
}

const child = (node: Node | undefined, tag: string) => node?.children.find((c) => c.tag === tag);
const children = (node: Node, tag: string) => node.children.filter((c) => c.tag === tag);
const tidy = (text: string) => text.replace(/\s+/g, ' ').trim();

function readEvent<T extends string>(node: Node, type: T): GedEvent<T> {
  const date = child(node, 'DATE')?.value.trim();
  const place = child(node, 'PLAC')?.value.trim();
  return { type, ...(date ? { date: parseDate(date) } : {}), ...(place ? { place } : {}) };
}

/** Splits `Given Names /Surname/ Suffix` and tidies stray spaces, as in `/MacFennel /`. */
function readName(node: Node | undefined): Pick<Person, 'name' | 'given' | 'surname'> {
  const raw = node?.value ?? '';
  const m = /^(.*?)\/(.*?)\/(.*)$/.exec(raw);
  const given = tidy(child(node, 'GIVN')?.value ?? (m ? `${m[1] ?? ''} ${m[3] ?? ''}` : raw));
  const surname = tidy(child(node, 'SURN')?.value ?? m?.[2] ?? '');
  const name =
    tidy(m ? `${m[1] ?? ''} ${m[2] ?? ''} ${m[3] ?? ''}` : raw) || tidy(`${given} ${surname}`);
  return { name, given, surname };
}

function readPerson(node: Node, id: string): Person {
  const sex = child(node, 'SEX')?.value.trim().toUpperCase();
  const events: GedEvent<PersonEventType>[] = [];
  for (const c of node.children) {
    const type = PERSON_EVENTS[c.tag];
    if (type) events.push(readEvent(c, type));
  }
  return {
    id,
    ...readName(child(node, 'NAME')),
    sex: sex === 'M' || sex === 'F' ? sex : 'U',
    events,
    parentFamilyIds: children(node, 'FAMC').map((c) => c.value.trim()),
    familyIds: children(node, 'FAMS').map((c) => c.value.trim()),
    notes: children(node, 'NOTE')
      .map((c) => c.value)
      .filter((note) => note.trim() !== ''),
  };
}

function readFamily(node: Node, id: string): Family {
  const husbandId = child(node, 'HUSB')?.value.trim();
  const wifeId = child(node, 'WIFE')?.value.trim();
  const events: GedEvent<FamilyEventType>[] = [];
  for (const c of node.children) {
    const type = FAMILY_EVENTS[c.tag];
    if (type) events.push(readEvent(c, type));
  }
  return {
    id,
    ...(husbandId ? { husbandId } : {}),
    ...(wifeId ? { wifeId } : {}),
    childIds: children(node, 'CHIL').map((c) => c.value.trim()),
    events,
  };
}

/** Records links that point nowhere or are not mirrored on the other side. Nothing is repaired. */
function checkLinks(people: Person[], families: Family[], warnings: ParseWarning[]): void {
  const personById = new Map(people.map((p) => [p.id, p]));
  const familyById = new Map(families.map((f) => [f.id, f]));
  for (const person of people) {
    for (const familyId of [...person.parentFamilyIds, ...person.familyIds]) {
      if (!familyById.has(familyId)) warnings.push({ code: 'missing-family', id: person.id });
    }
    for (const familyId of person.parentFamilyIds) {
      const family = familyById.get(familyId);
      if (family && !family.childIds.includes(person.id)) {
        warnings.push({ code: 'link-not-reciprocated', id: person.id });
      }
    }
    for (const familyId of person.familyIds) {
      const family = familyById.get(familyId);
      if (family && family.husbandId !== person.id && family.wifeId !== person.id) {
        warnings.push({ code: 'link-not-reciprocated', id: person.id });
      }
    }
  }
  for (const family of families) {
    for (const personId of [family.husbandId, family.wifeId, ...family.childIds]) {
      if (personId && !personById.has(personId)) {
        warnings.push({ code: 'missing-person', id: family.id });
      }
    }
  }
}

/**
 * Parses GEDCOM text into people and families. It is forgiving: bad lines and
 * broken links become warnings, never exceptions, because real exports have both.
 */
export function parseGedcom(text: string): Tree {
  const warnings: ParseWarning[] = [];
  const records = readRecords(text, warnings);

  const head = records.find((r) => r.tag === 'HEAD');
  if (!head) warnings.push({ code: 'no-header' });
  const source = child(head, 'SOUR')?.value.trim();
  const gedcomVersion = child(child(head, 'GEDC'), 'VERS')?.value.trim();
  const charset = child(head, 'CHAR')?.value.trim();
  if (charset && !/^(utf-?8|ascii|unicode)$/i.test(charset)) {
    warnings.push({ code: 'unsupported-charset' });
  }

  const people: Person[] = [];
  const families: Family[] = [];
  const seen = new Set<string>();
  for (const record of records) {
    if (!record.xref || (record.tag !== 'INDI' && record.tag !== 'FAM')) continue;
    if (seen.has(record.xref)) {
      warnings.push({ code: 'duplicate-id', id: record.xref });
      continue;
    }
    seen.add(record.xref);
    if (record.tag === 'INDI') people.push(readPerson(record, record.xref));
    else families.push(readFamily(record, record.xref));
  }
  checkLinks(people, families, warnings);

  return {
    people,
    families,
    meta: {
      ...(source ? { source } : {}),
      ...(gedcomVersion ? { gedcomVersion } : {}),
      ...(charset ? { charset } : {}),
    },
    warnings,
  };
}
