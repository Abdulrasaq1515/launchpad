/**
 * Encoding tests for the factory's TokenConfig argument, against the real SDK.
 *
 * useDeployToken.test.ts identity-mocks nativeToScVal, so it sees the raw JS
 * object and cannot observe how anything is encoded. That is how a config whose
 * keys were half ScVal::String and half ScVal::Symbol reached production: the
 * deploy simulation failed for every user with
 *
 *   HostError: Error(Object, InvalidInput)
 *   "ScMap was not sorted by key for conversion to host object"
 *
 * because a #[contracttype] struct is an ScMap keyed by Symbol, and ScVal sorts
 * by type tag before value — so mixing the two key types is never sorted.
 *
 * These tests deliberately do NOT mock @stellar/stellar-sdk.
 */
import * as StellarSdk from "@stellar/stellar-sdk";
import { buildTokenConfigScVals } from "../useDeployToken";

const DEPLOYER = "GBDR5KS5MAEHIOIYZYRQ25CSWGV2K44UPDR26O3BB2JY4VA72D76NXDA";

/** Field names and order of `TokenConfig` in contracts/factory/src/lib.rs. */
const FIELDS = [
  "admin",
  "authorization_required",
  "authorization_revocable",
  "compliance_node",
  "contract_uri",
  "decimal",
  "fee_bps",
  "fee_recipient",
  "initial_supply",
  "max_supply",
  "metadata",
  "name",
  "symbol",
];

const baseParams = {
  name: "Test Token",
  symbol: "TST",
  decimals: 7,
  initialSupply: "1000000",
  adminAddress: DEPLOYER,
};

function entries(scv: StellarSdk.xdr.ScVal) {
  return scv.map()!.map((e) => ({
    keyType: e.key().switch().name,
    // XDR discriminant of the key's ScVal type — what the host sorts on first.
    keyTag: e.key().switch().value,
    key: StellarSdk.scValToNative(e.key()) as string,
    valueType: e.val().switch().name,
    value: e.val(),
  }));
}

describe("TokenConfig encoding", () => {
  it("encodes every key as a symbol, never a string", () => {
    const encoded = entries(buildTokenConfigScVals(baseParams, DEPLOYER));
    const stringKeys = encoded.filter((e) => e.keyType !== "scvSymbol");
    expect(stringKeys.map((e) => e.key)).toEqual([]);
  });

  it("emits keys in the sorted order the host requires", () => {
    const encoded = entries(buildTokenConfigScVals(baseParams, DEPLOYER));

    // The host orders ScVal by type tag first and only then by value, so
    // comparing decoded names alone would pass even on a map whose keys were a
    // mix of String and Symbol — exactly the case that failed in production.
    const order = encoded.map((e) => [e.keyTag, e.key] as [number, string]);
    const sorted = [...order].sort(
      (a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0),
    );
    expect(order).toEqual(sorted);
    expect(encoded.map((e) => e.key)).toEqual(FIELDS);
  });

  it("covers every field of the contract's TokenConfig struct", () => {
    const keys = entries(buildTokenConfigScVals(baseParams, DEPLOYER)).map((e) => e.key);
    // A missing field fails conversion just as surely as an unsorted one.
    expect(new Set(keys)).toEqual(new Set(FIELDS));
  });

  it("gives each field the type the contract declares", () => {
    const byKey = Object.fromEntries(
      entries(
        buildTokenConfigScVals(
          { ...baseParams, maxSupply: "2000000", complianceNodeAddress: DEPLOYER },
          DEPLOYER,
        ),
      ).map((e) => [e.key, e.valueType]),
    );
    expect(byKey).toMatchObject({
      admin: "scvAddress",
      authorization_required: "scvBool",
      authorization_revocable: "scvBool",
      compliance_node: "scvAddress",
      decimal: "scvU32",
      initial_supply: "scvI128",
      max_supply: "scvI128",
      name: "scvString",
      symbol: "scvString",
    });
  });

  it("encodes omitted optional fields as Soroban None", () => {
    const byKey = Object.fromEntries(
      entries(buildTokenConfigScVals(baseParams, DEPLOYER)).map((e) => [e.key, e.valueType]),
    );
    expect(byKey.max_supply).toBe("scvVoid");
    expect(byKey.compliance_node).toBe("scvVoid");
  });

  it("scales supplies by decimals without floating point", () => {
    const byKey = Object.fromEntries(
      entries(
        buildTokenConfigScVals({ ...baseParams, initialSupply: "2500000.5" }, DEPLOYER),
      ).map((e) => [e.key, e.value]),
    );
    expect(String(StellarSdk.scValToNative(byKey.initial_supply))).toBe("25000005000000");
  });

  it("serialises to XDR — the failure mode was only visible at conversion time", () => {
    expect(() =>
      buildTokenConfigScVals(baseParams, DEPLOYER).toXDR("base64"),
    ).not.toThrow();
  });
});
