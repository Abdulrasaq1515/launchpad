import { toBaseUnits, fromBaseUnits } from "../utils";
import * as StellarSdk from "@stellar/stellar-sdk";

describe("toBaseUnits", () => {
  it("scales 1,000,000 supply with 7 decimals to 10_000_000_000_000n", () => {
    const display = 1000000;
    const decimals = 7;
    const expected = 10000000000000n;
    expect(toBaseUnits(display, decimals)).toBe(expected);
  });
  
  it("handles string inputs correctly", () => {
    expect(toBaseUnits("1000000", 7)).toBe(10000000000000n);
  });

  it("handles decimal inputs correctly", () => {
    expect(toBaseUnits(0.1, 7)).toBe(1000000n);
  });

  it("asserts the ScVal built for a 1,000,000 / 7-decimal token equals 10_000_000_000_000n in ScVal", () => {
    const scVal = StellarSdk.nativeToScVal(toBaseUnits(1000000, 7), { type: "i128" });
    const expectedScVal = StellarSdk.nativeToScVal(10000000000000n, { type: "i128" });
    expect(scVal.toXDR("base64")).toEqual(expectedScVal.toXDR("base64"));
  });

  it("correctly scales a 6-decimal token (not 7)", () => {
    // 1 token with 6 decimals = 1_000_000, NOT 10_000_000
    expect(toBaseUnits(1, 6)).toBe(1_000_000n);
  });

  it("correctly scales an 18-decimal token (not 7)", () => {
    expect(toBaseUnits(1, 18)).toBe(1_000_000_000_000_000_000n);
  });

  // ── Regression: #395 ────────────────────────────────────────────────
  //
  // The previous implementation did `BigInt(Math.round(Number(display) * 10 **
  // decimals))`, which is exact only while `supply * 5 ** decimals < 2 ** 53`.
  // Every case above sits comfortably under that ceiling and passes either
  // way, which is why the bug survived review. These two do not.

  it("scales 1,000,000 at 18 decimals exactly (was 16,777,216 short)", () => {
    expect(toBaseUnits("1000000", 18)).toBe(1_000_000_000_000_000_000_000_000n);
    // Pin the old float result so this cannot silently regress.
    expect(toBaseUnits("1000000", 18)).not.toBe(999999999999999983222784n);
  });

  it("scales 123,456,789,012,345 at 7 decimals exactly (was 41,600 short)", () => {
    expect(toBaseUnits("123456789012345", 7)).toBe(1_234_567_890_123_450_000_000n);
    expect(toBaseUnits("123456789012345", 7)).not.toBe(1234567890123449958400n);
  });

  it("stays exact well past Number.MAX_SAFE_INTEGER", () => {
    // 38 nines is the largest supply the deploy schema admits.
    const supply = "9".repeat(38);
    expect(toBaseUnits(supply, 0)).toBe(BigInt(supply));
    expect(toBaseUnits(supply, 7)).toBe(BigInt(supply + "0000000"));
  });

  it("is exact for every decimals value the contract permits", () => {
    for (let decimals = 0; decimals <= 18; decimals++) {
      expect(toBaseUnits("1000000", decimals)).toBe(
        1_000_000n * 10n ** BigInt(decimals),
      );
    }
  });

  it("preserves fractional digits exactly at high precision", () => {
    expect(toBaseUnits("1.234567890123456789", 18)).toBe(
      1_234_567_890_123_456_789n,
    );
  });

  // ── Input handling ──────────────────────────────────────────────────

  it("right-pads a short fraction to the token's decimals", () => {
    expect(toBaseUnits("1.5", 7)).toBe(15_000_000n);
    expect(toBaseUnits("0.0000001", 7)).toBe(1n);
    expect(toBaseUnits(".5", 1)).toBe(5n);
    expect(toBaseUnits("2.", 2)).toBe(200n);
  });

  it("rejects more fraction digits than the token supports", () => {
    // Silently rounding here would send an amount the user did not ask for.
    expect(() => toBaseUnits("1.12345678", 7)).toThrow(RangeError);
    expect(() => toBaseUnits("1.12345678", 7)).toThrow(/8 decimal places/);
    expect(() => toBaseUnits("0.1", 0)).toThrow(RangeError);
  });

  it("returns 0n for an absent or unparseable amount", () => {
    // Preview and preflight paths call this against half-filled forms.
    expect(toBaseUnits("", 7)).toBe(0n);
    expect(toBaseUnits("   ", 7)).toBe(0n);
    expect(toBaseUnits("abc", 7)).toBe(0n);
    expect(toBaseUnits("1,000", 7)).toBe(0n);
    expect(toBaseUnits(NaN, 7)).toBe(0n);
    expect(toBaseUnits(Infinity, 7)).toBe(0n);
  });

  it("handles numbers written in exponent notation", () => {
    // String(1e21) is "1e+21", which no amount of string surgery survives
    // unless it is expanded first.
    expect(toBaseUnits(1e21, 0)).toBe(10n ** 21n);
    expect(toBaseUnits(1e-7, 7)).toBe(1n);
    expect(toBaseUnits(1.5e3, 2)).toBe(150_000n);
  });

  it("preserves sign", () => {
    expect(toBaseUnits("-1.5", 7)).toBe(-15_000_000n);
    expect(toBaseUnits("+1.5", 7)).toBe(15_000_000n);
  });

  it("rejects a nonsensical decimals argument", () => {
    expect(() => toBaseUnits("1", -1)).toThrow(RangeError);
    expect(() => toBaseUnits("1", 1.5)).toThrow(RangeError);
  });

  it("round-trips exactly through fromBaseUnits at 18 decimals", () => {
    const amount = "1000000";
    expect(fromBaseUnits(toBaseUnits(amount, 18), 18)).toBe(amount);
  });
});

describe("fromBaseUnits", () => {
  it("is the exact inverse of toBaseUnits for whole numbers", () => {
    expect(fromBaseUnits(toBaseUnits(100, 7), 7)).toBe("100");
  });

  it("is the exact inverse of toBaseUnits for fractional amounts", () => {
    expect(fromBaseUnits(toBaseUnits("1.5", 7), 7)).toBe("1.5");
  });

  it("handles 6-decimal tokens correctly", () => {
    // 1_000_000 raw units with 6 decimals = "1"
    expect(fromBaseUnits(1_000_000n, 6)).toBe("1");
  });

  it("handles 18-decimal tokens correctly", () => {
    expect(fromBaseUnits(1_000_000_000_000_000_000n, 18)).toBe("1");
  });

  it("handles 0 decimals", () => {
    expect(fromBaseUnits(42n, 0)).toBe("42");
  });

  it("trims trailing fractional zeros", () => {
    // 1_500_000 with 7 decimals = 0.15, not 0.1500000
    expect(fromBaseUnits(1_500_000n, 7)).toBe("0.15");
  });

  it("round-trips do not lose precision vs hand-rolled float division", () => {
    // This is the bug fromBaseUnits prevents: Number(amount) / 10 ** decimals
    // loses precision for large amounts on 18-decimal tokens.
    const raw = 1_234_567_890_123_456_789n;
    const result = fromBaseUnits(raw, 18);
    // Must not be the imprecise float result
    expect(result).not.toBe((Number(raw) / 1e18).toString());
    expect(result).toBe("1.234567890123456789");
  });
});
