import {
  classifyRpcError,
  wrapRpcCall,
  addressToScVal,
  i128ToScVal,
} from "../soroban";

describe("classifyRpcError", () => {
  it("treats AbortError as a timeout", () => {
    const abort = new DOMException("aborted", "AbortError");
    const info = classifyRpcError(abort);
    expect(info.kind).toBe("timeout");
    expect(info.title).toMatch(/timed out/i);
  });

  it("classifies fetch TypeErrors as network failures", () => {
    const err = new TypeError("Failed to fetch");
    expect(classifyRpcError(err).kind).toBe("network");
  });

  it("extracts 504 from the error message and reports timeout", () => {
    const err = new Error("Request returned 504");
    const info = classifyRpcError(err);
    expect(info.kind).toBe("timeout");
    expect(info.status).toBe(504);
  });

  it("classifies 429 as rate-limit", () => {
    const info = classifyRpcError(new Error("HTTP 429 Too Many Requests"));
    expect(info.kind).toBe("rate_limit");
    expect(info.status).toBe(429);
  });

  it("does not read the port out of a connection error as an HTTP status", () => {
    // 443 is the port on essentially every RPC endpoint, so a bare three-digit
    // scrape turned every connection failure into a bogus 4xx client error —
    // which in turn made a valid token render as "Invalid Token Contract".
    const info = classifyRpcError(new Error("connect ETIMEDOUT 142.251.29.95:443"));
    expect(info.kind).toBe("timeout");
    expect(info.status).toBeUndefined();

    const unreachable = classifyRpcError(
      new Error("connect ENETUNREACH 2a00:1450:4009:c17::5f:443"),
    );
    expect(unreachable.kind).toBe("network");
  });

  it("classifies an AggregateError by its first nested error", () => {
    // Node raises this when every address for a host fails; its own message is
    // empty, so classifying it directly always produced "unknown".
    const agg = new AggregateError(
      [new Error("connect ETIMEDOUT 142.251.29.95:443")],
      "",
    );
    expect(classifyRpcError(agg).kind).toBe("timeout");
  });

  it("classifies generic 5xx as server error", () => {
    const info = classifyRpcError(new Error("RPC returned 503"));
    expect(info.kind).toBe("server");
    expect(info.status).toBe(503);
  });

  it("classifies simulation messages", () => {
    const info = classifyRpcError(
      new Error("Soroban simulation error (mint): bad auth"),
    );
    expect(info.kind).toBe("simulation");
  });

  it("falls through to unknown for non-Error values", () => {
    expect(classifyRpcError({ weird: true }).kind).toBe("unknown");
  });
});

describe("wrapRpcCall", () => {
  let bridge: { show: jest.Mock; dismiss: jest.Mock };

  beforeEach(() => {
    bridge = { show: jest.fn().mockReturnValue("id"), dismiss: jest.fn() };
    (window as unknown as { __soropadToast?: unknown }).__soropadToast =
      bridge;
  });

  afterEach(() => {
    delete (window as unknown as { __soropadToast?: unknown }).__soropadToast;
  });

  it("returns the result on success without toasting", async () => {
    const result = await wrapRpcCall(async () => 42, { operation: "x" });
    expect(result).toBe(42);
    expect(bridge.show).not.toHaveBeenCalled();
  });

  it("dispatches a toast and re-throws on failure", async () => {
    await expect(
      wrapRpcCall(
        async () => {
          throw new Error("HTTP 504 gateway timeout");
        },
        { operation: "Submit transaction" },
      ),
    ).rejects.toThrow(/504/);
    expect(bridge.show).toHaveBeenCalledTimes(1);
    const arg = bridge.show.mock.calls[0][0];
    expect(arg.title).toMatch(/timeout/i);
    expect(arg.message).toMatch(/Submit transaction/);
    expect(arg.variant).toBe("warning");
  });

  it("respects silent mode", async () => {
    await expect(
      wrapRpcCall(
        async () => {
          throw new Error("simulation error");
        },
        { silent: true },
      ),
    ).rejects.toThrow(/simulation/);
    expect(bridge.show).not.toHaveBeenCalled();
  });
});

describe("ScVal converters", () => {
  it("addressToScVal accepts a G-address", () => {
    const sv = addressToScVal(
      "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    );
    expect(sv).toBeDefined();
  });

  it("i128ToScVal accepts numeric and bigint amounts", () => {
    expect(i128ToScVal(1n)).toBeDefined();
    expect(i128ToScVal(100)).toBeDefined();
  });
});
