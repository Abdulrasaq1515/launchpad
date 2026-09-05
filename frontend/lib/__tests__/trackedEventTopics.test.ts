import fs from "fs";
import path from "path";
import {
  TRACKED_EVENT_TOPICS,
  TRACKED_VESTING_EVENT_TOPICS,
  resolveActivityType,
} from "@/lib/stellar";

/**
 * The activity feed silently ignored every vesting event for as long as it
 * existed, and the token list had drifted from the contract too (#408). Both
 * failures are invisible at runtime: an untracked topic is not an error, it
 * is just an event that never appears.
 *
 * These tests read the contract sources directly, so the frontend lists
 * cannot drift from what the contracts actually emit without a red test.
 * The contracts have the same guard on their side
 * (`test_emitted_topics_match_checked_in_fixture`), which is what makes the
 * `symbol_short!` literals a usable source of truth here.
 */

const CONTRACTS_DIR = path.resolve(__dirname, "../../../contracts");

/** Topic-0 names emitted by a contract's production code (excluding tests). */
function emittedTopics(contract: string): string[] {
  const source = fs.readFileSync(
    path.join(CONTRACTS_DIR, contract, "src/lib.rs"),
    "utf8",
  );
  const production = source.split("#[cfg(test)]")[0];
  const matches = production.matchAll(/symbol_short!\("([^"]*)"\)/g);
  return [...new Set([...matches].map((m) => m[1]))].sort();
}

describe("tracked event topics match the contracts", () => {
  it("covers every topic the token contract emits, and no others", () => {
    expect([...TRACKED_EVENT_TOPICS].sort()).toEqual(emittedTopics("token"));
  });

  it("covers every topic the vesting contract emits, and no others", () => {
    expect([...TRACKED_VESTING_EVENT_TOPICS].sort()).toEqual(
      emittedTopics("vesting"),
    );
  });

  it("has no duplicate entries", () => {
    expect(new Set(TRACKED_EVENT_TOPICS).size).toBe(
      TRACKED_EVENT_TOPICS.length,
    );
    expect(new Set(TRACKED_VESTING_EVENT_TOPICS).size).toBe(
      TRACKED_VESTING_EVENT_TOPICS.length,
    );
  });
});

describe("resolveActivityType", () => {
  /**
   * The reason decoding is keyed on (contractId, topic) rather than topic
   * alone. If this set ever empties, the disambiguation is dead code; if it
   * grows, the feed needs a label for the new pair.
   */
  const SHARED = ["init", "pause", "unpause", "prop_adm", "revoked", "upgrade"];

  it("identifies the topics both contracts emit", () => {
    const shared = TRACKED_VESTING_EVENT_TOPICS.filter((topic) =>
      (TRACKED_EVENT_TOPICS as readonly string[]).includes(topic),
    ).sort();
    expect(shared).toEqual([...SHARED].sort());
  });

  it("resolves a shared topic differently per emitting contract", () => {
    for (const topic of SHARED) {
      expect(resolveActivityType(topic, "token")).toBe(topic);
      expect(resolveActivityType(topic, "vesting")).toBe(`vesting:${topic}`);
    }
  });

  it("namespaces vesting-only topics", () => {
    expect(resolveActivityType("create", "vesting")).toBe("vesting:create");
    expect(resolveActivityType("release", "vesting")).toBe("vesting:release");
    expect(resolveActivityType("clf_ext", "vesting")).toBe("vesting:clf_ext");
  });

  it("labels a topic as other when the wrong contract emitted it", () => {
    // `create` is vesting-only; a token contract emitting it is not something
    // we can decode, so it must not masquerade as a vesting event.
    expect(resolveActivityType("create", "token")).toBe("other");
    // `transfer` is token-only.
    expect(resolveActivityType("transfer", "vesting")).toBe("other");
  });

  it("labels unknown topics as other", () => {
    expect(resolveActivityType("not_a_topic", "token")).toBe("other");
    expect(resolveActivityType("not_a_topic", "vesting")).toBe("other");
  });
});
