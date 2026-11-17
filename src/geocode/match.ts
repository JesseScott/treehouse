import type { Entry, Gazetteer } from './gazetteer';
import { nameVariants, placeParts } from './normalize';
import { UNRESOLVED, type LngLat, type PlaceResult } from './types';

/** What the broad end of a place string says about where it is. */
interface Context {
  country?: string;
  region?: string;
  /** How many trailing parts the country and region used up. */
  consumed: number;
}

/** Another part of the string counts as backing a candidate when it is this close to it. */
const SUPPORT_KM = 60;

export function distanceKm(a: LngLat, b: LngLat): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/**
 * The ways the end of the string can be read: "…, Ontario, Canada" is a country and its
 * region; "…, Georgia" may be a country or a state, so both are tried and the better kept.
 */
function contextsOf(gazetteer: Gazetteer, parts: string[]): Context[] {
  const last = parts.at(-1);
  if (last === undefined) return [];
  const contexts: Context[] = [];
  const country = gazetteer.countryNamed(last);
  if (country !== undefined) {
    const before = parts.at(-2);
    const regions =
      before === undefined
        ? []
        : gazetteer.regionsNamed(before).filter((r) => r.country === country);
    for (const region of regions) contexts.push({ country, region: region.code, consumed: 2 });
    contexts.push({ country, consumed: 1 });
  }
  for (const region of gazetteer.regionsNamed(last)) {
    contexts.push({ country: region.country, region: region.code, consumed: 1 });
  }
  return contexts.length > 0 ? contexts : [{ consumed: 0 }];
}

/** The countries whose shards are needed to match this place. */
export function countriesOf(gazetteer: Gazetteer, text: string): string[] {
  const countries = contextsOf(gazetteer, placeParts(text)).flatMap((c) => c.country ?? []);
  return [...new Set(countries)];
}

/** A part with a number in it is a street address or a croft, not a place name. */
const isAddress = (part: string) => /\d/.test(part);

function candidatesFor(gazetteer: Gazetteer, part: string, context: Context): Entry[] {
  for (const name of nameVariants(part.replace(/^(near|nr) /, ''))) {
    const found = gazetteer.lookup(name, context.country, context.region);
    if (found.length > 0) return found;
  }
  return [];
}

/**
 * The best of several entries with the same name: one that sits near the other places the
 * string names ("Uig, Lewis" is the Uig on Lewis), then a town over an area, then the largest.
 */
function best(gazetteer: Gazetteer, candidates: Entry[], others: string[]): Entry | undefined {
  if (candidates.length <= 1) return candidates[0];
  const ranked = candidates.map((entry) => {
    let backing = 0;
    let distance = 0;
    for (const other of others) {
      let nearest = Infinity;
      for (const name of nameVariants(other)) {
        for (const neighbour of gazetteer.lookup(name, entry.country)) {
          if (neighbour !== entry) nearest = Math.min(nearest, distanceKm(entry, neighbour));
        }
      }
      if (nearest <= SUPPORT_KM) {
        backing += 1;
        distance += nearest;
      }
    }
    return { entry, backing, distance };
  });
  ranked.sort(
    (a, b) =>
      b.backing - a.backing ||
      a.distance - b.distance ||
      Number(a.entry.area) - Number(b.entry.area) ||
      b.entry.population - a.entry.population,
  );
  return ranked[0]?.entry;
}

interface Scored {
  result: PlaceResult;
  score: number;
}

function label(gazetteer: Gazetteer, name: string | null, context: Context): string {
  const { country, region } = context;
  return [
    name,
    country !== undefined && region !== undefined ? gazetteer.region(country, region)?.name : null,
    country !== undefined ? gazetteer.countries.get(country)?.name : null,
  ]
    .filter(Boolean)
    .join(', ');
}

/** The centre of the region or country of a context: the fallback when no town matches. */
function centreOf(gazetteer: Gazetteer, context: Context, exact: boolean): Scored {
  const { country, region } = context;
  if (country === undefined) return { result: UNRESOLVED, score: 0 };
  const where = region !== undefined ? gazetteer.region(country, region) : undefined;
  const centre = where ?? gazetteer.countries.get(country);
  if (!centre) return { result: UNRESOLVED, score: 0 };
  return {
    result: {
      status: 'approximate',
      lng: centre.lng,
      lat: centre.lat,
      label: label(gazetteer, null, where ? context : { country, consumed: 1 }),
      level: where ? 'region' : 'country',
      source: 'gazetteer',
    },
    // A string that is nothing but a region or country is exactly that, not a town of the name.
    // A named region's centre beats a broader guess made without it (22), but not a
    // county or island found inside that region (30).
    score: (exact ? 100 : where ? 25 : 10) + context.consumed,
  };
}

function matchIn(gazetteer: Gazetteer, parts: string[], context: Context): Scored {
  const remaining = parts.slice(0, parts.length - context.consumed);
  if (remaining.length === 0) return centreOf(gazetteer, context, true);
  // Still true while nothing more specific than the part in hand has been given up on.
  let specific = true;
  for (const [i, part] of remaining.entries()) {
    if (isAddress(part)) continue;
    const others = remaining.slice(i + 1).filter((other) => !isAddress(other));
    const entry = best(gazetteer, candidatesFor(gazetteer, part, context), others);
    if (entry) {
      const resolved = specific && !entry.area;
      return {
        result: {
          status: resolved ? 'resolved' : 'approximate',
          lng: entry.lng,
          lat: entry.lat,
          label: label(gazetteer, entry.name, {
            country: entry.country,
            region: entry.region,
            consumed: 0,
          }),
          level: entry.area ? 'area' : 'place',
          source: 'gazetteer',
        },
        score:
          (resolved ? 40 : context.region === undefined ? 22 : 30) +
          context.consumed +
          Math.min(entry.population, 9e6) / 1e7,
      };
    }
    specific = false;
  }
  return centreOf(gazetteer, context, false);
}

/**
 * Places a string on the map from the bundled gazetteer. The most specific part that is a
 * known place wins; when only a broader part is known (a county, an island, the province)
 * the result is flagged approximate. The shards for `countriesOf(text)` must be loaded.
 */
export function matchPlace(gazetteer: Gazetteer, text: string): PlaceResult {
  const parts = placeParts(text);
  let winner: Scored = { result: UNRESOLVED, score: -1 };
  for (const context of contextsOf(gazetteer, parts)) {
    const scored = matchIn(gazetteer, parts, context);
    if (scored.score > winner.score) winner = scored;
  }
  return winner.result;
}
