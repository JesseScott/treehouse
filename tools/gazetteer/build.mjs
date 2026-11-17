// Builds the bundled offline gazetteer in public/gazetteer/ from GeoNames
// (https://www.geonames.org, CC BY 4.0). The output is committed, so this only
// needs to be re-run to refresh the data or change the detail countries:
//
//   npm run gazetteer
//
// Downloads are kept in git-ignored tools/gazetteer/.cache/ and reused.
//
// Output:
//   index.json   countries and first-level regions with a centre point, and the list of shards
//   world.txt    every place of 15,000 people or more, for place strings that name no country
//   <CC>.txt     one shard per country, fetched only when a tree has places there
//
// A shard has every populated place of 500 people or more. The DETAIL countries also get
// every populated place GeoNames knows (villages, hamlets, crofting townships) and their
// areas (counties, parishes, islands), which is what old records tend to name.
//
// Shard line:  name <tab> lat <tab> lng <tab> region code <tab> population <tab> kind
// kind is empty for a populated place and "a" for an area. world.txt adds a country column.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { unzipSync } from 'fflate';

/** Countries that get village-level detail. Each one adds a few hundred kB to the repo. */
export const DETAIL = ['CA', 'GB', 'IE'];
const WORLD_MIN_POPULATION = 15000;
const AREA_CODES = new Set([
  'ADM2',
  'ADM2H',
  'ADM3',
  'ADM3H',
  'ADM4',
  'ADM4H',
  'ADMD',
  'ADMDH',
  'PRSH',
  'ISL',
  'ISLS',
  'PEN',
  'RGN',
  'RGNH',
]);

const SOURCE = 'https://download.geonames.org/export/dump/';
const cache = new URL('./.cache/', import.meta.url);
const out = new URL('../../public/gazetteer/', import.meta.url);

async function download(name) {
  const file = new URL(name, cache);
  if (!existsSync(file)) {
    console.log(`downloading ${name}`);
    const response = await fetch(SOURCE + name);
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
    writeFileSync(file, new Uint8Array(await response.arrayBuffer()));
  }
  return readFileSync(file);
}

/** The rows of a GeoNames dump, read from its zip. */
async function dump(name) {
  const files = unzipSync(new Uint8Array(await download(`${name}.zip`)));
  const text = new TextDecoder().decode(files[`${name}.txt`]);
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const c = line.split('\t');
      return {
        name: c[1],
        lat: Number(c[4]),
        lng: Number(c[5]),
        featureClass: c[6],
        featureCode: c[7],
        country: c[8],
        admin1: c[10],
        population: Number(c[14]),
      };
    });
}

/** Mean position on the sphere, weighted, so a country that spans the antimeridian works. */
function centre(points) {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const p of points) {
    const w = Math.max(p.population, 500);
    const lat = (p.lat * Math.PI) / 180;
    const lng = (p.lng * Math.PI) / 180;
    x += w * Math.cos(lat) * Math.cos(lng);
    y += w * Math.cos(lat) * Math.sin(lng);
    z += w * Math.sin(lat);
  }
  const round = (n) => Math.round(n * 100) / 100;
  return {
    lat: round((Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI),
    lng: round((Math.atan2(y, x) * 180) / Math.PI),
  };
}

const coordinate = (n) => String(Math.round(n * 1000) / 1000);

/** Sorted, de-duplicated shard lines. */
function shardLines(rows, withCountry) {
  const best = new Map();
  for (const row of rows) {
    const area = row.featureClass !== 'P';
    // The same name twice within about ten kilometres is one place for our purposes.
    const key = [
      row.name.toLowerCase(),
      row.country,
      row.admin1,
      Math.round(row.lat * 10),
      Math.round(row.lng * 10),
    ].join('|');
    const current = best.get(key);
    const better =
      !current ||
      (current.area && !area) ||
      (current.area === area && row.population > current.population);
    if (better) best.set(key, { ...row, area });
  }
  return [...best.values()]
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : b.population - a.population))
    .map((row) =>
      [
        row.name,
        coordinate(row.lat),
        coordinate(row.lng),
        row.admin1,
        row.population > 0 ? row.population : '',
        row.area ? 'a' : '',
        ...(withCountry ? [row.country] : []),
      ]
        .join('\t')
        .replace(/\t+$/, ''),
    );
}

mkdirSync(cache, { recursive: true });
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const cities = await dump('cities500');
const byCountry = Map.groupBy(cities, (row) => row.country);

// Countries: ISO code and name from countryInfo.txt, centred on their towns.
const countryInfo = new TextDecoder()
  .decode(await download('countryInfo.txt'))
  .split('\n')
  .filter((line) => line && !line.startsWith('#'))
  .map((line) => line.split('\t'));
const countries = countryInfo
  .filter((c) => byCountry.has(c[0]))
  .map((c) => ({ code: c[0], name: c[4], ...centre(byCountry.get(c[0])) }))
  .sort((a, b) => a.code.localeCompare(b.code));

// First-level regions (provinces, states, the nations of the UK), centred the same way.
const regionRows = Map.groupBy(cities, (row) => `${row.country}.${row.admin1}`);
const regions = new TextDecoder()
  .decode(await download('admin1CodesASCII.txt'))
  .split('\n')
  .filter(Boolean)
  .map((line) => line.split('\t'))
  .filter((c) => regionRows.has(c[0]))
  .map((c) => {
    const [country, code] = c[0].split('.');
    return { country, code, name: c[1], ...centre(regionRows.get(c[0])) };
  })
  .sort((a, b) => (a.country + a.code).localeCompare(b.country + b.code));

const shards = {};
for (const [country, rows] of byCountry) {
  let all = rows;
  if (DETAIL.includes(country)) {
    const detail = (await dump(country)).filter(
      (row) => row.featureClass === 'P' || AREA_CODES.has(row.featureCode),
    );
    all = [...rows, ...detail];
  }
  const lines = shardLines(all, false);
  writeFileSync(new URL(`${country}.txt`, out), lines.join('\n') + '\n');
  shards[country] = lines.length;
}

const world = shardLines(
  cities.filter((row) => row.population >= WORLD_MIN_POPULATION),
  true,
);
writeFileSync(new URL('world.txt', out), world.join('\n') + '\n');

writeFileSync(
  new URL('index.json', out),
  JSON.stringify({
    source: 'GeoNames (https://www.geonames.org), CC BY 4.0',
    built: new Date().toISOString().slice(0, 10),
    detail: DETAIL,
    countries,
    regions,
    shards,
  }) + '\n',
);

const total = Object.values(shards).reduce((sum, n) => sum + n, 0);
console.log(
  `wrote ${Object.keys(shards).length} shards (${total} entries), world.txt (${world.length}), ` +
    `${countries.length} countries, ${regions.length} regions`,
);
