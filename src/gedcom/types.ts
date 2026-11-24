import type { ParsedDate } from './dates';

/** Life events read for a person. Anything else in the file is ignored for now. */
export type PersonEventType = 'birth' | 'baptism' | 'death' | 'burial' | 'residence';
export type FamilyEventType = 'marriage' | 'divorce';

export interface GedEvent<T extends string> {
  type: T;
  date?: ParsedDate;
  /** The place exactly as written (may be lowercase, or carry a street address). */
  place?: string;
}

export interface Person {
  /** The GEDCOM cross-reference id, for example `@I420000000001@`. Stable across exports. */
  id: string;
  /** Display name: given names then surname, tidied. */
  name: string;
  given: string;
  surname: string;
  sex: 'M' | 'F' | 'U';
  /** In file order. */
  events: GedEvent<PersonEventType>[];
  /** Families this person is a child in. The first is treated as the birth family. */
  parentFamilyIds: string[];
  /** Families this person is a partner in. */
  familyIds: string[];
  notes: string[];
  /** Set on the copy shown while living people are hidden (`living.ts`): name, events and notes are gone. */
  living?: true;
}

export interface Family {
  id: string;
  husbandId?: string;
  wifeId?: string;
  childIds: string[];
  events: GedEvent<FamilyEventType>[];
}

export interface ParseWarning {
  /** A fixed code, so warnings can be counted and shown without free text from the file. */
  code:
    | 'unparseable-line'
    | 'missing-family'
    | 'missing-person'
    | 'link-not-reciprocated'
    | 'duplicate-id'
    | 'no-header'
    | 'unsupported-charset';
  /** 1-based line number, when the warning is about one line. */
  line?: number;
  /** The record id involved, when there is one. */
  id?: string;
}

export interface Tree {
  people: Person[];
  families: Family[];
  meta: {
    /** `HEAD.SOUR`: the program that wrote the file. */
    source?: string;
    /** `HEAD.GEDC.VERS`. */
    gedcomVersion?: string;
    /** `HEAD.CHAR`. */
    charset?: string;
  };
  warnings: ParseWarning[];
}
