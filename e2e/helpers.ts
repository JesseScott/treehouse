import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import type { TreehouseState } from '../src/harness/types';

export const HARNESS = './?harness=1&motion=off';

export interface FixtureManifest {
  file: string;
  people: number;
  families: number;
  rootId: string;
  paternalLine: { id: string; name: string; birthYear: number; birthPlace: string }[];
}

const fixtureDir = new URL('../fixtures/synthetic/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', fixtureDir), 'utf8')) as {
  fixtures: FixtureManifest[];
};

/** The manifest entry and file path of a synthetic fixture, by its number of people. */
export function fixture(people: 30 | 500 | 5000): FixtureManifest & { path: string } {
  const entry = manifest.fixtures.find((f) => f.people === people);
  if (!entry) throw new Error(`no fixture with ${people} people`);
  return { ...entry, path: `fixtures/synthetic/${entry.file}` };
}

export function fixtureBytes(people: 30 | 500 | 5000): Buffer {
  return readFileSync(new URL(fixture(people).file, fixtureDir));
}

/** Waits for the app to settle (map, library, any import) and returns its state. */
export function settledState(page: Page): Promise<TreehouseState> {
  return page.evaluate(async () => {
    const api = window.__treehouse;
    if (!api) throw new Error('debug API missing');
    await api.whenIdle();
    return api.state();
  });
}

/** Opens the app with the debug API on and waits until it is idle. */
export async function openApp(page: Page, url = HARNESS): Promise<TreehouseState> {
  await page.goto(url);
  await page.waitForFunction(() => window.__treehouse !== undefined);
  return settledState(page);
}

/** Chooses a file in the library screen's file input and waits for the import to finish. */
export async function importFile(
  page: Page,
  file: string | { name: string; mimeType: string; buffer: Buffer },
): Promise<TreehouseState> {
  const before = await page.evaluate(() => window.__treehouse?.state().import.attempts ?? 0);
  await page.getByTestId('file-input').setInputFiles(file);
  // Wait for this import to have started, so the settled state is not the one from before it.
  await page.waitForFunction(
    (attempts) => (window.__treehouse?.state().import.attempts ?? 0) > attempts,
    before,
  );
  return settledState(page);
}

/** Imports the 30-person fixture and picks its first person as the home person. */
export async function importAndChooseRoot(page: Page): Promise<TreehouseState> {
  await importFile(page, fixture(30).path);
  await page.getByTestId('root-option').first().click();
  await page.getByTestId('tree-panel').waitFor();
  return settledState(page);
}
