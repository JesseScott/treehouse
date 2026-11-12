// check:perf — bundle-size and Lighthouse budgets for the built app.
//
// Budgets live in harness/budgets.json. Writes reports/perf.json and
// reports/lighthouse.html, and exits non-zero when a budget is exceeded.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { gzipSync } from 'node:zlib';
import { chromium } from '@playwright/test';
import lighthouse from 'lighthouse';
import { WEBGL_ARGS } from './lib/browser.mjs';
import { startPreview } from './lib/preview.mjs';

const budgets = JSON.parse(readFileSync(new URL('./budgets.json', import.meta.url), 'utf8'));
const dist = new URL('../dist/', import.meta.url);
const reports = new URL('../reports/', import.meta.url);

const results = [];
/** Records one metric against its budget. `atLeast` budgets are floors; the rest are ceilings. */
function measure(name, value, budget, unit, { atLeast = false } = {}) {
  const ok = atLeast ? value >= budget : value <= budget;
  results.push({ name, value, budget, unit, direction: atLeast ? 'min' : 'max', ok });
}

// ---- bundle size -----------------------------------------------------------
function bundleSizes() {
  const sizes = { js: 0, css: 0, other: 0 };
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
      if (entry.isDirectory()) walk(url);
      else if (!entry.name.endsWith('.map')) {
        const gz = gzipSync(readFileSync(url)).length;
        if (/\.m?js$/.test(entry.name)) sizes.js += gz;
        else if (entry.name.endsWith('.css')) sizes.css += gz;
        else sizes.other += gz;
      }
    }
  };
  walk(dist);
  return sizes;
}

const kb = (bytes) => Math.round((bytes / 1024) * 10) / 10;
const sizes = bundleSizes();
measure('bundle: JS (gzip)', kb(sizes.js), budgets.bundle.jsGzipKb, 'kB');
measure('bundle: CSS (gzip)', kb(sizes.css), budgets.bundle.cssGzipKb, 'kB');
measure(
  'bundle: total (gzip)',
  kb(sizes.js + sizes.css + sizes.other),
  budgets.bundle.totalGzipKb,
  'kB',
);

// ---- Lighthouse ------------------------------------------------------------
const server = await startPreview();
// Lighthouse drives a Chromium that Playwright launches, over its debugging port.
const freePort = () =>
  new Promise((resolve) => {
    const probe = createServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
const debugPort = await freePort();
let chrome;
try {
  chrome = await chromium.launch({
    args: [`--remote-debugging-port=${debugPort}`, ...WEBGL_ARGS],
  });
  const run = await lighthouse(
    server.url,
    { port: debugPort, output: 'html', logLevel: 'error' },
    {
      extends: 'lighthouse:default',
      settings: { onlyCategories: ['performance', 'accessibility', 'best-practices'] },
    },
  );
  mkdirSync(reports, { recursive: true });
  writeFileSync(new URL('lighthouse.html', reports), run.report);

  const { categories, audits, runtimeError } = run.lhr;
  if (runtimeError) throw new Error(`Lighthouse: ${runtimeError.message}`);
  const lh = budgets.lighthouse;
  const score = (id) => Math.round(categories[id].score * 100) / 100;
  measure('lighthouse: performance', score('performance'), lh.performanceScore, 'score', {
    atLeast: true,
  });
  measure('lighthouse: accessibility', score('accessibility'), lh.accessibilityScore, 'score', {
    atLeast: true,
  });
  measure('lighthouse: best practices', score('best-practices'), lh.bestPracticesScore, 'score', {
    atLeast: true,
  });
  measure(
    'lighthouse: largest contentful paint',
    Math.round(audits['largest-contentful-paint'].numericValue),
    lh.largestContentfulPaintMs,
    'ms',
  );
  measure(
    'lighthouse: total blocking time',
    Math.round(audits['total-blocking-time'].numericValue),
    lh.totalBlockingTimeMs,
    'ms',
  );
  measure(
    'lighthouse: cumulative layout shift',
    Math.round(audits['cumulative-layout-shift'].numericValue * 1000) / 1000,
    lh.cumulativeLayoutShift,
    '',
  );
} finally {
  await chrome?.close();
  await server.close();
}

const ok = results.every((r) => r.ok);
mkdirSync(reports, { recursive: true });
writeFileSync(
  new URL('perf.json', reports),
  JSON.stringify({ ok, measuredAt: new Date().toISOString(), metrics: results }, null, 2) + '\n',
);

for (const r of results) {
  const sign = r.direction === 'min' ? '>=' : '<=';
  console.log(
    `${r.ok ? 'PASS' : 'FAIL'}  ${r.name}: ${r.value}${r.unit && ' ' + r.unit} (budget ${sign} ${r.budget})`,
  );
}
console.log(ok ? 'Performance budgets met.' : 'Performance budgets EXCEEDED.');
process.exit(ok ? 0 : 1);
