import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import type { FocusResult, TreehouseState } from '../src/harness/types';
import { fixture, importAndChooseRoot, openApp, settledState } from './helpers';

const small = fixture(30);
const line = small.paternalLine;

const distanceKm = (a: { lng: number; lat: number }, b: { lng: number; lat: number }) => {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lng - a.lng) * rad) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
};

const focus = (page: Page, id: string): Promise<FocusResult | undefined> =>
  page.evaluate((personId) => window.__treehouse?.focus(personId), id);

/** The line ancestor `generation` steps up from the home person. */
const ancestor = (generation: number) => {
  const person = line[generation];
  if (!person) throw new Error(`no ancestor ${generation}`);
  return person;
};

function expectOver(state: TreehouseState, person: { lng: number; lat: number }, km = 15) {
  expect(state.map.moving).toBe(false);
  expect(distanceKm(state.map.center, person)).toBeLessThan(km);
}

test('opening a tree focuses the home person at their birthplace, with markers drawn', async ({
  page,
}) => {
  await openApp(page);
  const state = await importAndChooseRoot(page);
  const home = ancestor(0);

  expect(state.focusedPersonId).toBe(home.id);
  expect(state.focus).toMatchObject({
    personId: home.id,
    relationship: { kind: 'self', label: 'Home person' },
    pathLength: 1,
    shownAt: { basis: 'birth', approximate: false },
  });
  expectOver(state, home);
  expect(state.markers.places).toBe(state.geocode.resolved + state.geocode.approximate);
  expect(state.markers.rendered).toBeGreaterThan(0);

  await expect(page.getByTestId('profile-name')).toHaveText(home.name);
  await expect(page.getByTestId('profile-relationship')).toHaveText('Home person');
  await expect(page.getByTestId('profile-place')).toHaveAttribute('data-basis', 'birth');
  await expect(page.getByTestId('timeline-event').first()).toHaveAttribute('data-type', 'birth');
  await expect(page.getByTestId('focus-pin')).toHaveCount(1);
  await expect(page.getByTestId('pedigree-self')).toHaveText(home.name);
  await page.screenshot({ path: 'reports/e2e/screenshots/focus.png' });
});

test('focus() flies to each ancestor’s birthplace along the paternal line', async ({ page }) => {
  await openApp(page);
  await importAndChooseRoot(page);

  const labels = [
    'Home person',
    'Father',
    'Grandfather',
    'Great-grandfather',
    '2nd great-grandfather',
    '3rd great-grandfather',
    '4th great-grandfather',
    '5th great-grandfather',
  ];
  for (const [generation, person] of line.entries()) {
    expect(await focus(page, person.id)).toEqual({ ok: true });
    const state = await settledState(page);
    expect(state.focus?.relationship.label).toBe(labels[generation]);
    expect(state.focus?.pathLength).toBe(generation + 1);
    expect(state.focus?.shownAt?.basis).toBe('birth');
    expectOver(state, person);
  }
  // The breadcrumb runs from the home person to the focused ancestor, the middle elided.
  await expect(page.getByTestId('breadcrumb-item').first()).toHaveText(ancestor(0).name);
  await expect(page.getByTestId('breadcrumb-item').last()).toHaveText(ancestor(7).name);
  await expect(page.getByTestId('breadcrumb-item')).toHaveCount(6);

  expect(await focus(page, '@NOBODY@')).toEqual({ ok: false, reason: 'unknown-person' });
});

