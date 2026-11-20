import type { ImportErrorCode } from '../gedcom/readGedcom';
import type { FileAccessErrorCode } from '../library/fileAccess';
import type { PlaceFileError } from '../library/placeCache';
import type { SyncDiff } from '../library/syncDiff';
import type { FamilyEventType, PersonEventType } from '../gedcom/types';
import type { FocusPlace, OwnBasis } from '../geocode/focusPlace';
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

/** The wording for each reason a sync could not read the file. */
export const SYNC_ERRORS: Record<ImportErrorCode | FileAccessErrorCode, string> = {
  ...IMPORT_ERRORS,
  unknown: 'Something went wrong reading that file. Nothing was changed.',
  'permission-denied': 'The browser was not allowed to read the file again. Nothing was changed.',
  'file-missing':
    'The file is no longer where it was. Choose it again with “Sync from a file”. Nothing was changed.',
};

export const PLACE_FILE_ERRORS: Record<PlaceFileError, string> = {
  'not-a-place-file': 'That is not a file of places saved by treehouse.',
  'newer-version': 'That file was saved by a newer version of treehouse.',
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

/** The verb for each kind of event on a timeline. */
export const EVENT_WORDS: Record<PersonEventType | FamilyEventType, string> = {
  birth: 'Born',
  baptism: 'Baptised',
  residence: 'Lived',
  marriage: 'Married',
  divorce: 'Divorced',
  death: 'Died',
  burial: 'Buried',
};

const BASIS_PLACES: Record<OwnBasis, string> = {
  birth: 'birthplace',
  baptism: 'baptism place',
  residence: 'earliest home',
  marriage: 'marriage place',
  death: 'place of death',
  burial: 'burial place',
};

/** Why the focused person is shown where they are, in words. */
export function focusNote(place: FocusPlace | null, relativeName?: string): string {
  if (!place) return 'Nobody close to this person has a place on the map yet.';
  if (place.basis === 'relative') {
    const theirs = BASIS_PLACES[place.relativeBasis ?? 'birth'];
    return `Approximate: shown at ${relativeName ?? 'a relative'}’s ${theirs}, as no place of their own is on the map.`;
  }
  if (place.basis === 'birth') {
    return place.approximate
      ? 'Shown at their birthplace, which is only placed roughly.'
      : 'Shown at their birthplace.';
  }
  return `Approximate: shown at their ${BASIS_PLACES[place.basis]}, as their birthplace is not on the map.`;
}

export const pinCount = (count: number) =>
  plural(count, 'pin or online answer', 'pins and online answers');

/** What a sync will change, as short phrases; empty when nothing changed. */
export function diffSummary(diff: SyncDiff): string[] {
  const parts: string[] = [];
  if (diff.added.length > 0) parts.push(`${peopleCount(diff.added.length)} added`);
  if (diff.removed.length > 0) parts.push(`${peopleCount(diff.removed.length)} removed`);
  if (diff.changed.length > 0) parts.push(`${peopleCount(diff.changed.length)} changed`);
  const families = diff.families.added + diff.families.removed + diff.families.changed;
  if (families > 0) parts.push(`${familyCount(families)} added, removed or changed`);
  if (diff.newPlaces.length > 0) parts.push(`${placeCount(diff.newPlaces.length)} new`);
  if (diff.droppedPlaces.length > 0)
    parts.push(`${placeCount(diff.droppedPlaces.length)} no longer named`);
  return parts;
}
