import { expect, test } from '@playwright/test';
import { fixture, importAndChooseRoot, importFile, openApp, settledState } from './helpers';

const small = fixture(30);
const home = small.paternalLine[0];
const father = small.paternalLine[1];

test('keyboard focus follows the side panel, and the skip link reaches it', async ({ page }) => {
  await openApp(page);
  // The skip link is the first stop in the tab order and lands on the panel's heading.
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('skip-link')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#library-title')).toBeFocused();

  await importFile(page, small.path);
  await expect(page.locator('#root-picker-title')).toBeFocused();
  await page.getByTestId('root-option').first().click();
  await expect(page.locator('#tree-title')).toBeFocused();

  await page.getByTestId('review-places').click();
  await expect(page.locator('#places-title')).toBeFocused();
  await page.getByTestId('back-to-tree').click();
  await expect(page.locator('#tree-title')).toBeFocused();

  await page.getByTestId('back-to-library').click();
  await expect(page.locator('#library-title')).toBeFocused();
});

test('a change of focused person is announced, with the relationship', async ({ page }) => {
  if (!home || !father) throw new Error('fixture line too short');
  await openApp(page);
  await importAndChooseRoot(page);
  const announcement = page.getByTestId('focus-announcement');
  await expect(announcement).toHaveAttribute('role', 'status');
  await expect(announcement).toHaveText(`Showing ${home.name}, home person.`);
  await page.evaluate((id) => window.__treehouse?.focus(id), father.id);
  await settledState(page);
  await expect(announcement).toHaveText(`Showing ${father.name}, father.`);
});
