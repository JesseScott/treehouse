import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

function currentCommit(): string {
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

const commit = currentCommit();

/** Emits /version.json so a deploy can be matched to the commit it was built from. */
function versionJson(): Plugin {
  return {
    name: 'treehouse-version-json',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source:
          JSON.stringify(
            { name: 'treehouse', version: pkg.version, commit, builtAt: new Date().toISOString() },
            null,
            2,
          ) + '\n',
      });
    },
  };
}

export default defineConfig({
  // Relative base: the same build works at / (preview) and at /treehouse/ (GitHub Pages).
  base: './',
  plugins: [react(), versionJson()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(commit),
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  // MapLibre is one large chunk; harness/budgets.json is what guards bundle size.
  build: { sourcemap: true, chunkSizeWarningLimit: 1500 },
  test: {
    include: ['src/**/*.test.ts', 'harness/**/*.test.mjs', 'tools/**/*.test.mjs'],
    environment: 'node',
  },
});
