import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import type { TreehouseState } from '../src/harness/types';
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

const ancestor = (generation: number) => {
  const person = line[generation];
  if (!person) throw new Error(`no ancestor ${generation}`);
  return person;
};

function expectOver(state: TreehouseState, person: { lng: number; lat: number }, km = 15) {
  expect(state.map.moving).toBe(false);
  expect(distanceKm(state.map.center, person)).toBeLessThan(km);
}

const focus = (page: Page, id: string) =>
  page.evaluate((personId) => window.__treehouse?.focus(personId), id);

/** Distinct birthplaces along the line from the home person to `generation`, as arcs. */
function lineArcs(generation: number): number {
  let arcs = 0;
  for (let g = 1; g <= generation; g++) {
    if (distanceKm(ancestor(g - 1), ancestor(g)) > 1) arcs += 1;
  }
  return arcs;
}

test('threads: lineage follows the focus, and each kind can be switched on and off', async ({
  page,
}) => {
  await openApp(page);
  let state = await importAndChooseRoot(page);
  expect(state.threadToggles).toEqual({
    lineage: true,
    family: false,
    ancestors: false,
    migration: false,
  });
  // The home person alone: no line to draw.
  expect(state.threads).toEqual({ lineage: 0, family: 0, ancestors: 0, migration: 0 });

  // Vancouver → Ontario → Quebec → Quebec → Lewis → Lewis: one arc per change of place.
  await focus(page, ancestor(7).id);
  state = await settledState(page);
  expect(state.threads.lineage).toBe(lineArcs(7));
  expect(state.threads.lineage).toBeGreaterThanOrEqual(4);

  for (const kind of ['family', 'ancestors', 'migration'] as const) {
    await page.getByTestId(`thread-${kind}`).check();
  }
  await focus(page, ancestor(3).id);
  state = await settledState(page);
  expect(state.threadToggles).toEqual({
    lineage: true,
    family: true,
    ancestors: true,
    migration: true,
  });
  expect(state.threads.lineage).toBe(lineArcs(3));
  // Their son (born in Ontario) is somewhere else.
  expect(state.threads.family).toBeGreaterThan(0);
  // At least every change of place along the paternal line.
  expect(state.threads.ancestors).toBeGreaterThanOrEqual(lineArcs(7));
  await page.screenshot({ path: 'reports/e2e/screenshots/threads.png' });

  await page.getByTestId('thread-lineage').uncheck();
  await page.getByTestId('thread-ancestors').uncheck();
  state = await settledState(page);
  expect(state.threads.lineage).toBe(0);
  expect(state.threads.ancestors).toBe(0);
  expect(state.threads.family).toBeGreaterThan(0);
});

test('migration draws a person’s own moves', async ({ page }) => {
  await openApp(page);
  await importAndChooseRoot(page);
  await page.getByTestId('thread-migration').check();
  // Somebody on the line lived in more than one place.
  let moves = 0;
  for (const person of line) {
    await focus(page, person.id);
    moves = Math.max(moves, (await settledState(page)).threads.migration);
  }
  expect(moves).toBeGreaterThan(0);
});

test('the paternal journey plays from Vancouver to Lewis, honouring reduced motion', async ({
  page,
}) => {
  // Reduced motion turns flights into jump cuts, without ?motion=off.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const opened = await openApp(page, './?harness=1');
  expect(opened.flags.motion).toBe(false);
  await importAndChooseRoot(page);

  await page.getByTestId('journey-paternal').click();
  const start = await settledState(page);
  expect(start.journey).toMatchObject({
    line: 'paternal',
    stops: line.length,
    personId: ancestor(0).id,
    playing: true,
  });
  expectOver(start, ancestor(0));
  await expect(page.getByTestId('journey-bar')).toBeVisible();

  // Record every stop the journey shows on its way.
  await page.evaluate(() => {
    const seen: number[] = [];
    (window as unknown as { seenStops: number[] }).seenStops = seen;
    const timer = setInterval(() => {
      const journey = window.__treehouse?.state().journey;
      if (!journey) return;
      if (seen.at(-1) !== journey.index) seen.push(journey.index);
      if (!journey.playing) clearInterval(timer);
    }, 40);
  });
  await page.getByTestId('journey-speed').selectOption('4');
  await page.waitForFunction(
    () => {
      const journey = window.__treehouse?.state().journey;
      return journey !== null && journey !== undefined && !journey.playing;
    },
    undefined,
    { timeout: 20_000 },
  );

  const end = await settledState(page);
  expect(end.journey).toMatchObject({ index: line.length - 1, playing: false, speed: 4 });
  expect(end.focusedPersonId).toBe(ancestor(7).id);
  expectOver(end, ancestor(7));
  const seen = await page.evaluate(() => (window as unknown as { seenStops: number[] }).seenStops);
  expect(seen).toEqual(line.map((_, i) => i));
  await expect(page.getByTestId('journey-play')).toHaveText('Play again');
  await expect(page.getByTestId('journey-position')).toContainText(ancestor(7).name);
});

test('the scrubber, a hand-picked person and the end button control a journey', async ({
  page,
}) => {
  await openApp(page);
  await importAndChooseRoot(page);
  await page.getByTestId('journey-paternal').click();
  await page.getByTestId('journey-play').click();
  expect((await settledState(page)).journey?.playing).toBe(false);

  // Dragging the scrubber to a generation shows that ancestor.
  for (const generation of [5, 2]) {
    await page.getByTestId('journey-scrubber').fill(String(generation));
    const state = await settledState(page);
    expect(state.journey).toMatchObject({ index: generation, playing: false });
    expect(state.focusedPersonId).toBe(ancestor(generation).id);
    expectOver(state, ancestor(generation));
  }

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

  // Playing again and then picking someone on the line pauses there.
  await page.getByTestId('journey-play').click();
  await focus(page, ancestor(6).id);
  let state = await settledState(page);
  expect(state.journey).toMatchObject({ index: 6, playing: false });

  // Someone off the line pauses and leaves the scrubber where it was.
  await focus(page, small.quirks.noPlaces[0] ?? '');
  state = await settledState(page);
  expect(state.journey).toMatchObject({ index: 6, playing: false });

  await page.getByTestId('journey-close').click();
  state = await settledState(page);
  expect(state.journey).toBeNull();
  await expect(page.getByTestId('journey-bar')).toHaveCount(0);
});

test('a journey can follow the mother’s line or lead to any ancestor', async ({ page }) => {
  await openApp(page);
  await importAndChooseRoot(page);

  // The home person is not their own ancestor.
  await expect(page.getByTestId('journey-ancestor')).toBeDisabled();
  await page.getByTestId('journey-maternal').click();
  let state = await settledState(page);
  expect(state.journey?.line).toBe('maternal');
  expect(state.journey?.stops).toBeGreaterThanOrEqual(2);
  await page.getByTestId('journey-close').click();

  await focus(page, ancestor(5).id);
  await page.getByTestId('journey-ancestor').click();
  state = await settledState(page);
  expect(state.journey).toMatchObject({ line: 'ancestor', stops: 6, index: 0 });
  expect(state.focusedPersonId).toBe(ancestor(0).id);
});
