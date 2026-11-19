import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { zipSync } from 'fflate';
import {
  fixture,
  fixtureBytes,
  importAndChooseRoot,
  importFile,
  openApp,
  settledState,
} from './helpers';

const small = fixture(30);

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

test('importing a GEDCOM asks for the home person, then opens the tree', async ({ page }) => {
  const before = await openApp(page);
  expect(before.screen).toBe('library');
  expect(before.library).toEqual({ loaded: true, imports: [] });
  await expect(page.getByTestId('empty-state')).toBeVisible();

  const picking = await importFile(page, small.path);
  expect(picking.screen).toBe('root-picker');
  expect(picking.import).toMatchObject({ busy: false, error: null, alreadyImported: false });
  expect(picking.tree).toMatchObject({
    name: 'treehouse-30',
    people: 30,
    families: small.families,
    warnings: 0,
    rootId: null,
  });

  // The first person in the file is offered first, with their years and birthplace.
  const first = page.getByTestId('root-option').first();
  await expect(first).toHaveAttribute('data-person-id', small.rootId);
  await expect(first).toContainText('Rowan MacBriar');
  await expect(first).toContainText('1986–');
  await expect(first).toContainText('Vancouver, British Columbia, Canada');
  await page.screenshot({ path: 'reports/e2e/screenshots/root-picker.png' });
  await expectNoAxeViolations(page);

  await first.click();
  await expect(page.getByTestId('tree-panel')).toBeVisible();
  const opened = await settledState(page);
  expect(opened.screen).toBe('tree');
  expect(opened.tree).toMatchObject({ people: 30, rootId: small.rootId });
  expect(opened.library.imports).toEqual([
    {
      id: opened.tree?.importId,
      name: 'treehouse-30',
      people: 30,
      families: small.families,
      rootId: small.rootId,
      syncedAt: null,
      fileRemembered: false,
    },
  ]);
  await expect(page.getByTestId('tree-name')).toHaveText('treehouse-30');
  await expect(page.getByTestId('tree-counts')).toHaveText(
    `30 people, ${small.families} families.`,
  );
  await expect(page.getByTestId('home-person')).toContainText('Rowan MacBriar');
  await expect(page.getByTestId('tree-warnings')).toHaveCount(0);
  await page.screenshot({ path: 'reports/e2e/screenshots/tree.png' });
  await expectNoAxeViolations(page);
});

test('a reload remembers the import and its home person', async ({ page }) => {
  await openApp(page);
  const opened = await importAndChooseRoot(page);

  // Reloading with the tree open opens it again (see sync.spec.ts); from the library, the
  // library comes back.
  await page.getByTestId('back-to-library').click();
  await page.reload();
  await page.waitForFunction(() => window.__treehouse !== undefined);
  const reloaded = await settledState(page);
  expect(reloaded.screen).toBe('library');
  expect(reloaded.tree).toBeNull();
  expect(reloaded.library.imports).toEqual(opened.library.imports);
  await expect(page.getByTestId('library-item')).toHaveCount(1);
  await expect(page.getByTestId('library-open')).toContainText('treehouse-30');
  await expect(page.getByTestId('library-open')).toContainText('30 people');
  await page.screenshot({ path: 'reports/e2e/screenshots/library.png' });
  await expectNoAxeViolations(page);

  // Opening it goes straight to the tree: the home person was remembered.
  await page.getByTestId('library-open').click();
  await expect(page.getByTestId('tree-panel')).toBeVisible();
  const reopened = await settledState(page);
  expect(reopened.screen).toBe('tree');
  expect(reopened.tree).toEqual(opened.tree);
});

test('the home person can be found by name without accents, and changed later', async ({
  page,
}) => {
  await openApp(page);
  await importFile(page, small.path);

  await page.getByTestId('root-search').fill('morag macfennel');
  await expect(page.getByTestId('root-option')).toHaveCount(1);
  await expect(page.getByTestId('root-option')).toContainText('Mòrag (Marion) MacFennel');
  await expect(page.getByTestId('root-result-count')).toHaveText('1 match:');
  await page.getByTestId('root-search').fill('nobody by this name');
  await expect(page.getByTestId('root-option')).toHaveCount(0);
  await expect(page.getByTestId('root-result-count')).toHaveText('Nobody matches that name.');

  await page.getByTestId('root-search').fill('morag macfennel');
  const moragId = await page.getByTestId('root-option').getAttribute('data-person-id');
  await page.getByTestId('root-option').click();
  await expect(page.getByTestId('home-person')).toContainText('Mòrag (Marion) MacFennel');
  expect((await settledState(page)).tree?.rootId).toBe(moragId);

  // Change it: Cancel keeps the current person, choosing another replaces them.
  await page.getByTestId('change-root').click();
  expect((await settledState(page)).screen).toBe('root-picker');
  await page.getByTestId('root-cancel').click();
  expect((await settledState(page)).tree?.rootId).toBe(moragId);

  await page.getByTestId('change-root').click();
  await page.getByTestId('root-search').fill('rowan');
  await page.getByTestId('root-option').first().click();
  await expect(page.getByTestId('home-person')).toContainText('Rowan MacBriar');
  const state = await settledState(page);
  expect(state.tree?.rootId).toBe(small.rootId);
  expect(state.library.imports[0]?.rootId).toBe(small.rootId);
});

