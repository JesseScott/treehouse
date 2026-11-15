// npm run check:data -- <path to a real .ged or .zip on this machine>
//
// Local only: runs the importer over a real export and reports aggregate numbers
// (counts, warnings by code, date and place coverage) to the console and to
// git-ignored reports/data.json. No name, place or date from the file is shown.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const path = process.argv[2];
if (!path || !existsSync(path)) {
  console.error('Usage: npm run check:data -- <path to a .ged or .zip file>');
  console.error(path ? `Not found: ${path}` : 'No path given.');
  process.exit(2);
}

const run = spawnSync('npx vitest run tests/local-data.test.ts --reporter=verbose', {
  shell: true,
  stdio: 'inherit',
  env: { ...process.env, TREEHOUSE_DATA: resolve(path) },
});
process.exit(run.status ?? 1);
