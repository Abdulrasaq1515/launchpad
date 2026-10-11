import {
  ADMIN_ACTIONS,
  type AdminActionKey,
  type AdminActionContext,
} from "../adminActions";
import { toBaseUnits } from "@/lib/utils";
import { LEDGERS_PER_DAY } from "@/lib/soroban";

/**
 * `AdminPanel` had no test at all, because nothing inside a 2,351-line
 * component with two parallel if/else chains was independently reachable.
 * With the capabilities declared as data, the mapping from form input to
 * contract call is now directly assertable.
 *
 * Each action resolves by calling a method on a typed binding client, so the
 * clients are stubbed with recorders: the call a resolver makes is captured as
 * `{ contractId, method, args }` and asserted against. Arguments are the
 * bindings' named objects rather than positional ScVals, so the assertions
 * check field names — which is what actually has to stay in step with the
 * contract.
 */

const TOKEN = "CBTSFDGN5MU5NRKWSIBCMAMUGCHOC52H7KLZ44OKSGLC26BUKBZCCERJ";
const VESTING = "CD6RZ6E2HJHMSRRHEPCE2FWZWWVC543P67QSOPYKRAC7FIX52MZ6LMOF";
const ALICE = "GAEQZ5WIT3VJQ35W2JCQXFFKGUKOCKSCUZGWGVXQLZCMNXKXWKFQ7TV6";
const ADMIN = "GBONK2FUFJBONR6E7H6UN7H26ZNQYUCCF6YQRATRYWK3FOJGDBD3MXKX";

/** `create_schedule` / `extend_cliff` resolve ledgers relative to "now". */
const CURRENT_LEDGER = 1_000_000;

/** What a stubbed client records when a resolver invokes it. */
interface RecordedCall {
  contractId: string;
  method: string;
  args: Record<string, unknown>;
}

/**
 * A stand-in for a generated binding client. Every property access returns a
 * function that records the call and hands back a value shaped enough like an
 * `AssembledTransaction` for the resolver's return type.
 */
function recordingClient(contractId: string) {
  return new Proxy(
    {},
    {
      get:
        (_target, method: string) =>
        (args: Record<string, unknown> = {}) => ({
          contractId,
          method,
          args,
          built: null,
        }),
    },
  );
}

function makeContext(): AdminActionContext {
  return {
    contractId: TOKEN,
    decimals: 7,
    publicKey: ADMIN,
    server: {
      getLatestLedger: async () => ({ sequence: CURRENT_LEDGER }),
    } as unknown as AdminActionContext["server"],
    simulator: {} as AdminActionContext["simulator"],
    tokenClient: recordingClient(TOKEN) as AdminActionContext["tokenClient"],
    getVestingClient: (id: string) =>
      recordingClient(id) as ReturnType<AdminActionContext["getVestingClient"]>,
  };
}

/** Run an action's resolver and read back what it asked the client to do. */
async function resolveCall(
  key: AdminActionKey,
  data: unknown,
  ctx: AdminActionContext = makeContext(),
): Promise<RecordedCall> {
  const def = ADMIN_ACTIONS[key] as { resolve: (d: unknown, c: AdminActionContext) => unknown };
  return (await def.resolve(data, ctx)) as unknown as RecordedCall;
}

describe("toBaseUnits (scaling primitive)", () => {
  it("scales a decimal string into base units", () => {
    expect(toBaseUnits("1.5", 7)).toBe(15_000_000n);
    expect(toBaseUnits("100", 0)).toBe(100n);
  });
});

describe("ADMIN_ACTIONS registry", () => {
  it("declares every action with a label and a resolver", () => {
    for (const [key, def] of Object.entries(ADMIN_ACTIONS)) {
      expect(typeof def.label).toBe("string");
      expect(def.label.length).toBeGreaterThan(0);
      expect(typeof def.resolve).toBe("function");
      // Guards against a typo'd key silently shadowing another action.
      expect(key).toBe(key.trim());
    }
  });

  it("covers every capability the panel exposes", () => {
    const expected: AdminActionKey[] = [
      "mint",
      "batch-mint",
      "clawback",
      "burn-admin",
      "transfer",
      "cancel-admin",
      "accept-admin",
      "revoke",
      "vesting",
      "extend-cliff",
      "vesting-revoke",
      "vesting-upgrade",
      "set-whale-cap",
      "disable-whale-cap",
      "set-compliance-node",
      "clear-compliance-node",
      "metadata-uri",
      "pause",
      "unpause",
      "freeze",
      "unfreeze",
      "authorize",
      "revoke-auth",
      "upgrade",
    ];
    expect(Object.keys(ADMIN_ACTIONS).sort()).toEqual(expected.sort());
  });
});

