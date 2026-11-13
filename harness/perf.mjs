// check:perf — bundle-size and Lighthouse budgets for the built app.
// Lighthouse runs three times (LIGHTHOUSE_RUNS) and each metric is judged by its median.
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
import { median } from './lib/stats.mjs';

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
// One Lighthouse run is noisy, above all on a CI runner drawing the globe in software: the same
// build has measured 280 ms and 1,474 ms of blocking time back to back. So run it several times
// and judge each metric by its median. Each run gets a fresh browser, so a warm one cannot
// flatter the later runs.
const RUNS = Number(process.env.LIGHTHOUSE_RUNS ?? 3);
const lighthouseConfig = {
  extends: 'lighthouse:default',
  settings: { onlyCategories: ['performance', 'accessibility', 'best-practices'] },
};
try {
  const samples = [];
  for (let i = 0; i < RUNS; i++) {
    const debugPort = await freePort();
    const chrome = await chromium.launch({
      args: [`--remote-debugging-port=${debugPort}`, ...WEBGL_ARGS],
    });
    let run;
    try {
      run = await lighthouse(
        server.url,
        { port: debugPort, output: 'html', logLevel: 'error' },
        lighthouseConfig,
      );
    } finally {
      await chrome.close();
    }
    const { categories, audits, runtimeError } = run.lhr;
    if (runtimeError) throw new Error(`Lighthouse: ${runtimeError.message}`);
    samples.push({
      report: run.report,
      performance: categories.performance.score,
      accessibility: categories.accessibility.score,
      bestPractices: categories['best-practices'].score,
      lcp: audits['largest-contentful-paint'].numericValue,
      tbt: audits['total-blocking-time'].numericValue,
      cls: audits['cumulative-layout-shift'].numericValue,
    });
  }

  // Keep the full report of the run whose performance score is the median one.
  const byScore = [...samples].sort((a, b) => a.performance - b.performance);
  mkdirSync(reports, { recursive: true });
  writeFileSync(new URL('lighthouse.html', reports), byScore[byScore.length >> 1].report);

  const lh = budgets.lighthouse;
  const round = (value, places) => Math.round(value * 10 ** places) / 10 ** places;
  /** Records the median of one metric across the runs, keeping every run's value beside it. */
  const judge = (name, key, budget, unit, places, options) => {
    const values = samples.map((sample) => round(sample[key], places));
    measure(name, round(median(values), places), budget, unit, options);
    results.at(-1).samples = values;
  };
  const floor = { atLeast: true };
  judge('lighthouse: performance', 'performance', lh.performanceScore, 'score', 2, floor);
  judge('lighthouse: accessibility', 'accessibility', lh.accessibilityScore, 'score', 2, floor);
  judge('lighthouse: best practices', 'bestPractices', lh.bestPracticesScore, 'score', 2, floor);
  judge('lighthouse: largest contentful paint', 'lcp', lh.largestContentfulPaintMs, 'ms', 0);
  judge('lighthouse: total blocking time', 'tbt', lh.totalBlockingTimeMs, 'ms', 0);
  judge('lighthouse: cumulative layout shift', 'cls', lh.cumulativeLayoutShift, '', 3);
} finally {
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
  const runs = r.samples ? `; runs: ${r.samples.join(', ')}` : '';
  console.log(
    `${r.ok ? 'PASS' : 'FAIL'}  ${r.name}: ${r.value}${r.unit && ' ' + r.unit} (budget ${sign} ${r.budget}${runs})`,
  );
}
console.log(ok ? 'Performance budgets met.' : 'Performance budgets EXCEEDED.');
process.exit(ok ? 0 : 1);
