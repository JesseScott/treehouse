// Privacy guard: real family data must never enter the repository.
//
// Fails if any file git would track (tracked, or untracked and not ignored)
//   1. is a GEDCOM or zip file outside fixtures/synthetic/,
//   2. contains a GEDCOM header line anywhere outside fixtures/synthetic/, or
//   3. sits in fixtures/synthetic/ without the generator's marker.
//
//   npm run check:privacy
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const SYNTHETIC_DIR = 'fixtures/synthetic/';
export const MARKER = 'TREEHOUSE-SYNTHETIC';

const DATA_EXTENSION = /\.(ged|gedcom|zip|gdz)$/i;
// A GEDCOM file starts with a level-0 HEAD record; match that line on its own.
const BOM = String.fromCharCode(0xfeff);
const HEADER_LINE = new RegExp(String.raw`^${BOM}?[ \t]*0[ \t]+HEAD[ \t]*\r?$`, 'm');
const MARKER_LINE = new RegExp(`^1 SOUR ${MARKER}\\r?$`, 'm');

/**
 * @param {string} path repo-relative path with forward slashes
 * @param {string} text the file's content
 * @returns {string | null} why the file is a problem, or null when it is fine
 */
export function inspect(path, text) {
  const synthetic = path.startsWith(SYNTHETIC_DIR);
  const hasHeader = HEADER_LINE.test(text);
  if (synthetic) {
    if (hasHeader && !MARKER_LINE.test(text)) {
      return `GEDCOM without the ${MARKER} marker: only generated fixtures belong here`;
    }
    return null;
  }
  if (DATA_EXTENSION.test(path)) return `family-data file type outside ${SYNTHETIC_DIR}`;
  if (hasHeader) return `contains a GEDCOM header outside ${SYNTHETIC_DIR}`;
  return null;
}

function candidateFiles() {
  const list = (args) =>
    execFileSync('git', ['ls-files', '-z', ...args], { encoding: 'utf8' })
      .split('\0')
      .filter(Boolean);
  return [...new Set([...list([]), ...list(['--others', '--exclude-standard'])])];
}

export function scan() {
  const problems = [];
  const files = candidateFiles();
  for (const path of files) {
    let text;
    try {
      text = readFileSync(path, 'utf8');
    } catch {
      continue; // deleted in the working tree
    }
    const problem = inspect(path, text);
    if (problem) problems.push({ path, problem });
  }
  return { filesChecked: files.length, problems };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { filesChecked, problems } = scan();
  if (problems.length > 0) {
    console.error('Privacy guard failed. These files must not be committed:');
    for (const { path, problem } of problems) console.error(`  ${path}: ${problem}`);
    process.exit(1);
  }
  console.log(`Privacy guard passed (${filesChecked} files checked).`);
}
