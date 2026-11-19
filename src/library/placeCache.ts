import type { StoredPlace } from './db';

/**
 * The file the user can save their pins and online lookup answers to, and read back in another
 * browser. It holds place text the user already has (as its comparison key), coordinates and
 * the online service's label: never a name, a date or anything else from a tree.
 */
export const PLACE_FILE_FORMAT = 'treehouse-places';
export const PLACE_FILE_VERSION = 1;

export interface PlaceFile {
  format: typeof PLACE_FILE_FORMAT;
  version: typeof PLACE_FILE_VERSION;
  /** ISO timestamp. */
  exportedAt: string;
  places: StoredPlace[];
}

export function placeFile(places: StoredPlace[], now = new Date()): PlaceFile {
  const sorted = [...places].sort((a, b) => a.key.localeCompare(b.key));
  return {
    format: PLACE_FILE_FORMAT,
    version: PLACE_FILE_VERSION,
    exportedAt: now.toISOString(),
    // Only the known fields, in a fixed order, whatever else a record might carry.
    places: sorted.map(({ key, source, location, label, updatedAt }) => ({
      key,
      source,
      location: location && { lng: location.lng, lat: location.lat },
      label,
      updatedAt,
    })),
  };
}

/** The file name an export is saved as, dated so several do not overwrite each other. */
export const placeFileName = (now = new Date()) =>
  `treehouse-places-${now.toISOString().slice(0, 10)}.json`;

/** Why a chosen file could not be read as a place file. A fixed code. */
export type PlaceFileError = 'not-a-place-file' | 'newer-version';

export class PlaceFileReadError extends Error {
  constructor(readonly code: PlaceFileError) {
    super(code);
    this.name = 'PlaceFileReadError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const finite = (value: unknown, limit: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit;

/** One entry of a place file, checked field by field; null when it is not a valid place. */
function readPlace(value: unknown): StoredPlace | null {
  if (!isRecord(value)) return null;
  const { key, source, location, label, updatedAt } = value;
  if (typeof key !== 'string' || key.trim() === '' || key.length > 500) return null;
  if (source !== 'manual' && source !== 'online') return null;
  if (typeof label !== 'string' || typeof updatedAt !== 'string') return null;
  if (Number.isNaN(Date.parse(updatedAt))) return null;
  let at: StoredPlace['location'] = null;
  if (location !== null) {
    if (!isRecord(location) || !finite(location.lng, 180) || !finite(location.lat, 90)) {
      return null;
    }
    at = { lng: location.lng, lat: location.lat };
  }
  // A pin with no location means nothing; an online "found nothing" answer does.
  if (source === 'manual' && at === null) return null;
  return { key, source, location: at, label: label.slice(0, 500), updatedAt };
}

/** Reads a place file's text. Entries that are not valid places are counted and left out. */
export function readPlaceFile(text: string): { places: StoredPlace[]; invalid: number } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new PlaceFileReadError('not-a-place-file');
  }
  if (!isRecord(parsed) || parsed.format !== PLACE_FILE_FORMAT || !Array.isArray(parsed.places)) {
    throw new PlaceFileReadError('not-a-place-file');
  }
  if (typeof parsed.version !== 'number' || parsed.version > PLACE_FILE_VERSION) {
    throw new PlaceFileReadError('newer-version');
  }
  const places: StoredPlace[] = [];
  let invalid = 0;
  for (const entry of parsed.places as unknown[]) {
    const place = readPlace(entry);
    if (place) places.push(place);
    else invalid += 1;
  }
  return { places, invalid };
}

export interface MergeResult {
  /** The places to store: new ones and the ones that replace what is there. */
  save: StoredPlace[];
  added: number;
  updated: number;
  /** Already there, or kept because what is there wins. */
  skipped: number;
}

/**
 * Which incoming places to keep. A pin the user set wins over an online answer; otherwise the
 * more recent of the two wins, and an identical one is skipped.
 */
export function mergePlaces(existing: StoredPlace[], incoming: StoredPlace[]): MergeResult {
  const current = new Map(existing.map((place) => [place.key, place]));
  const result: MergeResult = { save: [], added: 0, updated: 0, skipped: 0 };
  for (const place of incoming) {
    const there = current.get(place.key);
    if (!there) {
      result.added += 1;
    } else {
      const pinBeatsLookup = there.source === 'manual' && place.source === 'online';
      const lookupLosesToPin = there.source === 'online' && place.source === 'manual';
      const newer = place.updatedAt > there.updatedAt;
      const same =
        JSON.stringify(placeFile([there]).places) === JSON.stringify(placeFile([place]).places);
      if (same || pinBeatsLookup || (!lookupLosesToPin && !newer)) {
        result.skipped += 1;
        continue;
      }
      result.updated += 1;
    }
    current.set(place.key, place);
    result.save.push(place);
  }
  return result;
}
