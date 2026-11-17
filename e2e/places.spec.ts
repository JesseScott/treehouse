import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import type { PlaceLocation } from '../src/harness/types';
import { fixture, importAndChooseRoot, openApp, settledState } from './helpers';

const small = fixture(30);
const NOMINATIM = 'https://nominatim.openstreetmap.org/**';

const distanceKm = (a: { lng: number; lat: number }, b: { lng: number; lat: number }) => {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lng - a.lng) * rad) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
};

const placeOf = (page: Page, text: string): Promise<PlaceLocation | null> =>
  page.evaluate((t) => window.__treehouse?.place(t) ?? null, text);

/** Imports the small fixture and opens its place-review screen. */
async function openPlaces(page: Page) {
  await openApp(page);
  await importAndChooseRoot(page);
  await page.getByTestId('review-places').click();
  await page.getByTestId('places-panel').waitFor();
  return settledState(page);
}

test('a tree is placed on the map from the bundled gazetteer, with nothing sent anywhere', async ({
  page,
}) => {
  const hosts: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith('http')) hosts.push(url.host);
  });

  await openApp(page);
  const state = await importAndChooseRoot(page);
  expect(state.geocode).toMatchObject({ busy: false, error: null, unresolved: 0, pinned: 0 });
  expect(state.geocode.places).toBeGreaterThan(10);
  expect(state.geocode.resolved + state.geocode.approximate).toBe(state.geocode.places);
  expect(state.geocode.resolved / state.geocode.places).toBeGreaterThan(0.8);
  await expect(page.getByTestId('geocode-summary')).toContainText(
    `${state.geocode.places} places: ${state.geocode.resolved} found`,
  );

  // Every birthplace on the paternal line is where the generator put it, to within 15 km.
  for (const person of small.paternalLine) {
    const found = await placeOf(page, person.birthPlace);
    if (!found || found.status === 'unresolved') throw new Error(`${person.birthPlace}: not found`);
    expect(distanceKm(found, person), person.birthPlace).toBeLessThan(15);
    expect(found.source).toBe('gazetteer');
  }
  // The two Stornoways stay on their own sides of the Atlantic.
  const scottish = await placeOf(page, 'Stornoway, Lewis, Ross and Cromarty, Scotland');
  expect(scottish).toMatchObject({ status: 'resolved' });
  expect(scottish && 'lng' in scottish && scottish.lng).toBeGreaterThan(-10);
  expect(await placeOf(page, 'Nowhere in this tree')).toBeNull();

  // Every request of the visit went to the app's own host: the gazetteer is part of the app.
  expect([...new Set(hosts)]).toEqual([new URL(page.url()).host]);
});

test('the review screen lists the places to check and flies to the one selected', async ({
  page,
}) => {
  const state = await openPlaces(page);
  expect(state.screen).toBe('places');
  expect(state.placeReview).toEqual({ selected: false, pinning: false });
  await expect(page.getByTestId('places-summary')).toContainText('approximate');

  // Only the places that are not exact are listed until "All" is chosen.
  const options = page.getByTestId('place-option');
  await expect(options).toHaveCount(state.geocode.approximate);
  await expect(options.first()).toHaveAttribute('data-status', 'approximate');
  await page.getByTestId('filter-all').click();
  await expect(options).toHaveCount(state.geocode.places);
  await page.getByTestId('filter-attention').click();

  const text = (await options.first().locator('.person-name').textContent()) ?? '';
  await options.first().click();
  await expect(page.getByTestId('place-pin')).toBeVisible();
  const selected = await settledState(page);
  expect(selected.placeReview.selected).toBe(true);
  const where = await placeOf(page, text);
  if (!where || where.status === 'unresolved')
    throw new Error('the selected place has no location');
  expect(distanceKm(selected.map.center, where)).toBeLessThan(1);

  await page.screenshot({ path: 'reports/e2e/screenshots/places.png' });
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

  await page.getByTestId('back-to-tree').click();
  await expect(page.getByTestId('tree-panel')).toBeVisible();
  await expect(page.getByTestId('place-pin')).toHaveCount(0);
});

