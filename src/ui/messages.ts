import type { ImportErrorCode } from '../gedcom/readGedcom';

/** The wording for each reason a file could not be imported. */
export const IMPORT_ERRORS: Record<ImportErrorCode, string> = {
  empty: 'That file is empty.',
  'not-gedcom':
    'That does not look like a GEDCOM file. Choose a .ged file, or the .zip your export came in.',
  'bad-zip': 'That zip file could not be read.',
  'no-gedcom-in-zip': 'That zip file has no .ged file inside it.',
  unknown: 'Something went wrong reading that file. Nothing was imported.',
};

const plural = (count: number, one: string, many: string) =>
  `${count.toLocaleString('en')} ${count === 1 ? one : many}`;

export const peopleCount = (count: number) => plural(count, 'person', 'people');
export const familyCount = (count: number) => plural(count, 'family', 'families');

export function importedOn(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