test('arrow keys walk the tree and down retraces the line', async ({ page }) => {
  await openApp(page);
  await importAndChooseRoot(page);
  const key = async (name: string) => {
    await page.keyboard.press(name);
    return settledState(page);
  };

  for (const generation of [1, 2, 3]) {
    const state = await key('ArrowUp');
    expect(state.focusedPersonId).toBe(ancestor(generation).id);
    expectOver(state, ancestor(generation));
  }
  for (const generation of [2, 1, 0]) {
    expect((await key('ArrowDown')).focusedPersonId).toBe(ancestor(generation).id);
  }

  // The home person's mother has no place on her own events: she is shown where she married.
  const mother = await key('Shift+ArrowUp');
  expect(mother.focusedPersonId).toBe(small.quirks.noPlaces[0]);
  expect(mother.focus?.relationship.label).toBe('Mother');
  expect(mother.focus?.shownAt).toMatchObject({ basis: 'marriage', approximate: true });
  await expect(page.getByTestId('profile-place')).toHaveAttribute('data-basis', 'marriage');
  await expect(page.getByTestId('profile-place')).toContainText('Approximate');
  await expect(page.getByTestId('focus-pin')).toHaveAttribute('data-approximate', 'true');

  // Right moves along the row, and left comes back to where it started.
  const before = (await key('ArrowDown')).focusedPersonId;
  const right = await key('ArrowRight');
  if (right.focusedPersonId !== before) {
    expect((await key('ArrowLeft')).focusedPersonId).toBe(before);
  }

  // Typing in the search box does not walk the tree.
  await page.getByTestId('person-search').fill('x');
  const typed = await key('ArrowUp');
  expect(typed.focusedPersonId).toBe(before);
});

test('search, relative chips, the breadcrumb and the pedigree all focus a person', async ({
  page,
}) => {
  await openApp(page);
  await importAndChooseRoot(page);

  // Only the 1842 ancestor carries this nickname.
  await page.getByTestId('person-search').fill('Murchadh');
  await page.getByTestId('search-result').first().click();
  let state = await settledState(page);
  expect(state.focusedPersonId).toBe(ancestor(5).id);
  expectOver(state, ancestor(5));
  await expect(page.getByTestId('person-search')).toHaveValue('');

  await page.locator('[data-testid="relative-chip"][data-relation="parent"]').first().click();
  state = await settledState(page);
  expect(state.focusedPersonId).toBe(ancestor(6).id);

  await page.getByTestId('breadcrumb-item').first().click();
  state = await settledState(page);
  expect(state.focusedPersonId).toBe(ancestor(0).id);

  await page.locator(`[data-testid="pedigree-person"][data-person-id="${ancestor(1).id}"]`).click();
  state = await settledState(page);
  expect(state.focusedPersonId).toBe(ancestor(1).id);

  await page.getByTestId('focus-home').click();
  expect((await settledState(page)).focusedPersonId).toBe(ancestor(0).id);
});

/** Flies to where the app placed a place string and clicks it on the map. */
async function clickPlace(page: Page, placeText: string, zoom: number) {
  const at = await page.evaluate((text) => window.__treehouse?.place(text) ?? null, placeText);
  if (!at || at.status === 'unresolved') throw new Error(`${placeText}: not on the map`);
  const target = { lng: at.lng, lat: at.lat };
  await page.evaluate((t) => window.__treehouse?.flyTo(t), { ...target, zoom });
  const point = await page.evaluate((t) => window.__treehouse?.project(t) ?? null, target);
  if (!point) throw new Error(`${placeText}: not on screen`);
  await page.mouse.click(point.x, point.y);
}

test('clicking a marker lists the people there; a cluster zooms in', async ({ page }) => {
  await openApp(page);
  await importAndChooseRoot(page);
  const ness = ancestor(7);
  const nessPerson = page.locator(`[data-testid="place-person"][data-person-id="${ness.id}"]`);

  // Close in, the place stands on its own rather than in a cluster.
  await clickPlace(page, ness.birthPlace, 10);
  await expect(page.getByTestId('place-card')).toBeVisible();
  const state = await settledState(page);
  expect(state.placeCard.open).toBe(true);
  expect(state.placeCard.people).toBeGreaterThan(0);
  await expect(nessPerson).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

  await nessPerson.click();
  expect((await settledState(page)).focusedPersonId).toBe(ness.id);
  await page.getByTestId('close-place-card').click();
  expect((await settledState(page)).placeCard.open).toBe(false);

  // Zoomed out, the island's places are one cluster; clicking it zooms in.
  await clickPlace(page, ness.birthPlace, 4);
  const after = await settledState(page);
  expect(after.placeCard.open).toBe(false);
  expect(after.map.zoom).toBeGreaterThan(4);
});

test('the map can be shown flat and back as a globe', async ({ page }) => {
  await openApp(page);
  await importAndChooseRoot(page);
  await page.getByTestId('projection-toggle').click();
  expect((await settledState(page)).map.projection).toBe('mercator');
  await page.getByTestId('projection-toggle').click();
  expect((await settledState(page)).map.projection).toBe('globe');
});
