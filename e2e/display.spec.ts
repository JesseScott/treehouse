import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { fixture, importAndChooseRoot, openApp, settledState } from './helpers';

const small = fixture(30);
const home = small.paternalLine[0];
// The 4th generation up was born long enough ago to be shown whatever the setting.
const greatGrandfather = small.paternalLine[3];

test('hide living people: names, dates and places go, and the choice is kept', async ({ page }) => {
  if (!home || !greatGrandfather) throw new Error('fixture line too short');
  await openApp(page);
  let state = await importAndChooseRoot(page);
  expect(state.settings).toEqual({ hideLiving: false, motion: 'system' });
  expect(state.livingHidden).toBe(0);
  const markersBefore = state.markers.places;
  await expect(page.getByTestId('profile-name')).toHaveText(home.name);
  await expect(page.getByTestId('timeline-event').first()).toBeVisible();

  await page.getByTestId('hide-living').check();
  state = await settledState(page);
  expect(state.settings.hideLiving).toBe(true);
  expect(state.livingHidden).toBeGreaterThan(0);
  await expect(page.getByTestId('hide-living-hint')).toContainText(
    `${state.livingHidden} people are shown as`,
  );
  // The home person (born in the 1980s) is still focused, but as "Living" with no events.
  expect(state.focusedPersonId).toBe(home.id);
  await expect(page.getByTestId('profile-name')).toHaveText('Living');
  await expect(page.getByTestId('timeline-event')).toHaveCount(0);
  expect(state.markers.places).toBeLessThanOrEqual(markersBefore);
  // Search finds a dead ancestor, but no living person by name.
  const search = page.getByTestId('person-search');
  await search.fill(home.name.split(' ')[0] ?? '');
  await expect(page.getByTestId('search-result').filter({ hasText: home.name })).toHaveCount(0);
  await search.fill(greatGrandfather.name);
  await expect(page.getByTestId('search-result').first()).toContainText(greatGrandfather.name);
  await search.fill('');

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

  // The setting is kept in this browser, so a reload reopens the tree with it still on.
  await page.reload();
  state = await settledState(page);
  expect(state.screen).toBe('tree');
  expect(state.settings.hideLiving).toBe(true);
  await expect(page.getByTestId('profile-name')).toHaveText('Living');

  await page.getByTestId('hide-living').uncheck();
  state = await settledState(page);
  expect(state.livingHidden).toBe(0);
  expect(state.markers.places).toBe(markersBefore);
  await expect(page.getByTestId('profile-name')).toHaveText(home.name);
});

test('the camera setting overrides the system’s reduced-motion setting', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // No ?motion=off here: the settings alone decide.
  await openApp(page, './?harness=1');
  let state = await importAndChooseRoot(page);
  expect(state.settings.motion).toBe('system');
  expect(state.flags.motion).toBe(false);

  await page.getByTestId('motion-setting').selectOption('on');
  state = await settledState(page);
  expect(state.settings.motion).toBe('on');
  expect(state.flags.motion).toBe(true);

  // Following the system again picks up a change to it straight away.
  await page.getByTestId('motion-setting').selectOption('system');
  expect((await settledState(page)).flags.motion).toBe(false);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  expect((await settledState(page)).flags.motion).toBe(true);

  await page.getByTestId('motion-setting').selectOption('off');
  await page.reload();
  state = await settledState(page);
  expect(state.settings.motion).toBe('off');
  expect(state.flags.motion).toBe(false);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 740 }, isMobile: true, hasTouch: true });

  test('the panel is a sheet along the bottom and the focused place shows above it', async ({
    page,
  }) => {
    await openApp(page);
    const state = await importAndChooseRoot(page);
    const at = state.focus?.shownAt;
    if (!at) throw new Error('home person not on the map');

    const panel = await page.getByTestId('tree-panel').boundingBox();
    const point = await page.evaluate((t) => window.__treehouse?.project(t) ?? null, at);
    if (!panel || !point) throw new Error('panel or place not on screen');
    expect(panel.y + panel.height).toBeGreaterThan(740 - 80);
    expect(panel.width).toBeGreaterThan(375 * 0.9);
    // The camera centres the place in the map above the sheet, not behind it.
    expect(point.y).toBeLessThan(panel.y);
    expect(point.y).toBeGreaterThan(0);

    const scroll = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scroll).toBeLessThanOrEqual(375);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

    // A journey's controls go to the top, clear of the sheet.
    await page.getByTestId('journey-paternal').click();
    const bar = await page.getByTestId('journey-bar').boundingBox();
    if (!bar) throw new Error('no journey bar');
    expect(bar.y + bar.height).toBeLessThan(panel.y);
  });
});
