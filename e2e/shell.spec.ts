import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import type { TreehouseState } from '../src/harness/types';

const HARNESS = './?harness=1&motion=off';
const VANCOUVER = { lng: -123.1207, lat: 49.2827 };
const STORNOWAY = { lng: -6.3865, lat: 58.2093 };

/** Opens the app with the debug API on and waits until the map is idle. */
async function openApp(page: Page, url = HARNESS): Promise<TreehouseState> {
  await page.goto(url);
  await page.waitForFunction(() => window.__treehouse !== undefined);
  return page.evaluate(async () => {
    const api = window.__treehouse;
    if (!api) throw new Error('debug API missing');
    await api.whenIdle();
    return api.state();
  });
}

function flyTo(page: Page, target: { lng: number; lat: number; zoom: number }) {
  return page.evaluate(async (t) => {
    const api = window.__treehouse;
    if (!api) throw new Error('debug API missing');
    await api.flyTo(t);
    return api.state();
  }, target);
}

test('the shell loads with a working offline globe', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  const state = await openApp(page);

  await expect(page).toHaveTitle('treehouse');
  await expect(page.getByTestId('app-shell')).toHaveAttribute('data-map-loaded', 'true');
  await expect(page.getByTestId('app-header')).toContainText('treehouse');
  await expect(page.getByTestId('empty-state')).toBeVisible();
  await expect(page.getByTestId('map').locator('canvas')).toBeVisible();

  expect(state.app.name).toBe('treehouse');
  expect(state.flags).toEqual({ harness: true, motion: false });
  expect(state.map).toMatchObject({ loaded: true, moving: false, style: 'offline' });
  expect(state.map.projection).toBe('globe');
  // Nothing is imported in the empty shell.
  expect(state.tree).toBeNull();
  expect(state.focusedPersonId).toBeNull();
  expect(state.threads).toEqual({ lineage: 0, family: 0, ancestors: 0, migration: 0 });
  expect(state.geocode).toEqual({ places: 0, resolved: 0, approximate: 0, unresolved: 0 });

  expect(errors).toEqual([]);
  await page.screenshot({ path: 'reports/e2e/screenshots/shell.png' });
});

/** Screenshots the map and reads the colour of its centre pixel, decoding the PNG in the page. */
async function centrePixel(page: Page, name: string): Promise<[number, number, number]> {
  const shot = await page
    .getByTestId('map')
    .screenshot({ path: `reports/e2e/screenshots/${name}.png` });
  return page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('no 2d context');
    context.drawImage(bitmap, 0, 0);
    const [r = 0, g = 0, b = 0] = context.getImageData(
      bitmap.width >> 1,
      bitmap.height >> 1,
      1,
      1,
    ).data;
    return [r, g, b] as [number, number, number];
  }, shot.toString('base64'));
}

test('the map really draws land and ocean', async ({ page }) => {
  await openApp(page);
  // The centre of the map is the camera target: prairie is land, the mid-Pacific is not.
  await flyTo(page, { lng: -100, lat: 52, zoom: 4 });
  const [landR, landG, landB] = await centrePixel(page, 'land');
  await flyTo(page, { lng: -150, lat: 30, zoom: 4 });
  const [seaR, seaG, seaB] = await centrePixel(page, 'ocean');

  // Land is #8fd19e (light green) and ocean is #16384f (dark blue) in the offline style.
  expect(landG).toBeGreaterThan(180);
  expect(landG).toBeGreaterThan(landR);
  expect(landG).toBeGreaterThan(landB);
  expect(seaG).toBeLessThan(90);
  expect(seaB).toBeGreaterThan(seaR);
  expect(seaB).toBeGreaterThan(seaG);
});

test('the app needs no network beyond its own origin', async ({ page }) => {
  const external: string[] = [];
  const origin = 'http://127.0.0.1:4173';
  page.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith(origin) && !url.startsWith('blob:') && !url.startsWith('data:')) {
      external.push(url);
    }
  });
  await openApp(page);
  await flyTo(page, { ...STORNOWAY, zoom: 6 });
  expect(external).toEqual([]);
});

test('version.json matches the build the page reports', async ({ page, request }) => {
  const state = await openApp(page);
  const response = await request.get('./version.json');
  expect(response.ok()).toBe(true);
  const version = (await response.json()) as { name: string; version: string; commit: string };
  expect(version.name).toBe('treehouse');
  expect(version.commit).toBe(state.app.commit);
  expect(version.version).toBe(state.app.version);
});

test('with ?motion=off the camera jumps straight to its target', async ({ page }) => {
  await openApp(page);
  const state = await flyTo(page, { ...VANCOUVER, zoom: 6 });
  expect(state.map.center.lng).toBeCloseTo(VANCOUVER.lng, 3);
  expect(state.map.center.lat).toBeCloseTo(VANCOUVER.lat, 3);
  expect(state.map.zoom).toBeCloseTo(6, 3);
  expect(state.map.moving).toBe(false);
});

test('with motion on the camera flies and whenIdle waits for it to land', async ({ page }) => {
  const before = await openApp(page, './?harness=1');
  expect(before.flags.motion).toBe(true);

  // Start a flight without waiting, and catch it in the air.
  await page.evaluate(
    (t) => {
      void window.__treehouse?.flyTo(t);
    },
    { ...STORNOWAY, zoom: 5 },
  );
  await page.waitForFunction(() => window.__treehouse?.state().map.moving === true);

  const landed = await page.evaluate(async () => {
    const api = window.__treehouse;
    if (!api) throw new Error('debug API missing');
    await api.whenIdle();
    return api.state();
  });
  expect(landed.map.moving).toBe(false);
  expect(landed.map.center.lng).toBeCloseTo(STORNOWAY.lng, 2);
  expect(landed.map.center.lat).toBeCloseTo(STORNOWAY.lat, 2);
});

test('focus is a stub until a tree can be imported', async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(() => window.__treehouse?.focus('@I420000000001@'));
  expect(result).toEqual({ ok: false, reason: 'no-tree' });
});

test('the debug API is absent from a production page without ?harness=1', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByTestId('app-shell')).toHaveAttribute('data-map-loaded', 'true');
  expect(await page.evaluate(() => window.__treehouse)).toBeUndefined();
});

test('the shell has no accessibility violations', async ({ page }) => {
  await openApp(page);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});
