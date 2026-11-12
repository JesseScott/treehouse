// Serves the built app (dist/) on a free local port for the perf and smoke checks.
import { existsSync } from 'node:fs';
import { preview } from 'vite';

export async function startPreview() {
  if (!existsSync(new URL('../../dist/index.html', import.meta.url))) {
    throw new Error('dist/ is missing. Run `npm run build` first.');
  }
  const server = await preview({
    logLevel: 'silent',
    preview: { port: 0, strictPort: false, host: '127.0.0.1', open: false },
  });
  const address = server.httpServer.address();
  const url = `http://127.0.0.1:${address.port}/`;
  return {
    url,
    close: () => new Promise((resolve) => server.httpServer.close(() => resolve())),
  };
}