describe("action resolution", () => {
  it("scales mint amounts by the token's decimals", async () => {
    const call = await resolveCall("mint", { to: ALICE, amount: "2.5" });
    expect(call.method).toBe("mint");
    expect(call.args.to).toBe(ALICE);
    expect(call.args.amount).toBe(25_000_000n);
  });

  it("routes burn and clawback to distinct contract methods", async () => {
    const data = { from: ALICE, amount: "1" };
    expect((await resolveCall("clawback", data)).method).toBe("clawback");
    expect((await resolveCall("burn-admin", data)).method).toBe("burn_admin");
  });

  it("routes cancellation through the dedicated on-chain cancel method", async () => {
    const call = await resolveCall("cancel-admin", {});
    expect(call.method).toBe("cancel_admin_proposal");
    expect(call.contractId).toBe(TOKEN);
  });

  it("targets the vesting contract, not the token, for schedule actions", async () => {
    const call = await resolveCall("vesting", {
      vestingContract: VESTING,
      recipient: ALICE,
      amount: "10",
      cliffDays: "30",
      durationDays: "365",
    });
    expect(call.contractId).toBe(VESTING);
    expect(call.method).toBe("create_schedule");

    const cliffLedger = CURRENT_LEDGER + 30 * LEDGERS_PER_DAY;
    expect(call.args.cliff_ledger).toBe(cliffLedger);
    expect(call.args.end_ledger).toBe(cliffLedger + 365 * LEDGERS_PER_DAY);
  });

  it("encodes an omitted schedule index as Soroban None", async () => {
    const base = { vestingContract: VESTING, recipient: ALICE, newCliffDays: "" };

    const none = await resolveCall("vesting-revoke", { ...base, scheduleIndex: "" });
    expect(none.args.index).toBeUndefined();

    const some = await resolveCall("vesting-revoke", { ...base, scheduleIndex: "2" });
    expect(some.args.index).toBe(2);
  });

  it("clears optional policy values by passing undefined", async () => {
    const whale = await resolveCall("disable-whale-cap", {});
    expect(whale.method).toBe("set_max_balance_per_account");
    expect(whale.args.max_balance_per_account).toBeUndefined();

    const node = await resolveCall("clear-compliance-node", {});
    expect(node.method).toBe("set_compliance_node");
    expect(node.args.node).toBeUndefined();
  });

  it("maps the input-free lifecycle actions to their contract methods", async () => {
    const cases: [AdminActionKey, string][] = [
      ["pause", "pause"],
      ["unpause", "unpause"],
      ["revoke", "revoke_admin"],
      ["accept-admin", "accept_admin"],
    ];

    for (const [key, method] of cases) {
      expect((await resolveCall(key, {})).method).toBe(method);
    }
  });

  it("maps the per-account freeze actions to their contract methods", async () => {
    const freeze = await resolveCall("freeze", { address: ALICE });
    const unfreeze = await resolveCall("unfreeze", { address: ALICE });

    expect(freeze.method).toBe("freeze_account");
    expect(unfreeze.method).toBe("unfreeze_account");
    expect(freeze.args.addr).toBe(ALICE);
    expect(unfreeze.args.addr).toBe(ALICE);
    // Both target the token itself, not a secondary contract.
    expect(freeze.contractId).toBe(TOKEN);
  });

  it("maps the holder authorization actions to their contract methods", async () => {
    const grant = await resolveCall("authorize", { address: ALICE });
    const revoke = await resolveCall("revoke-auth", { address: ALICE });

    expect(grant.method).toBe("authorize_holder");
    expect(revoke.method).toBe("revoke_authorization");
    expect(grant.args.holder).toBe(ALICE);
    expect(revoke.args.holder).toBe(ALICE);
  });

  it("decodes the upgrade WASM hash into 32 raw bytes", async () => {
    const wasmHash = "ab".repeat(32);
    const call = await resolveCall("upgrade", { wasmHash, confirmSymbol: "TST" });
    expect(call.method).toBe("upgrade");
    expect(call.args.new_wasm_hash).toHaveLength(32);
  });

  it("sends a vesting upgrade to the vesting contract, not the token", async () => {
    const call = await resolveCall("vesting-upgrade", {
      vestingContract: VESTING,
      wasmHash: "cd".repeat(32),
    });
    expect(call.contractId).toBe(VESTING);
    expect(call.method).toBe("upgrade");
    expect(call.args.new_wasm_hash).toHaveLength(32);
  });

  it("skips preflight only for the actions that take no user input", () => {
    const skipped = Object.entries(ADMIN_ACTIONS)
      .filter(([, def]) => def.preflight === "none")
      .map(([key]) => key)
      .sort();
    expect(skipped).toEqual(
      ["batch-mint", "pause", "revoke", "unpause", "upgrade", "vesting-upgrade"].sort(),
    );
  });
});
