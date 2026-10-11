/* eslint-disable @typescript-eslint/no-explicit-any */
import { renderHook, act } from "@testing-library/react";
import * as StellarSdk from "@stellar/stellar-sdk";
import * as tokenBindings from "@/lib/bindings/token/src/index";
import * as walletModule from "../useWallet";
import * as stellarLib from "@/lib/stellar";
import { useDeployToken } from "../useDeployToken";

type AnyModule = any;
const sdk = StellarSdk as AnyModule;
const tokenMock = tokenBindings as AnyModule;
const walletMock = walletModule as AnyModule;

// ── Mocks ───────────────────────────────────────────────────────────────────

jest.mock("@stellar/stellar-sdk", () => {
  const contractCalls: any[] = [];
  const mutable: any = {
    addressToString: "C-DEPLOYED-TOKEN-ADDRESS",
    simulateResult: null,
    sendResult: null,
    getTxResult: null,
    getTxError: null,
    getAccountError: null,
    latestLedgerError: null,
  };

  class MockAddress {
    value: string;
    constructor(value: string) {
      this.value = value;
    }
    toScVal() {
      return { __address: this.value };
    }
    static fromScVal() {
      return new MockAddress(mutable.addressToString);
    }
    toString() {
      return this.value;
    }
  }

  class MockContract {
    constructor(public id: string) {}
    call(...args: any[]) {
      contractCalls.push(args);
      return { __invoke: args };
    }
  }

  class MockRpcServer {
    getAccount = jest.fn(async (pk: string) => {
      if (mutable.getAccountError) throw mutable.getAccountError;
      return { id: pk, sequence: "1" };
    });
    getLatestLedger = jest.fn(async () => {
      if (mutable.latestLedgerError) throw mutable.latestLedgerError;
      return { sequence: 1 };
    });
    simulateTransaction = jest.fn(async () => mutable.simulateResult);
    sendTransaction = jest.fn(async () => mutable.sendResult);
    getTransaction = jest.fn(async () => {
      if (mutable.getTxError) throw mutable.getTxError;
      return typeof mutable.getTxResult === "function"
        ? mutable.getTxResult()
        : mutable.getTxResult;
    });
  }

  class MockTxBuilder {
    account: any;
    opts: any;
    op: any;
    constructor(account: any, opts: any) {
      this.account = account;
      this.opts = opts;
    }
    addOperation(op: any) {
      this.op = op;
      return this;
    }
    setTimeout() {
      return this;
    }
    build() {
      return { toXDR: () => "built-xdr" };
    }
    static fromXDR(xdr: string) {
      return { toXDR: () => xdr };
    }
  }

  return {
    __contractCalls: contractCalls,
    __mutable: mutable,
    Networks: { TESTNET: "Test SDF Network ; September 2015" },
    BASE_FEE: "100",
    rpc: {
      Server: MockRpcServer,
      assembleTransaction: () => ({
        build: () => ({ toXDR: () => "assembled-xdr" }),
      }),
      Api: {
        isSimulationError: (sim: any) => !!sim && sim.__error === true,
        isSimulationSuccess: (sim: any) => !!sim && sim.__success === true,
      },
    },
    Address: MockAddress,
    Contract: MockContract,
    Operation: { createCustomContract: jest.fn(() => ({ op: "create" })) },
    TransactionBuilder: MockTxBuilder,
    nativeToScVal: jest.fn((v: any) => v),
  };
});

jest.mock("@/lib/stellar", () => ({
  verifyFactory: jest.fn().mockResolvedValue({ ok: true, verified: true }),
}));

jest.mock("../useWallet", () => {
  const wallet: any = {
    connected: true,
    publicKey: "GDEPLOYER0000000000000000000000000000000000000000000000",
    signTransaction: jest.fn(async () => "signed-xdr"),
  };
  return {
    __wallet: wallet,
    useWallet: () => wallet,
  };
});

// The factory address is part of the network config (so testnet and mainnet
// factories coexist), not a bare env var — so the test drives it through the
// same mutable mock the hook actually reads.
const networkMock = {
  networkConfig: {
    rpcUrl: "https://soroban-testnet.stellar.org",
    passphrase: "Test SDF Network ; September 2015",
    network: "testnet",
    factoryAddress: undefined as string | undefined,
  },
};

jest.mock("../../providers/NetworkProvider", () => ({
  useNetwork: () => networkMock,
}));

jest.mock("@/lib/bindings/token/src/index", () => {
  const initialize = jest.fn();
  class MockTokenClient {
    constructor(public opts: any) {}
    initialize(args: any) {
      initialize(args);
      return Promise.resolve({ built: { toXDR: () => "init-built-xdr" } });
    }
  }
  return {
    __initialize: initialize,
    Client: MockTokenClient,
  };
});

