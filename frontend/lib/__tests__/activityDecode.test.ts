import * as StellarSdk from "@stellar/stellar-sdk";
import { decodeActivityEvent } from "@/lib/stellar";

/**
 * Exercises the decode path for vesting events, which the activity feed
 * ignored entirely before #408. The topic and data shapes here mirror
 * `docs/events.json`, the fixture the vesting contract's own drift test
 * asserts against.
 */

const RECIPIENT = "GAEQZ5WIT3VJQ35W2JCQXFFKGUKOCKSCUZGWGVXQLZCMNXKXWKFQ7TV6";
const ADMIN = "GBONK2FUFJBONR6E7H6UN7H26ZNQYUCCF6YQRATRYWK3FOJGDBD3MXKX";

const META = {
  id: "event-1",
  txHash: "abc123",
  ledger: 1000,
  timestamp: "2026-01-01T00:00:00Z",
};

const symbol = (name: string) =>
  StellarSdk.xdr.ScVal.scvSymbol(name).toXDR("base64");

const address = (strkey: string) =>
  new StellarSdk.Address(strkey).toScVal().toXDR("base64");

const i128 = (value: bigint) =>
  StellarSdk.nativeToScVal(value, { type: "i128" }).toXDR("base64");

const tuple = (...parts: StellarSdk.xdr.ScVal[]) =>
  StellarSdk.xdr.ScVal.scvVec(parts).toXDR("base64");

const scv = {
  i128: (v: bigint) => StellarSdk.nativeToScVal(v, { type: "i128" }),
  u32: (v: number) => StellarSdk.nativeToScVal(v, { type: "u32" }),
};

describe("decodeActivityEvent — vesting contract", () => {
  it("decodes a schedule creation with recipient and amount", () => {
    const record = decodeActivityEvent(
      [symbol("create"), address(RECIPIENT)],
      i128(1_000_0000000n),
      META,
      "vesting",
    );

    expect(record?.type).toBe("vesting:create");
    expect(record?.subject).toBe(RECIPIENT);
    expect(record?.amount).toBe("10000000000");
  });

  it("decodes a release with recipient and amount", () => {
    const record = decodeActivityEvent(
      [symbol("release"), address(RECIPIENT)],
      i128(250_0000000n),
      META,
      "vesting",
    );

    expect(record?.type).toBe("vesting:release");
    expect(record?.subject).toBe(RECIPIENT);
    expect(record?.amount).toBe("2500000000");
  });

  it("decodes a revoke, showing the releasable half of the tuple", () => {
    // data is (releasable, unvested); releasable is what the recipient keeps.
    const record = decodeActivityEvent(
      [symbol("revoke"), address(RECIPIENT)],
      tuple(scv.i128(100n), scv.i128(900n)),
      META,
      "vesting",
    );

    expect(record?.type).toBe("vesting:revoke");
    expect(record?.subject).toBe(RECIPIENT);
    expect(record?.amount).toBe("100");
  });

  it("decodes a cliff extension without mistaking ledgers for an amount", () => {
    // data is (old_cliff, new_cliff) — ledger numbers, not token amounts.
    const record = decodeActivityEvent(
      [symbol("clf_ext"), address(RECIPIENT)],
      tuple(scv.u32(100), scv.u32(200)),
      META,
      "vesting",
    );

    expect(record?.type).toBe("vesting:clf_ext");
    expect(record?.subject).toBe(RECIPIENT);
    expect(record?.amount).toBe("-");
  });

  it("decodes a batch, showing the total amount from the tuple", () => {
    // data is (created_count, total_amount).
    const record = decodeActivityEvent(
      [symbol("batch")],
      tuple(scv.u32(3), scv.i128(5_000n)),
      META,
      "vesting",
    );

    expect(record?.type).toBe("vesting:batch");
    expect(record?.amount).toBe("5000");
  });

  it("decodes a prune, whose recipient is in the data slot", () => {
    const record = decodeActivityEvent(
      [symbol("prune")],
      address(RECIPIENT),
      META,
      "vesting",
    );

    expect(record?.type).toBe("vesting:prune");
    expect(record?.subject).toBe(RECIPIENT);
  });

  it("decodes an admin proposal, whose new admin is in the data slot", () => {
    const record = decodeActivityEvent(
      [symbol("prop_adm")],
      address(ADMIN),
      META,
      "vesting",
    );

    expect(record?.type).toBe("vesting:prop_adm");
    expect(record?.to).toBe(ADMIN);
  });

  it("survives a malformed data slot rather than throwing", () => {
    const record = decodeActivityEvent(
      [symbol("revoke"), address(RECIPIENT)],
      symbol("not-a-tuple"),
      META,
      "vesting",
    );

    expect(record?.type).toBe("vesting:revoke");
    expect(record?.amount).toBe("-");
  });
});

describe("decodeActivityEvent — shared topic names", () => {
  /**
   * The complication worth designing around: both contracts emit these with
   * identical topic tuples, so topic-only filtering cannot tell them apart.
   */
  it.each(["init", "pause", "unpause", "upgrade", "revoked"])(
    "resolves %s by emitting contract, not by topic alone",
    (topic) => {
      const asToken = decodeActivityEvent([symbol(topic)], undefined, META, "token");
      const asVesting = decodeActivityEvent([symbol(topic)], undefined, META, "vesting");

      expect(asToken?.type).toBe(topic);
      expect(asVesting?.type).toBe(`vesting:${topic}`);
      expect(asToken?.type).not.toBe(asVesting?.type);
    },
  );

  it("defaults to the token contract when no source is given", () => {
    // Existing callers pass three arguments; they must keep working.
    const record = decodeActivityEvent([symbol("pause")], undefined, META);
    expect(record?.type).toBe("pause");
  });
});

describe("decodeActivityEvent — token contract still works", () => {
  it("decodes a transfer", () => {
    const record = decodeActivityEvent(
      [symbol("transfer"), address(ADMIN), address(RECIPIENT)],
      i128(42n),
      META,
      "token",
    );

    expect(record?.type).toBe("transfer");
    expect(record?.from).toBe(ADMIN);
    expect(record?.to).toBe(RECIPIENT);
    expect(record?.amount).toBe("42");
  });

  it("decodes revoke_authorization under its real topic name", () => {
    // The list tracked `rvk_auth`, but the contract emits `rev_auth`, so these
    // events were labelled "other" and lost their subject address.
    const record = decodeActivityEvent(
      [symbol("rev_auth"), address(RECIPIENT)],
      undefined,
      META,
      "token",
    );

    expect(record?.type).toBe("rev_auth");
    expect(record?.subject).toBe(RECIPIENT);
  });
});
