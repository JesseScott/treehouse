import { ancestorLinks } from '../gedcom/lines';
import {
  childrenOf,
  parentsOf,
  relationship,
  spousesOf,
  type TreeIndex,
} from '../gedcom/relatives';
import type { Person } from '../gedcom/types';
import { focusPlaceOf, type Locate } from '../geocode/focusPlace';

export const THREAD_KINDS = ['lineage', 'family', 'ancestors', 'migration'] as const;
/**
 * - `lineage`: from the home person through each generation to the focused person.
 * - `family`: from the focused person to their parents, spouses and children.
 * - `ancestors`: every ancestor of the home person, each joined to their child.
 * - `migration`: the focused person's own places in the order they lived them.
 */
export type ThreadKind = (typeof THREAD_KINDS)[number];
export type ThreadToggles = Record<ThreadKind, boolean>;

export const THREAD_SOURCE = 'threads';
export const THREAD_LAYERS = ['thread-casing', 'thread-lines'] as const;
export const THREAD_COLORS: Record<ThreadKind, string> = {
  lineage: '#ffd166',
  family: '#ef476f',
  ancestors: '#f1faee',
  migration: '#b388eb',
};

type Point = [number, number];

export interface ThreadProperties {
  kind: ThreadKind;
  /** True when either end is a place found only approximately. */
  approximate: boolean;
}

export interface ThreadCollection {
  type: 'FeatureCollection';
  features: {
    type: 'Feature';
    geometry: { type: 'LineString'; coordinates: Point[] };
    properties: ThreadProperties;
  }[];
}

const RAD = Math.PI / 180;

