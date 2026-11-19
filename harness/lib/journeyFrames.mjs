// Frame times while a journey plays: the smoothness budget of check:perf.
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { WEBGL_ARGS } from './browser.mjs';
import { percentile } from './stats.mjs';

const FIXTURE = fileURLToPath(
  new URL('../../fixtures/synthetic/treehouse-30.ged', import.meta.url),
);

/**
 * Opens the built app with motion on, imports the 30-person synthetic fixture, plays the
 * paternal journey at 4x and records the time between animation frames until it ends.
 * Returns the frame count and their p95 and median, in milliseconds.
 */
export async function measureJourneyFrames(baseUrl) {
  const browser = await chromium.launch({ args: WEBGL_ARGS });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(`${baseUrl}?harness=1`);
    await page.waitForFunction(() => window.__treehouse !== undefined);
    await page.evaluate(() => window.__treehouse.whenIdle());
    await page.getByTestId('file-input').setInputFiles(FIXTURE);
    await page.getByTestId('root-option').first().click();
    await page.getByTestId('tree-panel').waitFor();
    await page.evaluate(() => window.__treehouse.whenIdle());

    await page.getByTestId('journey-paternal').click();
    await page.getByTestId('journey-speed').selectOption('4');
    const frames = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const gaps = [];
          let last = performance.now();
          const started = last;
          const tick = (now) => {
            gaps.push(now - last);
            last = now;
            const journey = window.__treehouse.state().journey;
            const ended = !journey || (!journey.playing && journey.index === journey.stops - 1);
            if (ended || now - started > 60_000) resolve(gaps);
            else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }),
    );
    const round = (value) => Math.round(value * 10) / 10;
    return {
      frames: frames.length,
      p95: round(percentile(frames, 0.95)),
      median: round(percentile(frames, 0.5)),
    };
  } finally {
    await browser.close();
  }
}
