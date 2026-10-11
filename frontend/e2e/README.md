# E2E Tests - Quick Reference

## Installation

```bash
npm run test:e2e:install
```

## Running Tests

```bash
# All tests (headless)
npm run test:e2e

# Interactive UI mode
npm run test:e2e:ui

# See browser running
npm run test:e2e:headed

# CI mode
npm run test:e2e:ci
```

## View Reports

```bash
npm run test:e2e:report
```

## File Structure

- `wallet.spec.ts` - Wallet connect/disconnect and network switching
- `deploy-flow.spec.ts` - Deploy form validation and the 4-step flow
- `navigation.spec.ts` - Primary navigation rail smoke tests
- `mocks/mockFreighter.ts` - Mock wallet provider (emulates the Freighter v6
  `postMessage` bridge)
- `playwright.config.ts` - Configuration

## Test Coverage

✅ Wallet connection (mocked Freighter)  
✅ Address badge / disconnect  
✅ Network switching (testnet ⇄ mainnet)  
✅ Deploy form validation (4 steps)  
✅ Review-step summary  
✅ Sidebar navigation

> These tests exercise the UI only — they never submit a real transaction. The
> mock wallet answers the Freighter messaging protocol; Soroban RPC calls made
> by the app are allowed to fail without failing the assertions.

## Need Help?

See full documentation: [docs/e2e-testing-guide.md](../docs/e2e-testing-guide.md)
