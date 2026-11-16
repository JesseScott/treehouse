/// <reference lib="webworker" />
import { Geocoder } from './geocoder';
import type { PlaceResult } from './types';

export interface GeocodeRequest {
  id: number;
  /** Absolute URL of the `gazetteer/` folder: a worker cannot resolve a relative one. */
  baseUrl: string;
  texts: string[];
}

export type GeocodeResponse =
  { id: number; ok: true; results: PlaceResult[] } | { id: number; ok: false };

let geocoder: Geocoder | undefined;

// The gazetteer is a few megabytes of text to parse and index, so it lives here, off the
// main thread, and stays loaded between requests.
addEventListener('message', (event: MessageEvent<GeocodeRequest>) => {
  const { id, baseUrl, texts } = event.data;
  geocoder ??= new Geocoder(async (name) => {
    const response = await fetch(new URL(name, baseUrl));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
  });
  geocoder.match(texts).then(
    (results) => {
      const response: GeocodeResponse = { id, ok: true, results };
      postMessage(response);
    },
    () => {
      // Start again next time rather than remembering a failed download.
      geocoder = undefined;
      const response: GeocodeResponse = { id, ok: false };
      postMessage(response);
    },
  );
});
