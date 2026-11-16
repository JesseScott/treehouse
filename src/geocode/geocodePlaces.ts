import type { GeocodeRequest, GeocodeResponse } from './geocode.worker';
import type { PlaceResult } from './types';

let worker: Worker | undefined;
let nextId = 1;
const waiting = new Map<number, (response: GeocodeResponse) => void>();

function start(): Worker {
  const created = new Worker(new URL('./geocode.worker.ts', import.meta.url), { type: 'module' });
  created.addEventListener('message', (event: MessageEvent<GeocodeResponse>) => {
    waiting.get(event.data.id)?.(event.data);
    waiting.delete(event.data.id);
  });
  created.addEventListener('error', () => {
    for (const [id, resolve] of waiting) resolve({ id, ok: false });
    waiting.clear();
    created.terminate();
    worker = undefined;
  });
  return created;
}

/**
 * Places each string on the map from the gazetteer bundled with the app, in a worker.
 * Returns one result per string, or null when the gazetteer could not be loaded.
 */
export async function geocodePlaces(texts: string[]): Promise<PlaceResult[] | null> {
  if (texts.length === 0) return [];
  worker ??= start();
  const id = nextId++;
  const request: GeocodeRequest = {
    id,
    baseUrl: new URL('gazetteer/', document.baseURI).href,
    texts,
  };
  const response = await new Promise<GeocodeResponse>((resolve) => {
    waiting.set(id, resolve);
    worker?.postMessage(request);
  });
  return response.ok ? response.results : null;
}
