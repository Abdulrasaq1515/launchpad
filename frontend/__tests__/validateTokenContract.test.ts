/**
 * A contract that cannot be reached is not the same as a contract that is not
 * a token, and the public token page publishes that verdict into its Open
 * Graph metadata with a 60-second cache. Conflating the two meant one blip in
 * RPC connectivity told crawlers a perfectly good token was "not a SEP-41
 * token" — which is what these tests exist to prevent recurring.
 */
import * as StellarSdk from "@stellar/stellar-sdk";
import { validateTokenContract } from "../lib/stellar";
import { NETWORKS } from "../types/network";

const CONTRACT = "CA33XOS7YTKLFPFETDPRT4TNJUZMR67MMIE6BTU2LD667TZU6DNQDNTR";

const simulateTransaction = jest.fn();

jest.mock("@stellar/stellar-sdk", () => {
  const original = jest.requireActual("@stellar/stellar-sdk");
  return {
    ...original,
    rpc: {
      ...original.rpc,
      Server: jest.fn().mockImplementation(() => ({
        simulateTransaction: (...args: unknown[]) =>
          (global as unknown as { __sim: typeof simulateTransaction }).__sim(...args),
      })),
      Api: {
        isSimulationError: (s: unknown) => Boolean((s as { error?: string }).error),
        isSimulationSuccess: (s: unknown) => !(s as { error?: string }).error,
      },
    },
  };
});

beforeEach(() => {
  simulateTransaction.mockReset();
  (global as unknown as { __sim: typeof simulateTransaction }).__sim = simulateTransaction;
});

/** A simulation result carrying `retval`, keyed off the method being called. */
function ok(retval: StellarSdk.xdr.ScVal) {
  return { result: { retval } };
}

describe("validateTokenContract", () => {
  it("reports a working token as valid and reachable", async () => {
    const { xdr } = jest.requireActual("@stellar/stellar-sdk");
    simulateTransaction
      .mockResolvedValueOnce(ok(xdr.ScVal.scvString("SoroPad Demo")))
      .mockResolvedValueOnce(ok(xdr.ScVal.scvString("SPD")))
      .mockResolvedValueOnce(ok(xdr.ScVal.scvU32(7)))
      .mockResolvedValue(ok(xdr.ScVal.scvI128(new xdr.Int128Parts({ hi: xdr.Int64.fromString("0"), lo: xdr.Uint64.fromString("1000") }))));

    const result = await validateTokenContract(CONTRACT, NETWORKS.testnet);
    expect(result).toMatchObject({ isValid: true, reachable: true });
  });

  it("does not call a contract invalid when the network is unreachable", async () => {
    simulateTransaction.mockRejectedValue(
      Object.assign(new Error("connect ETIMEDOUT 1.2.3.4:443"), { code: "ETIMEDOUT" }),
    );

    const result = await validateTokenContract(CONTRACT, NETWORKS.testnet);
    expect(result.isValid).toBe(false);
    // The point: unreachable, so the caller must not publish a verdict.
    expect(result.reachable).toBe(false);
  });

  it("does call a contract invalid when the chain answers that it is not a token", async () => {
    simulateTransaction.mockResolvedValue({
      error: "HostError: Error(WasmVm, MissingValue) calling 'name'",
    });

    const result = await validateTokenContract(CONTRACT, NETWORKS.testnet);
    expect(result.isValid).toBe(false);
    expect(result.reachable).toBe(true);
  });
});
