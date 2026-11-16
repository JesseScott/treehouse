import { nameVariants, normalizeName } from './normalize';
import type { GazetteerIndex } from './types';

export interface Entry {
  name: string;
  lat: number;
  lng: number;
  country: string;
  /** First-level region code within the country ("08" is Ontario, "SCT" Scotland). */
  region: string;
  population: number;
  /** True for a county, parish, island or the like rather than a populated place. */
  area: boolean;
}

export interface Region {
  country: string;
  code: string;
  name: string;
  lat: number;
  lng: number;
}

export interface Country {
  code: string;
  name: string;
  lat: number;
  lng: number;
}

/** Names people write for a country that GeoNames does not use. */
const COUNTRY_ALIASES: Record<string, string> = {
  usa: 'US',
  us: 'US',
  'u s a': 'US',
  'u s': 'US',
  'united states of america': 'US',
  america: 'US',
  uk: 'GB',
  'u k': 'GB',
  'great britain': 'GB',
  britain: 'GB',
  eire: 'IE',
  'republic of ireland': 'IE',
  'irish free state': 'IE',
  netherlands: 'NL',
  holland: 'NL',
  'czech republic': 'CZ',
  deutschland: 'DE',
};

/** Postal abbreviations of the Canadian provinces, by GeoNames region code. */
const CANADA_ABBREVIATIONS: Record<string, string[]> = {
  '01': ['ab', 'alta'],
  '02': ['bc', 'b c'],
  '03': ['mb', 'man'],
  '04': ['nb', 'n b'],
  '05': ['nl', 'nfld', 'newfoundland'],
  '07': ['ns', 'n s'],
  '08': ['on', 'ont'],
  '09': ['pe', 'pei', 'p e i'],
  '10': ['qc', 'que', 'pq', 'p q'],
  '11': ['sk', 'sask'],
  '12': ['yt'],
  '13': ['nt', 'nwt'],
  '14': ['nu'],
};

const push = <K, V>(map: Map<K, V[]>, key: K, value: V) => {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
};

/**
 * The bundled place data, held in memory: the countries and regions from `index.json`,
 * and whichever country shards have been added. Lookups are by normalized name.
 */
export class Gazetteer {
  readonly countries = new Map<string, Country>();
  private readonly countryNames = new Map<string, string>();
  private readonly regions = new Map<string, Region>();
  private readonly regionNames = new Map<string, Region[]>();
  private readonly shards = new Map<string, NameIndex>();
  private world: NameIndex | null = null;

  constructor(readonly index: GazetteerIndex) {
    for (const country of index.countries) {
      this.countries.set(country.code, country);
      this.countryNames.set(normalizeName(country.name), country.code);
    }
    for (const [alias, code] of Object.entries(COUNTRY_ALIASES)) this.countryNames.set(alias, code);
    for (const region of index.regions) {
      this.regions.set(`${region.country}.${region.code}`, region);
      push(this.regionNames, normalizeName(region.name), region);
      if (region.country === 'US') push(this.regionNames, region.code.toLowerCase(), region);
      if (region.country === 'CA') {
        for (const short of CANADA_ABBREVIATIONS[region.code] ?? []) {
          push(this.regionNames, short, region);
        }
      }
    }
  }

  /** The country a normalized name or alias means, if any. */
  countryNamed(name: string): string | undefined {
    return this.countryNames.get(name);
  }

  /** Every first-level region with this normalized name or abbreviation, in any country. */
  regionsNamed(name: string): Region[] {
    return this.regionNames.get(name) ?? [];
  }

  region(country: string, code: string): Region | undefined {
    return this.regions.get(`${country}.${code}`);
  }

  hasShardFor(country: string): boolean {
    return country in this.index.shards;
  }

  hasShard(country: string): boolean {
    return this.shards.has(country);
  }

  hasWorld(): boolean {
    return this.world !== null;
  }

  /** Adds one country's `<code>.txt`. */
  addShard(country: string, text: string): void {
    this.shards.set(country, indexLines(text, country));
  }

  /** Adds `world.txt`: the large towns of every country, for places that name no country. */
  addWorld(text: string): void {
    this.world = indexLines(text, null);
  }

  /**
   * Entries with this normalized name. With a country, only that country's shard is searched
   * (and only that region, when one is given). Without, the loaded shards are searched first,
   * since those are the countries the tree is about, and the world list only if they have none.
   */
  lookup(name: string, country?: string, region?: string): Entry[] {
    if (country !== undefined) {
      const shard = this.shards.get(country);
      if (region === undefined) return shard?.get(name) ?? [];
      // Region first, then name: an exact name elsewhere must not hide a loose one here.
      const exact = shard?.exact.get(name)?.filter((e) => e.region === region) ?? [];
      if (exact.length > 0) return exact;
      return shard?.loose.get(name)?.filter((e) => e.region === region) ?? [];
    }
    const found: Entry[] = [];
    for (const shard of this.shards.values()) found.push(...(shard.get(name) ?? []));
    return found.length > 0 ? found : (this.world?.get(name) ?? []);
  }
}

/**
 * Entries by normalized name. `exact` holds each entry under its own name; `loose` under the
 * name without words like "County" or "Isle of", used only when nothing has the name exactly.
 */
class NameIndex {
  readonly exact = new Map<string, Entry[]>();
  readonly loose = new Map<string, Entry[]>();

  get(name: string): Entry[] | undefined {
    return this.exact.get(name) ?? this.loose.get(name);
  }
}

function indexLines(text: string, country: string | null): NameIndex {
  const index = new NameIndex();
  for (const line of text.split('\n')) {
    if (line === '') continue;
    const [name = '', lat, lng, region = '', population, kind, lineCountry] = line.split('\t');
    const entry: Entry = {
      name,
      lat: Number(lat),
      lng: Number(lng),
      country: country ?? lineCountry ?? '',
      region,
      population: Number(population ?? 0),
      area: kind === 'a',
    };
    const [exact = '', ...loose] = nameVariants(normalizeName(name));
    push(index.exact, exact, entry);
    for (const variant of loose) push(index.loose, variant, entry);
  }
  return index;
}