/** Angular distance between two points, in radians. */
function angle([lng1, lat1]: Point, [lng2, lat2]: Point): number {
  const h =
    Math.sin(((lat2 - lat1) * RAD) / 2) ** 2 +
    Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(((lng2 - lng1) * RAD) / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Ends closer than this (about 1 km) are the same place: no thread is drawn between them. */
const SAME_PLACE = 1 / 6371;

/**
 * The great-circle arc from `a` to `b` as a line of points. Longitudes are unwrapped so that
 * consecutive points never jump by more than 180°, which keeps a line across the date line whole.
 */
export function arc(a: Point, b: Point, segments = 48): Point[] {
  const d = angle(a, b);
  const toVector = ([lng, lat]: Point) => [
    Math.cos(lat * RAD) * Math.cos(lng * RAD),
    Math.cos(lat * RAD) * Math.sin(lng * RAD),
    Math.sin(lat * RAD),
  ];
  const va = toVector(a);
  const vb = toVector(b);
  const points: Point[] = [];
  let previousLng = a[0];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    let x: number, y: number, z: number;
    if (Math.sin(d) < 1e-9) {
      // The same point or exactly opposite: no unique great circle, so go straight.
      x = (va[0] ?? 0) * (1 - t) + (vb[0] ?? 0) * t;
      y = (va[1] ?? 0) * (1 - t) + (vb[1] ?? 0) * t;
      z = (va[2] ?? 0) * (1 - t) + (vb[2] ?? 0) * t;
    } else {
      const wa = Math.sin((1 - t) * d) / Math.sin(d);
      const wb = Math.sin(t * d) / Math.sin(d);
      x = wa * (va[0] ?? 0) + wb * (vb[0] ?? 0);
      y = wa * (va[1] ?? 0) + wb * (vb[1] ?? 0);
      z = wa * (va[2] ?? 0) + wb * (vb[2] ?? 0);
    }
    // The ends are the points themselves, not a rounding of them.
    let lng = i === 0 ? a[0] : i === segments ? b[0] : Math.atan2(y, x) / RAD;
    const lat = i === 0 ? a[1] : i === segments ? b[1] : Math.atan2(z, Math.hypot(x, y)) / RAD;
    while (lng - previousLng > 180) lng -= 360;
    while (lng - previousLng < -180) lng += 360;
    previousLng = lng;
    points.push([lng, lat]);
  }
  return points;
}

interface Located {
  at: Point;
  approximate: boolean;
}

export interface ThreadInput {
  index: TreeIndex;
  rootId: string | null;
  focusedId: string | null;
  locate: Locate;
  on: ThreadToggles;
}

const EVENT_ORDER = ['birth', 'baptism', 'residence', 'marriage', 'divorce', 'death', 'burial'];

/** A person's own events with a place on the map, in the order they happened. */
function lifePlaces(index: TreeIndex, person: Person, locate: Locate): Located[] {
  const events = [
    ...person.events,
    ...spousesOf(index, person).flatMap(({ family }) => family.events),
  ];
  const fallback = (type: string) =>
    type === 'birth' || type === 'baptism' ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
  const sorted = events
    .map((event, i) => ({ event, i }))
    .sort(
      (a, b) =>
        (a.event.date?.year ?? fallback(a.event.type)) -
          (b.event.date?.year ?? fallback(b.event.type)) ||
        EVENT_ORDER.indexOf(a.event.type) - EVENT_ORDER.indexOf(b.event.type) ||
        a.i - b.i,
    );
  const out: Located[] = [];
  for (const { event } of sorted) {
    if (event.place === undefined) continue;
    const result = locate(event.place);
    if (!result || result.status === 'unresolved') continue;
    out.push({ at: [result.lng, result.lat], approximate: result.status === 'approximate' });
  }
  return out;
}

/** The threads to draw: one line per arc, for the kinds that are switched on. */
export function threadCollection(input: ThreadInput): ThreadCollection {
  const { index, rootId, focusedId, locate, on } = input;
  const features: ThreadCollection['features'] = [];
  const add = (kind: ThreadKind, from: Located | null, to: Located | null) => {
    if (!from || !to || angle(from.at, to.at) < SAME_PLACE) return;
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: arc(from.at, to.at) },
      properties: { kind, approximate: from.approximate || to.approximate },
    });
  };

  // A person's own place. A place borrowed from a relative would draw a thread that is not theirs.
  const placed = new Map<string, Located | null>();
  const placeOf = (id: string): Located | null => {
    let found = placed.get(id);
    if (found === undefined) {
      const place = focusPlaceOf(index, id, locate);
      found =
        place && place.basis !== 'relative'
          ? { at: [place.lng, place.lat], approximate: place.approximate }
          : null;
      placed.set(id, found);
    }
    return found;
  };

  const root = rootId === null ? undefined : index.people.get(rootId);
  const focused = focusedId === null ? undefined : index.people.get(focusedId);

  if (on.lineage && root && focused) {
    // People on the line with no place of their own are passed over, not left as a gap.
    const points = relationship(index, root.id, focused.id)
      .path.map(placeOf)
      .filter((p): p is Located => p !== null);
    for (let i = 1; i < points.length; i++)
      add('lineage', points[i - 1] ?? null, points[i] ?? null);
  }
  if (on.family && focused) {
    const from = placeOf(focused.id);
    const family = [
      ...parentsOf(index, focused),
      ...spousesOf(index, focused).map((p) => p.spouse),
      ...childrenOf(index, focused),
    ];
    for (const relative of new Set(family)) add('family', from, placeOf(relative.id));
  }
  if (on.ancestors && root) {
    for (const { child, parent } of ancestorLinks(index, root)) {
      add('ancestors', placeOf(child.id), placeOf(parent.id));
    }
  }
  if (on.migration && focused) {
    const places = lifePlaces(index, focused, locate);
    for (let i = 1; i < places.length; i++)
      add('migration', places[i - 1] ?? null, places[i] ?? null);
  }
  return { type: 'FeatureCollection', features };
}

/** How many arcs of each kind a collection holds. */
export function threadCounts(collection: ThreadCollection): Record<ThreadKind, number> {
  const counts: Record<ThreadKind, number> = { lineage: 0, family: 0, ancestors: 0, migration: 0 };
  for (const feature of collection.features) counts[feature.properties.kind] += 1;
  return counts;
}