// @/lib/utils is deliberately NOT mocked: toBaseUnits is the exact thing under
// test on the deploy path, and the float-based stub that used to stand in here
// reintroduced the rounding bug the real implementation exists to prevent.

const baseParams = {
  name: "Test Token",
  symbol: "TST",
  decimals: 7,
  initialSupply: "1000",
  adminAddress: "GDEPLOYER0000000000000000000000000000000000000000000000",
};

const FACTORY_ADDRESS = "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC";
const TOKEN_WASM_HASH = "aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899";

function resetMocks() {
  sdk.__contractCalls.length = 0;
  sdk.__mutable.addressToString = "C-DEPLOYED-TOKEN-ADDRESS";
  sdk.__mutable.simulateResult = { __success: true, result: { retval: {} } };
  sdk.__mutable.sendResult = { status: "PENDING", hash: "deadbeef" };
  sdk.__mutable.getTxResult = { status: "SUCCESS" };
  sdk.__mutable.getTxError = null;
  sdk.__mutable.getAccountError = null;
  sdk.__mutable.latestLedgerError = null;
  walletMock.__wallet.signTransaction.mockClear();
  tokenMock.__initialize.mockClear();
}

function render() {
  const { result } = renderHook(() => useDeployToken());
  return result;
}

describe("useDeployToken (factory path)", () => {
  beforeEach(() => {
    networkMock.networkConfig.factoryAddress = FACTORY_ADDRESS;
    walletMock.__wallet.connected = true;
    resetMocks();
  });

  afterEach(() => {
    networkMock.networkConfig.factoryAddress = undefined;
  });

  it("throws a wallet error when the wallet is not connected", async () => {
    walletMock.__wallet.connected = false;
    const result = render();

    await expect(
      act(() => result.current.deployToken(baseParams)),
    ).rejects.toMatchObject({ type: "wallet" });
  });

  it("throws a validation error when the factory address is not configured", async () => {
    networkMock.networkConfig.factoryAddress = undefined;
    const result = render();

    await expect(
      act(() => result.current.deployToken(baseParams)),
    ).rejects.toMatchObject({ type: "validation" });
  });

  it("refuses to deploy when the factory fails manifest verification", async () => {
    (stellarLib.verifyFactory as jest.Mock).mockResolvedValueOnce({
      ok: false,
      reason: "The factory's on-chain WASM hash does not match the audited build.",
      expected: "aa",
      actual: "bb",
    });
    const result = render();

    await expect(
      act(() => result.current.deployToken(baseParams)),
    ).rejects.toMatchObject({
      type: "validation",
      message: expect.stringContaining("Expected: aa. Found: bb."),
    });
    expect(sdk.__contractCalls.length).toBe(0);
  });

  it("calls deploy_token with a valid TokenConfig and returns the token address", async () => {
    const result = render();

    let deployment: any;
    await act(async () => {
      deployment = await result.current.deployToken({
        ...baseParams,
        initialSupply: "1000",
        maxSupply: "5000",
        authorizationRequired: true,
        authorizationRevocable: false,
        complianceNodeAddress:
          "GCOMPLIANCE0000000000000000000000000000000000000000000",
      });
    });

    expect(deployment).toEqual({
      contractId: "C-DEPLOYED-TOKEN-ADDRESS",
      transactionHash: "deadbeef",
    });

    expect(sdk.__contractCalls.length).toBe(1);
    const [method, deployer, salt, config] = sdk.__contractCalls[0];
    expect(method).toBe("deploy_token");
    expect(deployer.__address).toBe(walletMock.__wallet.publicKey);
    expect(salt.byteLength ?? salt.length).toBe(32);

    // TokenConfig fields (nativeToScVal is identity-mocked, so we see the raw object)
    expect(config.admin).toBe(baseParams.adminAddress);
    expect(config.decimal).toBe(7);
    expect(config.name).toBe("Test Token");
    expect(config.symbol).toBe("TST");
    expect(config.initial_supply).toBe(10_000_000_000n);
    expect(config.max_supply).toBe(50_000_000_000n);
    expect(config.authorization_required).toBe(true);
    expect(config.authorization_revocable).toBe(false);
    expect(config.compliance_node).toBe(
      "GCOMPLIANCE0000000000000000000000000000000000000000000",
    );
  });

  it("passes None for optional config fields when omitted", async () => {
    const result = render();

    await act(async () => {
      await result.current.deployToken(baseParams);
    });

    const [, , , config] = sdk.__contractCalls[0];
    expect(config.max_supply).toBeNull();
    expect(config.compliance_node).toBeNull();
    expect(config.authorization_required).toBe(false);
  });

  // ── Deploy salt (#483) ────────────────────────────────────────────────

  it("draws the deploy salt from crypto.getRandomValues", async () => {
    const getRandomValues = jest.spyOn(globalThis.crypto, "getRandomValues");
    const mathRandom = jest.spyOn(Math, "random");
    const result = render();

    try {
      await act(async () => {
        await result.current.deployToken(baseParams);
      });

      expect(getRandomValues).toHaveBeenCalledTimes(1);
      const filled = getRandomValues.mock.calls[0][0] as Uint8Array;
      expect(filled.length).toBe(32);
      const [, , salt] = sdk.__contractCalls[0];
      expect(Uint8Array.from(salt)).toEqual(filled);
      expect(mathRandom).not.toHaveBeenCalled();
    } finally {
      getRandomValues.mockRestore();
      mathRandom.mockRestore();
    }
  });

  it("refuses to deploy rather than fall back when Web Crypto is unavailable", async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, "crypto")!;
    const mathRandom = jest.spyOn(Math, "random");
    const result = render();

    Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true });
    try {
      await expect(
        act(() => result.current.deployToken(baseParams)),
      ).rejects.toMatchObject({
        type: "validation",
        message: expect.stringContaining("crypto.getRandomValues"),
      });
    } finally {
      Object.defineProperty(globalThis, "crypto", original);
      mathRandom.mockRestore();
    }

    expect(mathRandom).not.toHaveBeenCalled();
    expect(sdk.__contractCalls.length).toBe(0);
    expect(walletMock.__wallet.signTransaction).not.toHaveBeenCalled();
  });

  // ── Source account lookup (#485) ──────────────────────────────────────

  it("reports an account with no transactions yet as a validation error", async () => {
    sdk.__mutable.getAccountError = new Error(
      `Account not found: ${walletMock.__wallet.publicKey}`,
    );
    const result = render();

    await expect(
      act(() => result.current.deployToken(baseParams)),
    ).rejects.toMatchObject({
      type: "validation",
      message: expect.stringContaining(
        `Account ${walletMock.__wallet.publicKey} has no transactions on this network yet`,
      ),
    });
    expect(sdk.__contractCalls.length).toBe(0);
    expect(walletMock.__wallet.signTransaction).not.toHaveBeenCalled();
  });

  it("treats an HTTP 404 from the account lookup as a missing account", async () => {
    sdk.__mutable.getAccountError = Object.assign(new Error("Request failed"), {
      response: { status: 404 },
    });
    const result = render();

    await expect(
      act(() => result.current.deployToken(baseParams)),
    ).rejects.toMatchObject({
      type: "validation",
      message: expect.stringContaining("has no transactions on this network yet"),
    });
  });

  it("does not blame the account when the RPC itself is unreachable", async () => {
    // stellar-sdk reports transport failures as "Account not found" too.
    sdk.__mutable.getAccountError = new Error("Account not found: GDEPLOYER");
    sdk.__mutable.latestLedgerError = new Error("fetch failed");
    const result = render();

    await expect(
      act(() => result.current.deployToken(baseParams)),
    ).rejects.toMatchObject({
      type: "network",
      message: expect.stringContaining("Could not load account"),
    });
  });

  // ── Polling timeout (#484) ────────────────────────────────────────────

  describe("when polling runs out", () => {
    const POLL_BUDGET_MS = 180_000;

    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("keeps the simulated contract ID on a timeout for a transaction that has not settled", async () => {
      sdk.__mutable.getTxResult = { status: "NOT_FOUND" };
      const result = render();

      const deployment = result.current.deployToken(baseParams);
      const assertion = expect(deployment).rejects.toMatchObject({
        type: "timeout",
        contractId: "C-DEPLOYED-TOKEN-ADDRESS",
        transactionHash: "deadbeef",
        message: expect.stringContaining("has not settled after 180 seconds"),
      });
      await jest.advanceTimersByTimeAsync(POLL_BUDGET_MS);
      await assertion;
    });

    it("says the RPC is unreachable when the final polls fail in transport", async () => {
      sdk.__mutable.getTxError = new Error("fetch failed");
      const result = render();

      const deployment = result.current.deployToken(baseParams);
      const assertion = expect(deployment).rejects.toMatchObject({
        type: "timeout",
        contractId: "C-DEPLOYED-TOKEN-ADDRESS",
        transactionHash: "deadbeef",
        message: expect.stringContaining("Could not reach the Soroban RPC"),
      });
      await jest.advanceTimersByTimeAsync(POLL_BUDGET_MS);
      await assertion;
    });

    it("keeps polling past the old 60-second budget", async () => {
      let polls = 0;
      sdk.__mutable.getTxResult = () =>
        ++polls > 45 ? { status: "SUCCESS" } : { status: "NOT_FOUND" };
      const result = render();

      const deployment = result.current.deployToken(baseParams);
      await jest.advanceTimersByTimeAsync(100_000);

      await expect(deployment).resolves.toEqual({
        contractId: "C-DEPLOYED-TOKEN-ADDRESS",
        transactionHash: "deadbeef",
      });
    });
  });
});
