/** How well a place string was placed on the map. */
export type PlaceStatus = 'resolved' | 'approximate' | 'unresolved';

/** Where a location came from. */
export type PlaceSource = 'gazetteer' | 'online' | 'manual';

/** How specific a match is: a town, an area such as a county or island, a province, a country. */
export type PlaceLevel = 'place' | 'area' | 'region' | 'country';

export interface LngLat {
  lng: number;
  lat: number;
}

export type PlaceResult =
  | { status: 'unresolved' }
  | {
      status: 'resolved' | 'approximate';
      lng: number;
      lat: number;
      /** What was matched, for example "Kincardine, Ontario, Canada". Empty for a manual pin. */
      label: string;
      level: PlaceLevel;
      source: PlaceSource;
    };

export const UNRESOLVED: PlaceResult = { status: 'unresolved' };

/** One distinct place in a tree, with how many events happened there. */
export interface TreePlace {
  /** `placeKey` of the text: the identity shared by every spelling. */
  key: string;
  /** The place as first written in the file. */
  text: string;
  events: number;
  result: PlaceResult;
}

/** The file `tools/gazetteer/build.mjs` writes as `gazetteer/index.json`. */
export interface GazetteerIndex {
  source: string;
  built: string;
  detail: string[];
  countries: { code: string; name: string; lat: number; lng: number }[];
  regions: { country: string; code: string; name: string; lat: number; lng: number }[];
  /** Country code to number of entries; each has a `<code>.txt` shard. */
  shards: Record<string, number>;
}
