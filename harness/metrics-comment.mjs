// Turns reports/verify.json into the Markdown comment CI posts on a pull request,
// with each metric compared against the latest run on main when that is available.
//
//   node harness/metrics-comment.mjs reports/verify.json [base/verify.json] > comment.md
import { existsSync, readFileSync } from 'node:fs';

/** The hidden marker CI uses to find and update its one comment. */
export const COMMENT_MARKER = '<!-- treehouse-metrics -->';

export function renderComment(head, base) {
  const baseMetrics = new Map((base?.metrics ?? []).map((m) => [m.name, m]));
  const delta = (m) => {
    const before = baseMetrics.get(m.name);
    if (!before) return 'n/a';
    const diff = Math.round((m.value - before.value) * 1000) / 1000;
    if (diff === 0) return '0';
    return `${diff > 0 ? '+' : ''}${diff}`;
  };
  const unit = (m) => (m.unit && m.unit !== 'score' ? ` ${m.unit}` : '');
  const count = (t) => (t ? `${t.passed}/${t.total}` : 'n/a');
  return [
    COMMENT_MARKER,
    `### treehouse verify: ${head.ok ? 'passed' : 'FAILED'}`,
    '',
    `Commit \`${head.commit?.slice(0, 7)}\`, ${head.seconds}s. ` +
      `Unit ${count(head.tests.unit)}, end-to-end ${count(head.tests.e2e)}, smoke ${count(head.tests.smoke)}.`,
    '',
    ...(head.ok
      ? []
      : [
          'Failed steps: ' +
            head.steps
              .filter((s) => s.status === 'failed')
              .map((s) => s.name)
              .join(', '),
          '',
        ]),
    `| Metric | This change | ${base ? `main (\`${base.commit?.slice(0, 7)}\`)` : 'main'} | Change | Budget | |`,
    '| --- | --- | --- | --- | --- | --- |',
    ...head.metrics.map((m) => {
      const before = baseMetrics.get(m.name);
      return (
        `| ${m.name} | ${m.value}${unit(m)} | ${before ? `${before.value}${unit(before)}` : 'n/a'} | ${delta(m)} ` +
        `| ${m.direction === 'min' ? '≥' : '≤'} ${m.budget} | ${m.ok ? 'pass' : '**FAIL**'} |`
      );
    }),
    '',
    base ? '' : '_No metrics from `main` were available to compare against._',
    'Full reports, screenshots and traces are in the `verify-reports` artifact of this run.',
    '',
  ].join('\n');
}

if (process.argv[1]?.endsWith('metrics-comment.mjs')) {
  const [headPath, basePath] = process.argv.slice(2);
  const read = (path) => (path && existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null);
  const head = read(headPath);
  if (!head) {
    console.error(`No verify report at ${headPath}`);
    process.exit(1);
  }
  process.stdout.write(renderComment(head, read(basePath)));
}
