import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import type { TreehouseState } from '../src/harness/types';

export const HARNESS = './?harness=1&motion=off';

export interface FixtureManifest {
  file: string;
  people: number;
  families: number;
  rootId: string;
  paternalLine: {
    id: string;
    name: string;
    birthYear: number;
    birthPlace: string;
    lat: number;
    lng: number;
  }[];
  quirks: {
    twoParentFamilies: string[];
    duplicates: [string, string][];
    detached: string[];
    detachedFamily: string;
    /** People with no place on any event: shown at a relative's place. */
    noPlaces: string[];
  };
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

/** What `modifiedFixture` changed, for checking a sync's diff against. */
export const MODIFIED = {
  removedId: '@I420000000018@',
  renamedId: '@I420000000002@',
  addedId: '@I420000009999@',
  newPlace: 'Halifax, Halifax, Nova Scotia, Canada',
} as const;

/**
 * The 30-person fixture as a later export of the same tree might be: one person removed (and
 * their link from their parents' family), one renamed, and one made-up person added with a
 * birthplace the tree did not name. Built from the generated fixture, line by line, keeping
 * its byte-order mark and CRLF line endings.
 */
export function modifiedFixture(): { name: string; mimeType: string; buffer: Buffer } {
  const lines = fixtureBytes(30).toString('utf8').split('\r\n');
  const out: string[] = [];
  let skipping = false;
  for (const line of lines) {
    if (line.startsWith('0 ')) skipping = line === `0 ${MODIFIED.removedId} INDI`;
    if (skipping || line === `1 CHIL ${MODIFIED.removedId}`) continue;
    if (line === '0 TRLR') {
      out.push(
        `0 ${MODIFIED.addedId} INDI`,
        '1 NAME Ailsa /Testbrook/',
        '2 GIVN Ailsa',
        '2 SURN Testbrook',
        '1 SEX F',
        '1 BIRT',
        '2 DATE 1990',
        `2 PLAC ${MODIFIED.newPlace}`,
      );
    }
    out.push(line === '1 NAME Stanley /MacBriar/' ? '1 NAME Stanley Ewan /MacBriar/' : line);
  }
  if (out.length === lines.length) throw new Error('modifiedFixture changed nothing');
  return {
    name: fixture(30).file,
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(out.join('\r\n'), 'utf8'),
  };
}

/** Pins the first place on the review screen at a point, through the UI; returns its text. */
export async function pinFirstPlace(page: Page, at: { lng: number; lat: number }): Promise<string> {
  await page.getByTestId('review-places').click();
  const option = page.getByTestId('place-option').first();
  const text = (await option.locator('.person-name').textContent()) ?? '';
  await option.click();
  await settledState(page);
  await page.evaluate((t) => window.__treehouse?.flyTo({ ...t, zoom: 7 }), at);
  await page.getByTestId('pin-place').click();
  const box = await page.getByTestId('map').boundingBox();
  if (!box) throw new Error('no map');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.getByTestId('place-option').filter({ hasText: 'Pinned by you' }).first().waitFor();
  await page.getByTestId('back-to-tree').click();
  await page.getByTestId('tree-panel').waitFor();
  await settledState(page);
  return text;
}
