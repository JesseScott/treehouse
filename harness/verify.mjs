// npm run verify — runs the whole check ladder and writes one report.
//
//   reports/verify.json   machine-readable: every step, its duration, and the metrics
//   reports/verify.md     the same as a short Markdown summary
//
// Every step runs even if an earlier one fails (except those that need a build),
// so one run shows everything that is wrong. Exits non-zero if any step failed.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

const root = new URL('../', import.meta.url);
const reports = new URL('reports/', root);
rmSync(reports, { recursive: true, force: true });
mkdirSync(new URL('logs/', reports), { recursive: true });

const STEPS = [
  { id: 'privacy', rung: 'fast', name: 'Privacy guard', cmd: 'npm run check:privacy' },
  { id: 'typecheck', rung: 'fast', name: 'Typecheck', cmd: 'npm run typecheck' },
  { id: 'lint', rung: 'fast', name: 'Lint', cmd: 'npm run lint' },
  { id: 'format', rung: 'fast', name: 'Format check', cmd: 'npm run format:check' },
  {
    id: 'unit',
    rung: 'fast',
    name: 'Unit tests',
    cmd: 'npx vitest run --reporter=default --reporter=json --outputFile.json=reports/unit.json',
  },
  { id: 'build', rung: 'build', name: 'Production build', cmd: 'npm run build' },
  { id: 'e2e', rung: 'e2e', name: 'End-to-end tests', cmd: 'npm run e2e', needsBuild: true },
  { id: 'smoke', rung: 'e2e', name: 'Smoke test (local)', cmd: 'npm run smoke', needsBuild: true },
  {
    id: 'perf',
    rung: 'perf',
    name: 'Performance budgets',
    cmd: 'node harness/perf.mjs',
    needsBuild: true,
  },
];

const readJson = (path) => {
  const url = new URL(path, root);
  return existsSync(url) ? JSON.parse(readFileSync(url, 'utf8')) : null;
};
const git = (...args) => {
  const out = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  return out.status === 0 ? out.stdout.trim() : null;
};

const started = performance.now();
const steps = [];
let buildOk = false;
for (const step of STEPS) {
  if (step.needsBuild && !buildOk) {
    steps.push({ id: step.id, rung: step.rung, name: step.name, status: 'skipped', seconds: 0 });
    console.log(`SKIP  ${step.name} (the build failed)`);
    continue;
  }
  process.stdout.write(`...   ${step.name}\r`);
  const t0 = performance.now();
  const run = spawnSync(step.cmd, { cwd: root, shell: true, encoding: 'utf8', env: process.env });
  const seconds = Math.round((performance.now() - t0) / 100) / 10;
  const log = `logs/${step.id}.log`;
  writeFileSync(new URL(log, reports), `$ ${step.cmd}\n\n${run.stdout ?? ''}\n${run.stderr ?? ''}`);
  const status = run.status === 0 ? 'passed' : 'failed';
  if (step.id === 'build') buildOk = status === 'passed';
  steps.push({
    id: step.id,
    rung: step.rung,
    name: step.name,
    status,
    seconds,
    log: `reports/${log}`,
  });
  console.log(`${status === 'passed' ? 'PASS' : 'FAIL'}  ${step.name} (${seconds}s)`);
  if (status === 'failed') {
    const tail = `${run.stdout ?? ''}\n${run.stderr ?? ''}`
      .trim()
      .split('\n')
      .slice(-25)
      .join('\n');
    console.log(tail.replace(/^/gm, '      '));
  }
}

// ---- gather the numbers ----------------------------------------------------
const unit = readJson('reports/unit.json');
const e2e = readJson('reports/e2e/results.json');
const perf = readJson('reports/perf.json');
const smoke = readJson('reports/smoke.json');

const ok = steps.every((s) => s.status === 'passed');
const report = {
  ok,
  commit: git('rev-parse', 'HEAD'),
  branch: git('rev-parse', '--abbrev-ref', 'HEAD'),
  dirty: (git('status', '--porcelain') ?? '') !== '',
  startedAt: new Date(Date.now() - (performance.now() - started)).toISOString(),
  seconds: Math.round((performance.now() - started) / 100) / 10,
  node: process.version,
  steps,
  tests: {
    unit: unit && {
      total: unit.numTotalTests,
      passed: unit.numPassedTests,
      failed: unit.numFailedTests,
    },
    e2e: e2e && {
      total: e2e.stats.expected + e2e.stats.unexpected + e2e.stats.flaky + e2e.stats.skipped,
      passed: e2e.stats.expected,
      failed: e2e.stats.unexpected,
      flaky: e2e.stats.flaky,
      skipped: e2e.stats.skipped,
    },
    smoke: smoke && {
      total: smoke.checks.length,
      passed: smoke.checks.filter((c) => c.ok).length,
      failed: smoke.checks.filter((c) => !c.ok).length,
    },
  },
  metrics: perf?.metrics ?? [],
  artifacts: {
    e2eScreenshots: 'reports/e2e/screenshots/',
    e2eTraces: 'reports/e2e/artifacts/',
    e2eHtmlReport: 'reports/e2e/html/index.html',
    lighthouse: 'reports/lighthouse.html',
    logs: 'reports/logs/',
  },
};
writeFileSync(new URL('verify.json', reports), JSON.stringify(report, null, 2) + '\n');

// ---- Markdown summary ------------------------------------------------------
const icon = (status) => ({ passed: 'pass', failed: '**FAIL**', skipped: 'skipped' })[status];
const count = (t) => (t ? `${t.passed}/${t.total} passed` : 'no result');
const md = [
  `# treehouse verify: ${ok ? 'PASSED' : 'FAILED'}`,
  '',
  `Commit \`${report.commit?.slice(0, 7) ?? 'unknown'}\` on \`${report.branch}\`${report.dirty ? ' (with uncommitted changes)' : ''}, ` +
    `${report.seconds}s, Node ${report.node}.`,
  '',
  '| Step | Rung | Result | Time |',
  '| --- | --- | --- | --- |',
  ...steps.map((s) => `| ${s.name} | ${s.rung} | ${icon(s.status)} | ${s.seconds}s |`),
  '',
  `Tests: unit ${count(report.tests.unit)}; end-to-end ${count(report.tests.e2e)}; smoke ${count(report.tests.smoke)}.`,
  '',
  '| Metric | Value | Budget | Result |',
  '| --- | --- | --- | --- |',
  ...report.metrics.map(
    (m) =>
      `| ${m.name} | ${m.value}${m.unit === 'score' || !m.unit ? '' : ' ' + m.unit} | ${m.direction === 'min' ? '≥' : '≤'} ${m.budget} | ${m.ok ? 'pass' : '**FAIL**'} |`,
  ),
  '',
  'Screenshots: `reports/e2e/screenshots/`. Traces: `reports/e2e/artifacts/`. ' +
    'Lighthouse: `reports/lighthouse.html`. Step logs: `reports/logs/`.',
  '',
].join('\n');
writeFileSync(new URL('verify.md', reports), md);

console.log(
  `\n${ok ? 'VERIFY PASSED' : 'VERIFY FAILED'} in ${report.seconds}s. See reports/verify.md`,
);
process.exit(ok ? 0 : 1);
