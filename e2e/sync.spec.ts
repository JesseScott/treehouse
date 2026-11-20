import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  fixture,
  importAndChooseRoot,
  modifiedFixture,
  MODIFIED,
  openApp,
  pinFirstPlace,
  settledState,
} from './helpers';

const small = fixture(30);

const distanceKm = (a: { lng: number; lat: number }, b: { lng: number; lat: number }) => {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lng - a.lng) * rad) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
};

const focus = (page: Page, id: string) =>
  page.evaluate((personId) => window.__treehouse?.focus(personId), id);

async function reload(page: Page) {
  await page.reload();
  await page.waitForFunction(() => window.__treehouse !== undefined);
  return settledState(page);
}

const ancestor = (generation: number) => {
  const person = small.paternalLine[generation];
  if (!person) throw new Error(`no ancestor ${generation}`);
  return person;
};

test('a reload remembers the open import, its focus, threads and camera', async ({ page }) => {
  await openApp(page);
  const opened = await importAndChooseRoot(page);
  expect(opened.view.restored).toBe(false);

  await focus(page, ancestor(3).id);
  await page.getByTestId('thread-family').check();
  await page.getByTestId('projection-toggle').click();
  // Look somewhere of the user's own choosing, away from the focused person.
  const look = { lng: -60.5, lat: 47.25, zoom: 4.5 };
  await page.evaluate((t) => window.__treehouse?.flyTo(t), look);
  const before = await settledState(page);
  expect(before.map.projection).toBe('mercator');
  expect(before.view.saving).toBe(false);

  const after = await reload(page);
  expect(after.screen).toBe('tree');
  expect(after.tree).toEqual(before.tree);
  expect(after.view.restored).toBe(true);
  expect(after.focusedPersonId).toBe(ancestor(3).id);
  expect(after.threadToggles).toEqual({ ...before.threadToggles, family: true });
  expect(after.map.projection).toBe('mercator');
  expect(distanceKm(after.map.center, look)).toBeLessThan(1);
  expect(after.map.zoom).toBeCloseTo(look.zoom, 1);
  await expect(page.getByTestId('projection-toggle')).toHaveText('Globe');

  // Back to the library and in again: the same view, per import, not per visit.
  await page.getByTestId('back-to-library').click();
  expect((await reload(page)).screen).toBe('library');
  await page.getByTestId('library-open').click();
  await page.getByTestId('tree-panel').waitFor();
  const reopened = await settledState(page);
  expect(reopened.focusedPersonId).toBe(ancestor(3).id);
  expect(distanceKm(reopened.map.center, look)).toBeLessThan(1);
});

test('sync: a changed file shows its diff, and applying it keeps home, focus and pins', async ({
  page,
}) => {
  await openApp(page);
  const opened = await importAndChooseRoot(page);
  const importId = opened.tree?.importId ?? '';
  await pinFirstPlace(page, { lng: -71.5, lat: 46.2 });
  await focus(page, ancestor(2).id);
  const before = await settledState(page);
  expect(before.geocode.pinned).toBe(1);
  await page.getByTestId('back-to-library').click();

  // The same file again changes nothing.
  await page.getByTestId('sync-file-input').setInputFiles(small.path);
  await expect(page.getByTestId('sync-review')).toHaveAttribute('data-phase', 'unchanged');
  expect((await settledState(page)).sync).toMatchObject({ importId, phase: 'unchanged' });
  await page.getByTestId('sync-close').click();
  expect((await settledState(page)).sync).toBeNull();

  // A newer export: one person added, one removed, one renamed, one new place.
  await page.getByTestId('sync-file-input').setInputFiles(modifiedFixture());
  await expect(page.getByTestId('sync-review')).toHaveAttribute('data-phase', 'review');
  const review = await settledState(page);
  expect(review.sync).toEqual({
    importId,
    phase: 'review',
    error: null,
    added: 1,
    removed: 1,
    changed: 1,
    families: { added: 0, removed: 0, changed: 1 },
    newPlaces: 1,
    droppedPlaces: 0,
    rootLost: false,
  });
  await expect(page.getByTestId('sync-summary')).toHaveText(
    '1 person added, 1 person removed, 1 person changed, 1 family added, removed or changed, 1 place new.',
  );
  await page.getByTestId('sync-added').click();
  await expect(page.getByTestId('sync-added')).toContainText('Ailsa Testbrook');
  await page.getByTestId('sync-removed').click();
  await expect(page.getByTestId('sync-removed')).toContainText('Murdo MacBriar');
  await page.screenshot({ path: 'reports/e2e/screenshots/sync.png' });
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  // Nothing is stored until the diff is applied.
  expect(review.library.imports[0]?.people).toBe(30);

  await page.getByTestId('sync-apply').click();
  await expect(page.getByTestId('sync-review')).toHaveAttribute('data-phase', 'done');
  const applied = await settledState(page);
  expect(applied.library.imports[0]).toMatchObject({
    id: importId,
    people: 30,
    rootId: small.rootId,
  });
  expect(applied.library.imports[0]?.syncedAt).not.toBeNull();
  await expect(page.getByTestId('library-open')).toContainText('synced');

  await page.getByTestId('library-open').click();
  await page.getByTestId('tree-panel').waitFor();
  const after = await settledState(page);
  expect(after.tree).toMatchObject({ importId, rootId: small.rootId, people: 30 });
  expect(after.focusedPersonId).toBe(ancestor(2).id);
  expect(after.geocode.pinned).toBe(1);
  expect(after.geocode.places).toBe(before.geocode.places + 1);
  expect(await focus(page, MODIFIED.addedId)).toEqual({ ok: true });
  expect(await focus(page, MODIFIED.removedId)).toEqual({ ok: false, reason: 'unknown-person' });
});

