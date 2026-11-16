import { readFile } from 'node:fs/promises';
import { Geocoder } from '../src/geocode/geocoder';

const dir = new URL('../public/gazetteer/', import.meta.url);

/** A geocoder that reads the bundled gazetteer from disk, as the app's worker does by fetch. */
export const diskGeocoder = () => new Geocoder((name) => readFile(new URL(name, dir), 'utf8'));
