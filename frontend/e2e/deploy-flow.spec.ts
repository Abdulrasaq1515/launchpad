import { test, expect } from '@playwright/test';
import { createMockFreighterProvider, FreighterScenarios } from './mocks/mockFreighter';

const ADMIN = FreighterScenarios.connected.publicKey;

test.describe('Deploy flow', () => {
  test('walks the four steps and reviews the configuration', async ({ page }) => {
    await page.addInitScript(createMockFreighterProvider(FreighterScenarios.connected));
    await page.goto('/deploy');

    // Wait for the mock wallet so the admin step is usable.
    await expect(page.getByTitle(ADMIN)).toBeVisible();

    // ── Step 1: metadata ────────────────────────────────────────────────
    await expect(
      page.getByRole('heading', { name: /token metadata/i }),
    ).toBeVisible();
    await page.getByLabel(/token name/i).fill('E2E Token');
    await page.getByLabel(/^symbol$/i).fill('E2E');
    await page.getByRole('button', { name: /continue/i }).click();

    // ── Step 2: supply ──────────────────────────────────────────────────
    await expect(
      page.getByRole('heading', { name: /supply configuration/i }),
    ).toBeVisible();
    // NumericInput labels are not associated with their inputs, so target the
    // placeholder. Max supply is left empty (unlimited).
    await page.getByPlaceholder(/1000000/).fill('1000');
    await page.getByRole('button', { name: /continue/i }).click();

    // ── Step 3: administration ──────────────────────────────────────────
    await expect(
      page.getByRole('heading', { name: /administration/i }),
    ).toBeVisible();
    await page.getByRole('button', { name: /existing multisig/i }).click();
    await page.getByLabel(/admin address or dao contract/i).fill(ADMIN);
    await page.getByRole('button', { name: /continue/i }).click();

    // ── Step 4: review ──────────────────────────────────────────────────
    await expect(
      page.getByRole('heading', { name: /review & deploy/i }),
    ).toBeVisible();
    await expect(page.getByText('E2E Token')).toBeVisible();
    await expect(page.getByText('1,000')).toBeVisible();
    await expect(
      page.getByRole('button', { name: /deploy token/i }),
    ).toBeVisible();
  });

  test('blocks step one while required fields are empty', async ({ page }) => {
    await page.addInitScript(createMockFreighterProvider(FreighterScenarios.connected));
    await page.goto('/deploy');

    await page.getByRole('button', { name: /continue/i }).click();

    // Validation keeps us on the metadata step and surfaces the errors.
    await expect(
      page.getByRole('heading', { name: /token metadata/i }),
    ).toBeVisible();
    await expect(page.getByText(/token name is required/i)).toBeVisible();
    await expect(page.getByText(/symbol is required/i)).toBeVisible();
  });
});
