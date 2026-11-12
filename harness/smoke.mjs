// Smoke test of a running treehouse: is it up, is it the build we expect, does the map work?
//
//   npm run smoke                                   # serves dist/ locally and tests that
//   npm run smoke -- --url https://example.org/app/ # tests a deployed site
//   npm run smoke -- --url <url> --expect-commit <sha>
//
// Used by deploy.yml (after a deploy) and monitor.yml (daily). Writes
// reports/smoke.json and exits non-zero on failure.
import { mkdirSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';
import { WEBGL_ARGS, distanceKm } from './lib/browser.mjs';
import { startPreview } from './lib/preview.mjs';

const { values: args } = parseArgs({
  options: {
    url: { type: 'string' },
    'expect-commit': { type: 'string' },
    retries: { type: 'string', default: '1' },
    'retry-delay': { type: 'string', default: '15' },
    out: { type: 'string', default: 'reports/smoke.json' },
  },
});

const VANCOUVER = { lng: -123.1207, lat: 49.2827 };

async function attempt(baseUrl) {
  const checks = [];
  const check = (name, ok, detail) => {
    checks.push({ name, ok, detail });
    return ok;
  };

  // 1. version.json: reachable, and the commit we expect. Cache-busted, since Pages caches.
  let version = null;
  try {
    const response = await fetch(new URL(`version.json?t=${Date.now()}`, baseUrl), {
      cache: 'no-store',
    });
    version = response.ok ? await response.json() : null;
    check('version.json is served', response.ok, `HTTP ${response.status}`);
  } catch (error) {
    check('version.json is served', false, String(error));
  }
  if (args['expect-commit']) {
    check(
      'deployed commit matches',
      version?.commit === args['expect-commit'],
      `expected ${args['expect-commit']}, found ${version?.commit ?? 'nothing'}`,
    );
  }

  // 2. The app boots, the map loads, and the camera goes where it is told.
  const browser = await chromium.launch({ args: WEBGL_ARGS });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });

    const target = new URL(baseUrl);
    target.searchParams.set('harness', '1');
    target.searchParams.set('motion', 'off');
    const response = await page.goto(target.href, { waitUntil: 'load', timeout: 30_000 });
    check('page loads', response?.ok() ?? false, `HTTP ${response?.status() ?? 'none'}`);

    await page.waitForFunction(() => window.__treehouse !== undefined, null, { timeout: 15_000 });
    const state = await page.evaluate(async () => {
      await window.__treehouse.whenIdle();
      await window.__treehouse.flyTo({ lng: -123.1207, lat: 49.2827, zoom: 5 });
      return window.__treehouse.state();
    });
    check('map loaded', state.map.loaded === true, `loaded=${state.map.loaded}`);
    const off = distanceKm(state.map.center, VANCOUVER);
    check('camera reaches Vancouver', off < 5, `${off.toFixed(1)} km away`);
    check(
      'page and version.json agree',
      !version || state.app.commit === version.commit,
      `page ${state.app.commit}, version.json ${version?.commit}`,
    );
    check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | ') || 'none');
  } catch (error) {
    check('app boots with the debug API', false, String(error));
  } finally {
    await browser.close();
  }

  return { ok: checks.every((c) => c.ok), version, checks };
}

const local = args.url ? null : await startPreview();
const baseUrl = args.url ?? local.url;
const retries = Number(args.retries);
let result;
try {
  for (let i = 1; i <= retries; i++) {
    result = await attempt(baseUrl);
    if (result.ok || i === retries) break;
    console.log(`Attempt ${i} of ${retries} failed; retrying in ${args['retry-delay']}s.`);
    await new Promise((resolve) => setTimeout(resolve, Number(args['retry-delay']) * 1000));
  }
} finally {
  await local?.close();
}

const report = { url: baseUrl, checkedAt: new Date().toISOString(), ...result };
mkdirSync(new URL('.', new URL(args.out, `file://${process.cwd().replaceAll('\\', '/')}/`)), {
  recursive: true,
});
writeFileSync(args.out, JSON.stringify(report, null, 2) + '\n');

for (const c of result.checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name} (${c.detail})`);
console.log(result.ok ? `Smoke test passed: ${baseUrl}` : `Smoke test FAILED: ${baseUrl}`);
process.exit(result.ok ? 0 : 1);
