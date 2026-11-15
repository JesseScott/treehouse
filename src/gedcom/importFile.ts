import type { ImportRequest, ImportResponse } from './import.worker';

/** Reads and parses a user's file in a worker. The file never leaves the browser. */
export async function importFile(file: File): Promise<ImportResponse> {
  const bytes = await file.arrayBuffer();
  const worker = new Worker(new URL('./import.worker.ts', import.meta.url), { type: 'module' });
  try {
    return await new Promise<ImportResponse>((resolve) => {
      worker.addEventListener('message', (event: MessageEvent<ImportResponse>) => {
        resolve(event.data);
      });
      worker.addEventListener('error', () => {
        resolve({ ok: false, code: 'unknown' });
      });
      const request: ImportRequest = { bytes, fileName: file.name };
      worker.postMessage(request, [bytes]);
    });
  } finally {
    worker.terminate();
  }
}
