import { test, expect } from '@playwright/test';
import {
  createMockFreighterProvider,
  FreighterScenarios,
} from './mocks/mockFreighter';

const ADDRESS = FreighterScenarios.connected.publicKey;

test.describe('Wallet', () => {
  test('connects and shows the address badge', async ({ page }) => {
    await page.addInitScript(
      createMockFreighterProvider(FreighterScenarios.connected),
    );

    await page.goto('/');

    // The overview loads.
    await expect(
      page.getByRole('heading', {
        name: /issue a token, and know exactly what you can still change/i,
      }),
    ).toBeVisible();

    // The mock wallet auto-connects on mount: the truncated address badge
    // exposes the full key through its title attribute.
    await expect(page.getByTitle(ADDRESS)).toBeVisible();
    await expect(
      page.getByRole('button', { name: /disconnect/i }),
    ).toBeVisible();

    // The disconnected CTA is gone.
    await expect(
      page.getByRole('button', { name: /^connect wallet$/i }),
    ).toHaveCount(0);
  });

  test('switches the active network', async ({ page }) => {
    await page.addInitScript(
      createMockFreighterProvider(FreighterScenarios.connected),
    );

    await page.goto('/');

    const networkButton = page.getByRole('button', { name: 'Network' });
    await expect(networkButton).toContainText(/testnet/i);

    // Switch to mainnet — the persistent warning banner appears.
    await networkButton.click();
    await page.getByRole('option', { name: /mainnet/i }).click();
    await expect(networkButton).toContainText(/mainnet/i);
    await expect(page.getByText(/you are currently on mainnet/i)).toBeVisible();

    // And back to testnet — the banner disappears.
    await networkButton.click();
    await page.getByRole('option', { name: /testnet/i }).click();
    await expect(networkButton).toContainText(/testnet/i);
    await expect(page.getByText(/you are currently on mainnet/i)).toHaveCount(0);
  });
});
