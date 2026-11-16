import type { LngLat } from './types';

/**
 * The opt-in online lookup: OpenStreetMap's Nominatim search. It is only ever called after
 * the user turns online lookups on, and it is sent the place text and nothing else.
 */
export const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

/** Nominatim's usage policy allows one request a second; stay a little under it. */
export const NOMINATIM_INTERVAL_MS = 1100;

export interface OnlineMatch extends LngLat {
  label: string;
}

/** The request for one place: the place text is the only thing in it. */
export function nominatimRequest(placeText: string): string {
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('q', placeText);
  return url.href;
}

/** The first hit of a Nominatim response, or null when it found nothing usable. */
export function parseNominatim(body: unknown): OnlineMatch | null {
  const first: unknown = Array.isArray(body) ? body[0] : undefined;
  if (typeof first !== 'object' || first === null) return null;
  const { lat, lon, display_name: name } = first as Record<string, unknown>;
  const point = { lat: Number(lat), lng: Number(lon) };
  if (lat === undefined || lon === undefined) return null;
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return null;
  return { ...point, label: typeof name === 'string' ? name : '' };
}

/** Looks one place up. Null means "not found"; a failed request throws. */
export async function lookUpOnline(placeText: string): Promise<OnlineMatch | null> {
  const response = await fetch(nominatimRequest(placeText), {
    headers: { Accept: 'application/json' },
    referrerPolicy: 'strict-origin',
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return parseNominatim(await response.json());
}