test('sync: the Sync button uses the system picker where the browser has one', async ({ page }) => {
  // Stand in for Chromium's picker: hand back the modified file as a "handle".
  const bytes = [...modifiedFixture().buffer];
  await page.addInitScript((data) => {
    const file = new File([new Uint8Array(data)], 'treehouse-30.ged');
    (window as unknown as { showOpenFilePicker: unknown }).showOpenFilePicker = () =>
      Promise.resolve([{ kind: 'file', name: file.name, getFile: () => Promise.resolve(file) }]);
  }, bytes);
  await openApp(page);
  await importAndChooseRoot(page);
  await page.getByTestId('back-to-library').click();

  await page.getByTestId('sync-button').click();
  await expect(page.getByTestId('sync-review')).toHaveAttribute('data-phase', 'review');
  const state = await settledState(page);
  expect(state.sync).toMatchObject({ phase: 'review', added: 1, removed: 1, changed: 1 });
  // The stand-in cannot be stored the way a real handle is, so the file is not remembered.
  expect(state.library.imports[0]?.fileRemembered).toBe(false);
  await page.getByTestId('sync-close').click();
  expect((await settledState(page)).library.imports[0]?.people).toBe(30);
});

test('sync: a file that is not GEDCOM is refused and nothing changes', async ({ page }) => {
  await openApp(page);
  await importAndChooseRoot(page);
  await page.getByTestId('back-to-library').click();
  await page.getByTestId('sync-file-input').setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('just some text', 'utf8'),
  });
  await expect(page.getByTestId('sync-error')).toHaveAttribute('data-error-code', 'not-gedcom');
  expect((await settledState(page)).sync).toMatchObject({ phase: 'error', error: 'not-gedcom' });
});

test('pins can be saved to a file and read into another browser', async ({ page, browser }) => {
  await openApp(page);
  await importAndChooseRoot(page);
  const text = await pinFirstPlace(page, { lng: -71.5, lat: 46.2 });
  await page.getByTestId('back-to-library').click();
  expect((await settledState(page)).placeCache.stored).toBe(1);
  await expect(page.getByTestId('stored-places')).toContainText('1 pin or online answer');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-places').click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^treehouse-places-\d{4}-\d\d-\d\d\.json$/);
  const path = await download.path();
  const saved = JSON.parse(readFileSync(path, 'utf8')) as {
    format: string;
    places: Record<string, unknown>[];
  };
  expect(saved.format).toBe('treehouse-places');
  expect(saved.places).toHaveLength(1);
  expect(Object.keys(saved.places[0] ?? {})).toEqual([
    'key',
    'source',
    'location',
    'label',
    'updatedAt',
  ]);
  // Place text only: no name from the tree is in the file.
  const raw = readFileSync(path, 'utf8');
  for (const person of small.paternalLine) expect(raw).not.toContain(person.name);
  expect((await settledState(page)).placeCache.last).toEqual({ kind: 'exported', places: 1 });

  // A fresh browser with the same tree, but no pins until the file is read.
  const other = await browser.newPage();
  await openApp(other);
  await importAndChooseRoot(other);
  expect((await settledState(other)).geocode.pinned).toBe(0);
  await other.getByTestId('back-to-library').click();
  await other.getByTestId('place-file-input').setInputFiles(path);
  await expect(other.getByTestId('place-file-status')).toContainText('Read 1 new');
  expect((await settledState(other)).placeCache).toMatchObject({
    stored: 1,
    last: { kind: 'imported', added: 1, updated: 0, skipped: 0, invalid: 0 },
  });
  await other.getByTestId('library-open').click();
  await other.getByTestId('tree-panel').waitFor();
  expect((await settledState(other)).geocode.pinned).toBe(1);
  expect(await other.evaluate((t) => window.__treehouse?.place(t), text)).toMatchObject({
    source: 'manual',
  });

  // Reading the same file again adds nothing; a file that is not a place file is refused.
  await other.getByTestId('back-to-library').click();
  await other.getByTestId('place-file-input').setInputFiles(path);
  await expect(other.getByTestId('place-file-status')).toContainText('1 already here');
  await other.getByTestId('place-file-input').setInputFiles({
    name: 'other.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"hello":"world"}', 'utf8'),
  });
  await expect(other.getByTestId('place-file-error')).toHaveAttribute(
    'data-error-code',
    'not-a-place-file',
  );
  await other.close();
});
