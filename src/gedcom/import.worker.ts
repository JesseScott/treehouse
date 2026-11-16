/// <reference lib="webworker" />
import { ImportError, readGedcom, type ImportErrorCode, type ReadResult } from './readGedcom';

export interface ImportRequest {
  bytes: ArrayBuffer;
  fileName: string;
}

export type ImportResponse =
  ({ ok: true; milliseconds: number } & ReadResult) | { ok: false; code: ImportErrorCode };

// Parsing a large export takes a while, so it happens here, off the main thread.
addEventListener('message', (event: MessageEvent<ImportRequest>) => {
  const started = performance.now();
  readGedcom(new Uint8Array(event.data.bytes), event.data.fileName).then(
    (result) => {
      const response: ImportResponse = {
        ok: true,
        milliseconds: Math.round(performance.now() - started),
        ...result,
      };
      postMessage(response);
    },
    (error: unknown) => {
      const response: ImportResponse = {
        ok: false,
        code: error instanceof ImportError ? error.code : 'unknown',
      };
      postMessage(response);
    },
  );
});
