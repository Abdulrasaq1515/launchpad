import { test, expect } from '@playwright/test';
import { createMockFreighterProvider, FreighterScenarios } from './mocks/mockFreighter';

/**
 * Smoke test for the primary navigation rail. Each entry resolves to a route
 * and a stable heading, so a broken link or an unrendered page fails fast.
 */
const SECTIONS = [
  { link: 'Deploy', url: /\/deploy$/, heading: /launch a token/i },
  { link: 'Dashboard', url: /\/dashboard$/, heading: /^tokens$/i },
  { link: 'Vesting', url: /\/claim$/, heading: /claim vesting/i },
  { link: 'Airdrop', url: /\/airdrop$/, heading: /airdrop builder/i },
  { link: 'Allowances', url: /\/allowances$/, heading: /^allowances$/i },
  { link: 'My Account', url: /\/my-account$/, heading: /my account/i },
] as const;

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(createMockFreighterProvider(FreighterScenarios.connected));
  });

  for (const section of SECTIONS) {
    test(`sidebar opens ${section.link}`, async ({ page }) => {
      await page.goto('/');

      await page.getByRole('link', { name: section.link, exact: true }).click();

      // Next's dev server compiles routes on first hit, so allow headroom.
      await expect(page).toHaveURL(section.url, { timeout: 15000 });
      await expect(
        page.getByRole('heading', { name: section.heading }),
      ).toBeVisible({ timeout: 15000 });
    });
  }
});
