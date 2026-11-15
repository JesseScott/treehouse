// npm on Windows can silently drop lockfile entries that only Linux installs need
// (`@emnapi/core`, `@emnapi/runtime`); `npm ci` then fails on the CI runners.
//
//   npm run lockfile:check   fails if a package requires something the lockfile has no entry for
//   npm run lockfile:fix     copies the missing entries back from the lockfile on origin/main
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const LOCK = new URL('../../package-lock.json', import.meta.url);

/**
 * Lists `name@range` requirements of locked packages that resolve to no lockfile entry.
 * Optional and peer requirements count: npm records them for every platform.
 */
export function missingEntries(lock) {
  const packages = lock.packages ?? {};
  const missing = new Set();
  for (const [path, entry] of Object.entries(packages)) {
    const wanted = {
      ...entry.dependencies,
      ...entry.optionalDependencies,
      ...(path === '' ? entry.devDependencies : {}),
    };
    for (const name of Object.keys(wanted)) {
      // Node resolution: look in this package's node_modules, then each parent's.
      let base = path;
      let found = false;
      for (;;) {
        if (packages[`${base ? base + '/' : ''}node_modules/${name}`]) {
          found = true;
          break;
        }
        const cut = base.lastIndexOf('node_modules/');
        if (cut < 0) break;
        base = base.slice(0, cut).replace(/\/$/, '');
      }
      if (!found) missing.add(name);
    }
  }
  return [...missing].sort();
}

/** Copies entries for `names` from `source` into `lock`, keeping npm's key order. */
export function restoreEntries(lock, source, names) {
  const restored = [];
  for (const name of names) {
    const key = `node_modules/${name}`;
    if (source.packages?.[key]) {
      lock.packages[key] = source.packages[key];
      restored.push(name);
    }
  }
  const [rootKey, ...rest] = Object.keys(lock.packages);
  const ordered = { [rootKey]: lock.packages[rootKey] };
  for (const key of rest.sort((a, b) => a.localeCompare(b, 'en')))
    ordered[key] = lock.packages[key];
  lock.packages = ordered;
  return restored;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const lock = JSON.parse(readFileSync(LOCK, 'utf8'));
  let missing = missingEntries(lock);
  if (missing.length > 0 && process.argv.includes('--fix')) {
    const source = JSON.parse(
      execFileSync('git', ['show', 'origin/main:package-lock.json'], {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      }),
    );
    const restored = restoreEntries(lock, source, missing);
    writeFileSync(LOCK, JSON.stringify(lock, null, 2) + '\n');
    console.log(`Restored from origin/main: ${restored.join(', ') || 'nothing'}`);
    missing = missingEntries(lock);
  }
  if (missing.length > 0) {
    console.error(`package-lock.json has no entry for: ${missing.join(', ')}`);
    console.error('npm ci would fail on Linux. Run `npm run lockfile:fix`, or see AGENTS.md.');
    process.exit(1);
  }
  console.log('package-lock.json is complete.');
}
