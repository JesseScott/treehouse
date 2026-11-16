import { Gazetteer } from './gazetteer';
import { countriesOf, matchPlace } from './match';
import type { GazetteerIndex, PlaceResult } from './types';

/** Reads one file of the gazetteer by name: `fetch` in the app, the file system in tests. */
export type ReadFile = (name: string) => Promise<string>;

/**
 * Matches place strings against the bundled gazetteer, loading only the country files the
 * strings call for. Nothing leaves the device: the files are part of the app.
 */
export class Geocoder {
  private gazetteer: Promise<Gazetteer> | undefined;
  private readonly loading = new Map<string, Promise<void>>();

  constructor(private readonly readFile: ReadFile) {}

  private load(): Promise<Gazetteer> {
    this.gazetteer ??= this.readFile('index.json').then(
      (text) => new Gazetteer(JSON.parse(text) as GazetteerIndex),
    );
    return this.gazetteer;
  }

  private once(name: string, add: (text: string) => void): Promise<void> {
    let pending = this.loading.get(name);
    if (!pending) {
      pending = this.readFile(name).then(add);
      this.loading.set(name, pending);
    }
    return pending;
  }

  /** One result per string, in order. */
  async match(texts: string[]): Promise<PlaceResult[]> {
    const gazetteer = await this.load();
    const countries = new Set<string>();
    let needsWorld = false;
    for (const text of texts) {
      const named = countriesOf(gazetteer, text);
      if (named.length === 0) needsWorld = true;
      for (const country of named) if (gazetteer.hasShardFor(country)) countries.add(country);
    }
    await Promise.all([
      ...[...countries].map((country) =>
        this.once(`${country}.txt`, (text) => {
          gazetteer.addShard(country, text);
        }),
      ),
      ...(needsWorld
        ? [
            this.once('world.txt', (text) => {
              gazetteer.addWorld(text);
            }),
          ]
        : []),
    ]);
    return texts.map((text) => matchPlace(gazetteer, text));
  }
}