test('an import can be renamed and deleted from the library', async ({ page }) => {
  await openApp(page);
  await importAndChooseRoot(page);
  await page.getByTestId('back-to-library').click();
  expect((await settledState(page)).screen).toBe('library');

  await page.getByTestId('rename-button').click();
  await page.getByTestId('rename-input').fill('  My father’s side  ');
  await page.getByTestId('rename-save').click();
  await expect(page.getByTestId('library-open')).toContainText('My father’s side');
  expect((await settledState(page)).library.imports[0]?.name).toBe('My father’s side');

  // Deleting asks first; "Keep" backs out.
  await page.getByTestId('delete-button').click();
  await page.getByRole('button', { name: 'Keep' }).click();
  await expect(page.getByTestId('library-item')).toHaveCount(1);

  await page.getByTestId('delete-button').click();
  await page.getByTestId('delete-confirm').click();
  await expect(page.getByTestId('library-item')).toHaveCount(0);
  await expect(page.getByTestId('empty-state')).toBeVisible();

  // It is gone from the browser's storage too, not just from the screen.
  await page.reload();
  await page.waitForFunction(() => window.__treehouse !== undefined);
  expect((await settledState(page)).library.imports).toEqual([]);
});

test('a zip export is opened like a .ged file', async ({ page }) => {
  await openApp(page);
  const zip = zipSync({
    'media/readme.txt': new Uint8Array([104, 105]),
    'Export/treehouse-30.ged': new Uint8Array(fixtureBytes(30)),
  });
  const state = await importFile(page, {
    name: 'My Export.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(zip),
  });
  expect(state.import.error).toBeNull();
  expect(state.screen).toBe('root-picker');
  expect(state.tree).toMatchObject({ name: 'My Export', people: 30 });
});

test('choosing the same file again opens the existing import instead of adding a copy', async ({
  page,
}) => {
  await openApp(page);
  const first = await importAndChooseRoot(page);
  await page.getByTestId('back-to-library').click();

  const again = await importFile(page, {
    name: 'same-file-renamed.ged',
    mimeType: 'text/plain',
    buffer: fixtureBytes(30),
  });
  expect(again.library.imports).toHaveLength(1);
  expect(again.import.alreadyImported).toBe(true);
  expect(again.screen).toBe('tree');
  expect(again.tree).toEqual(first.tree);
  await expect(page.getByTestId('already-imported')).toBeVisible();
});

test('a file that is not a GEDCOM is refused with a clear message', async ({ page }) => {
  await openApp(page);
  const state = await importFile(page, {
    name: 'holiday-notes.ged',
    mimeType: 'text/plain',
    buffer: Buffer.from('Dear diary, today we went to the beach.'),
  });
  expect(state.screen).toBe('library');
  expect(state.import).toMatchObject({ busy: false, error: 'not-gedcom' });
  expect(state.library.imports).toEqual([]);
  await expect(page.getByTestId('import-error')).toContainText('does not look like a GEDCOM file');

  // A good file afterwards clears the error.
  const ok = await importFile(page, small.path);
  expect(ok.import.error).toBeNull();
  expect(ok.screen).toBe('root-picker');
});

test('a file dropped on the page is imported', async ({ page }) => {
  await openApp(page);
  const dataTransfer = await page.evaluateHandle((text) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([text], 'dropped.ged', { type: 'text/plain' }));
    return transfer;
  }, fixtureBytes(30).toString('utf8'));

  await page.getByTestId('app-shell').dispatchEvent('dragover', { dataTransfer });
  await expect(page.getByTestId('drop-overlay')).toBeVisible();
  await page.getByTestId('app-shell').dispatchEvent('drop', { dataTransfer });
  await expect(page.getByTestId('root-picker')).toBeVisible();
  await expect(page.getByTestId('drop-overlay')).toHaveCount(0);

  const state = await settledState(page);
  expect(state.tree).toMatchObject({ name: 'dropped', people: 30 });
});

test('a 5,000-person tree imports quickly and its picker stays usable', async ({ page }) => {
  const large = fixture(5000);
  await openApp(page);
  const state = await importFile(page, large.path);

  expect(state.tree).toMatchObject({ people: 5000, families: large.families, warnings: 0 });
  // Reading and parsing happen in a worker. Generous, so a slow CI runner does not flake.
  expect(state.import.lastMs).not.toBeNull();
  expect(state.import.lastMs).toBeLessThan(5000);
  console.log(`import of 5,000 people: ${state.import.lastMs ?? '?'} ms in the worker`);

  // Only a screenful of people is rendered, however large the tree.
  await expect(page.getByTestId('root-option')).toHaveCount(40);
  await page.getByTestId('root-search').fill('rowan macbriar');
  await expect(page.getByTestId('root-option').first()).toHaveAttribute(
    'data-person-id',
    large.rootId,
  );

  await page.getByTestId('root-option').first().click();
  await expect(page.getByTestId('tree-counts')).toHaveText(
    `5,000 people, ${large.families.toLocaleString('en')} families.`,
  );
});

test('importing sends nothing off the page', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith('http://127.0.0.1:4173') && !/^(blob|data):/.test(url)) external.push(url);
  });
  const posts: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET') posts.push(`${request.method()} ${request.url()}`);
  });

  await openApp(page);
  await importAndChooseRoot(page);
  expect(external).toEqual([]);
  expect(posts).toEqual([]);
});
