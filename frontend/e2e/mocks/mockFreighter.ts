/**
 * Mock Freighter provider for E2E testing.
 *
 * `@stellar/freighter-api` v6 no longer calls methods on `window.freighter`.
 * It posts a `FREIGHTER_EXTERNAL_MSG_REQUEST` message to the window and waits
 * for a `FREIGHTER_EXTERNAL_MSG_RESPONSE` carrying the same `messageId` (the
 * library reads it as `messagedId`). This module injects a listener that plays
 * that protocol back, so the app's `isConnected` / `isAllowed` / `getAddress`
 * flows behave as if the extension were installed — with no network involved.
 */

export interface MockFreighterOptions {
  /** The mock wallet public key to return */
  publicKey?: string;
  /** Whether the wallet is installed */
  isInstalled?: boolean;
  /** Whether the site is allowed to connect */
  isAllowed?: boolean;
  /** Simulated delay for responses (ms) */
  delay?: number;
  /** Whether to fail connection / signing requests */
  shouldFail?: boolean;
}

const DEFAULT_OPTIONS: Required<MockFreighterOptions> = {
  publicKey: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
  isInstalled: true,
  isAllowed: true,
  delay: 0,
  shouldFail: false,
};

/**
 * Build an init script that installs the mock Freighter messaging bridge.
 * Must be passed to `page.addInitScript()` before navigation.
 */
export function createMockFreighterProvider(options: MockFreighterOptions = {}): string {
  const config = { ...DEFAULT_OPTIONS, ...options };

  return `
    (function () {
      var CONFIG = ${JSON.stringify(config)};
      var REQUEST_SOURCE = 'FREIGHTER_EXTERNAL_MSG_REQUEST';
      var RESPONSE_SOURCE = 'FREIGHTER_EXTERNAL_MSG_RESPONSE';

      function respond(data, payload) {
        var send = function () {
          window.postMessage(
            Object.assign(
              { source: RESPONSE_SOURCE, messagedId: data.messageId },
              payload,
            ),
            window.location.origin,
          );
        };
        if (CONFIG.delay > 0) setTimeout(send, CONFIG.delay);
        else send();
      }

      window.addEventListener('message', function (event) {
        var data = event.data;
        if (!data || data.source !== REQUEST_SOURCE) return;

        switch (data.type) {
          case 'REQUEST_CONNECTION_STATUS':
            respond(data, { isConnected: CONFIG.isInstalled });
            break;
          case 'REQUEST_ALLOWED_STATUS':
            respond(data, { isAllowed: CONFIG.isAllowed });
            break;
          case 'SET_ALLOWED_STATUS':
            respond(data, { isAllowed: true });
            break;
          case 'REQUEST_ACCESS':
          case 'REQUEST_PUBLIC_KEY':
            if (CONFIG.shouldFail) {
              respond(data, { publicKey: '', apiError: { code: -1, message: 'User rejected' } });
            } else {
              respond(data, { publicKey: CONFIG.publicKey });
            }
            break;
          case 'REQUEST_NETWORK_DETAILS':
            respond(data, {
              networkDetails: {
                network: 'TESTNET',
                networkPassphrase: 'Test SDF Network ; September 2015',
                networkUrl: 'https://horizon-testnet.stellar.org',
                networkRpcUrl: 'https://soroban-testnet.stellar.org',
              },
            });
            break;
          case 'SUBMIT_TRANSACTION':
            respond(data, {
              signedTransaction: 'AAAAAgAAAABmockSignedTransactionXdrAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==',
              signerAddress: CONFIG.publicKey,
            });
            break;
          case 'SUBMIT_AUTH_ENTRY':
            respond(data, {
              signedAuthEntry: 'mockSignedAuthEntry',
              signerAddress: CONFIG.publicKey,
            });
            break;
          default:
            respond(data, {});
        }
      }, false);
    })();
  `;
}

/**
 * Common test scenarios with pre-configured options
 */
export const FreighterScenarios = {
  /** Happy path: wallet installed and authorised */
  connected: {
    publicKey: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
    isInstalled: true,
    isAllowed: true,
    shouldFail: false,
  },

  /** Wallet not installed */
  notInstalled: {
    isInstalled: false,
    isAllowed: false,
    shouldFail: false,
  },

  /** User rejected connection */
  userRejected: {
    isInstalled: true,
    isAllowed: false,
    shouldFail: true,
  },

  /** Different test wallet */
  testWallet2: {
    publicKey: 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBXHF',
    isInstalled: true,
    isAllowed: true,
    shouldFail: false,
  },
};
