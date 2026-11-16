import { describe, expect, it } from 'vitest';
import { distanceKm } from '../src/geocode/match';
import { nameVariants, normalizeName, placeKey } from '../src/geocode/normalize';
import type { PlaceResult } from '../src/geocode/types';
import { diskGeocoder } from './gazetteer';

const geocoder = diskGeocoder();
const match = async (text: string): Promise<PlaceResult> => {
  const [result] = await geocoder.match([text]);
  if (!result) throw new Error('no result');
  return result;
};
const near = (result: PlaceResult, lat: number, lng: number, km = 15) =>
  result.status !== 'unresolved' && distanceKm(result, { lat, lng }) <= km;

describe('normalizing place names', () => {
  it('ignores case, accents, punctuation and common abbreviations', () => {
    expect(normalizeName('  Montréal ')).toBe('montreal');
    expect(normalizeName("St. John's")).toBe('saint johns');
    expect(normalizeName('Ross & Cromarty')).toBe('ross and cromarty');
    expect(normalizeName('Mt Pleasant')).toBe('mount pleasant');
  });

  it('gives every spelling of a place the same key', () => {
    expect(placeKey('Barvas,Lewis ,  SCOTLAND')).toBe(placeKey('barvas, lewis, scotland'));
    expect(placeKey(' , ')).toBe('');
  });

  it('knows the plain name inside "Bruce County" and "Isle of Lewis"', () => {
    expect(nameVariants('bruce county')).toEqual(['bruce county', 'bruce']);
    expect(nameVariants('isle of lewis')).toEqual(['isle of lewis', 'lewis']);
    expect(nameVariants('stornoway')).toEqual(['stornoway']);
  });
});

describe('matching places against the bundled gazetteer', () => {
  it('finds a town from its region and country', async () => {
    const result = await match('Kincardine, Bruce, Ontario, Canada');
    expect(result).toMatchObject({
      status: 'resolved',
      level: 'place',
      source: 'gazetteer',
      label: 'Kincardine, Ontario, Canada',
    });
    expect(near(result, 44.18, -81.63)).toBe(true);
  });

  it('keeps two towns of the same name apart by their country', async () => {
    expect(near(await match('Stornoway, Lewis, Ross and Cromarty, Scotland'), 58.21, -6.39)).toBe(
      true,
    );
    expect(near(await match('Stornoway, Frontenac, Quebec, Canada'), 45.72, -71.17)).toBe(true);
  });

  it('picks the namesake that sits near the other places in the string', async () => {
    // There are several Uigs in Scotland; only one is on Lewis.
    expect(near(await match('Uig, Lewis, Ross and Cromarty, Scotland'), 58.18, -7.02)).toBe(true);
  });

  it('skips a street address or croft number without losing precision', async () => {
    const result = await match('Croft 14, Barvas, Lewis, Ross and Cromarty, Scotland');
    expect(result.status).toBe('resolved');
    expect(near(result, 58.36, -6.51)).toBe(true);
  });

  it('falls back to a broader part, flagged approximate', async () => {
    const island = await match('Nosuchplace, Lewis, Ross and Cromarty, Scotland');
    expect(island).toMatchObject({
      status: 'approximate',
      label: 'Isle of Lewis, Scotland, United Kingdom',
    });
    expect(near(island, 58.3, -6.6, 40)).toBe(true);

    const region = await match('Nosuchplace, Ontario, Canada');
    expect(region).toMatchObject({
      status: 'approximate',
      level: 'region',
      label: 'Ontario, Canada',
    });

    const country = await match('Nosuchplace, Canada');
    expect(country).toMatchObject({ status: 'approximate', level: 'country', label: 'Canada' });
  });

  it('never leaves the country or region the string names', async () => {
    // There is a Paris in Ontario; a village that is not must not land in France.
    expect(near(await match('Paris, Ontario, Canada'), 43.2, -80.38)).toBe(true);
    expect(await match('Marseille, Ontario, Canada')).toMatchObject({ level: 'region' });
  });

  it('reads abbreviations and other names for countries and regions', async () => {
    expect(near(await match('Vancouver, BC'), 49.28, -123.12)).toBe(true);
    expect(near(await match('Boston, MA, USA'), 42.36, -71.06)).toBe(true);
    expect(near(await match('Glasgow, Scotland, United Kingdom'), 55.86, -4.25)).toBe(true);
    expect(near(await match('Montreal, Quebec'), 45.5, -73.57)).toBe(true);
  });

  it('treats a bare region or country as that, not as a town of the same name', async () => {
    expect(await match('Quebec, Canada')).toMatchObject({ status: 'approximate', level: 'region' });
    expect(await match('Scotland')).toMatchObject({ status: 'approximate', level: 'region' });
    expect(await match('Canada')).toMatchObject({ status: 'approximate', level: 'country' });
  });

  it('places a string with no country among the countries already in use, then the world', async () => {
    // GB is loaded by the tests above, so this is the Scottish Perth, not the Australian one.
    await match('Glasgow, Scotland');
    expect(near(await match('Perth'), 56.4, -3.43)).toBe(true);
    expect(
      near(
        await diskGeocoder()
          .match(['Perth'])
          .then((r) => r[0] ?? { status: 'unresolved' }),
        -31.95,
        115.86,
      ),
    ).toBe(true);
  });

  it('leaves nonsense and empty strings unresolved', async () => {
    expect(await match('Qwertyuiop Zxcvb')).toEqual({ status: 'unresolved' });
    expect(await match('')).toEqual({ status: 'unresolved' });
  });
});
