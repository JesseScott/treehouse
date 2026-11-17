import type { ImportErrorCode } from '../gedcom/readGedcom';
import type { Coverage } from '../geocode/treePlaces';
import type { PlaceLevel, PlaceResult } from '../geocode/types';

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

export const placeCount = (count: number) => plural(count, 'place', 'places');
export const eventCount = (count: number) => plural(count, 'event', 'events');

/** One line on how many of a tree's places are on the map. */
export function coverageSummary(coverage: Coverage): string {
  if (coverage.places === 0) return 'This tree names no places.';
  const parts = [`${coverage.resolved.toLocaleString('en')} found`];
  if (coverage.approximate > 0)
    parts.push(`${coverage.approximate.toLocaleString('en')} approximate`);
  if (coverage.unresolved > 0) parts.push(`${coverage.unresolved.toLocaleString('en')} not found`);
  return `${placeCount(coverage.places)}: ${parts.join(', ')}.`;
}

const LEVELS: Record<PlaceLevel, string> = {
  place: 'nearest known place',
  area: 'area',
  region: 'region',
  country: 'country',
};

/** How one place was placed, in words. */
export function placeOutcome(result: PlaceResult): string {
  if (result.status === 'unresolved') return 'Not found';
  if (result.source === 'manual') return 'Pinned by you';
  if (result.source === 'online') return `Found online: ${result.label}`;
  return result.status === 'resolved'
    ? `Found: ${result.label}`
    : `Approximate, ${LEVELS[result.level]}: ${result.label}`;
}