test('a place can be pinned by clicking the map, and the pin is remembered', async ({ page }) => {
  const before = await openPlaces(page);
  const option = page.getByTestId('place-option').first();
  const text = (await option.locator('.person-name').textContent()) ?? '';
  await option.click();
  await settledState(page);

  // Look somewhere else, then click the middle of the map: the pin lands where the camera is.
  const target = { lng: -71.5, lat: 46.2 };
  await page.evaluate((t) => window.__treehouse?.flyTo({ ...t, zoom: 7 }), target);
  await page.getByTestId('pin-place').click();
  await expect(page.getByTestId('pin-hint')).toHaveText('Click the map where this place is.');
  expect((await settledState(page)).placeReview.pinning).toBe(true);
  const box = await page.getByTestId('map').boundingBox();
  if (!box) throw new Error('no map');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  await expect(option).toContainText('Pinned by you');
  const pinned = await settledState(page);
  expect(pinned.placeReview.pinning).toBe(false);
  expect(pinned.geocode.pinned).toBe(1);
  expect(pinned.geocode.resolved).toBe(before.geocode.resolved + 1);
  const where = await placeOf(page, text);
  expect(where).toMatchObject({ status: 'resolved', source: 'manual' });
  if (!where || where.status === 'unresolved') throw new Error('not pinned');
  expect(distanceKm(where, target)).toBeLessThan(2);

  // The pin belongs to the place, not the visit: it is still there after a reload.
  await page.reload();
  await page.waitForFunction(() => window.__treehouse !== undefined);
  await settledState(page);
  await page.getByTestId('library-open').first().click();
  await page.getByTestId('tree-panel').waitFor();
  const reopened = await settledState(page);
  expect(reopened.geocode.pinned).toBe(1);
  expect(await placeOf(page, text)).toMatchObject({ source: 'manual', lng: where.lng });

  // Removing the pin goes back to what the gazetteer said.
  await page.getByTestId('review-places').click();
  await page.getByTestId('filter-all').click();
  await page.getByTestId('place-option').filter({ hasText: 'Pinned by you' }).click();
  await page.getByTestId('reset-place').click();
  await expect(page.getByTestId('place-option').filter({ hasText: 'Pinned by you' })).toHaveCount(
    0,
  );
  const reset = await settledState(page);
  expect(reset.geocode.pinned).toBe(0);
  expect(reset.geocode.resolved).toBe(before.geocode.resolved);
  expect(await placeOf(page, text)).toMatchObject({ status: 'approximate', source: 'gazetteer' });
});

test('online lookup is off until allowed, and then sends only the place text', async ({ page }) => {
  const requests: URL[] = [];
  await page.route(NOMINATIM, async (route) => {
    requests.push(new URL(route.request().url()));
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify([{ lat: '45.6333', lon: '-71.3667', display_name: 'A test answer' }]),
    });
  });

  const before = await openPlaces(page);
  expect(before.onlineLookup).toEqual({
    enabled: false,
    running: false,
    done: 0,
    total: 0,
    error: null,
  });
  await expect(page.getByTestId('online-opt-in')).not.toBeChecked();
  await expect(page.getByTestId('online-start')).toHaveCount(0);
  expect(requests).toEqual([]);

  await page.getByTestId('online-opt-in').check();
  expect(requests).toEqual([]); // Allowing it does not start it.
  const listed = await page.getByTestId('place-option').locator('.person-name').allTextContents();
  await page.getByTestId('online-start').click();
  await expect(page.getByTestId('online-status')).toContainText('Looked up', { timeout: 15_000 });
  const after = await settledState(page);

  expect(after.onlineLookup).toMatchObject({
    enabled: true,
    running: false,
    done: before.geocode.approximate,
    total: before.geocode.approximate,
    error: null,
  });
  expect(after.geocode).toMatchObject({ approximate: 0, online: before.geocode.approximate });
  // One request per place, each carrying the place text and nothing else from the tree.
  expect(requests.map((url) => url.searchParams.get('q')).sort()).toEqual([...listed].sort());
  for (const url of requests) {
    expect([...url.searchParams.keys()].sort()).toEqual(['format', 'limit', 'q']);
  }
  await expect(page.getByTestId('online-start')).toBeDisabled();

  // The answers and the consent are both remembered.
  await page.reload();
  await page.waitForFunction(() => window.__treehouse !== undefined);
  await settledState(page);
  await page.getByTestId('library-open').first().click();
  await page.getByTestId('tree-panel').waitFor();
  const reopened = await settledState(page);
  expect(reopened.geocode.online).toBe(before.geocode.approximate);
  expect(reopened.onlineLookup.enabled).toBe(true);
  expect(requests).toHaveLength(before.geocode.approximate);
});

test('an online lookup that fails says so and keeps what it has', async ({ page }) => {
  await page.route(NOMINATIM, (route) => route.fulfill({ status: 503, body: 'busy' }));
  const before = await openPlaces(page);
  await page.getByTestId('online-opt-in').check();
  await page.getByTestId('online-start').click();
  await expect(page.getByTestId('online-error')).toBeVisible();
  const after = await settledState(page);
  expect(after.onlineLookup).toMatchObject({ running: false, error: 'online-unavailable' });
  expect(after.geocode.approximate).toBe(before.geocode.approximate);
});

test('a tree still opens when the gazetteer cannot be loaded', async ({ page }) => {
  await page.route('**/gazetteer/**', (route) => route.abort());
  await openApp(page);
  const state = await importAndChooseRoot(page);
  expect(state.screen).toBe('tree');
  expect(state.geocode).toMatchObject({ busy: false, error: 'gazetteer-unavailable', resolved: 0 });
  expect(state.geocode.unresolved).toBe(state.geocode.places);
  await expect(page.getByTestId('geocode-summary')).toContainText('could not be loaded');
});
