import { describe, expect, it } from "vitest";
import {
  isAbortError,
  isBenignProxyDisconnect,
  watchFetchAbort,
} from "./proxyAbort";

describe("isAbortError", () => {
  it("matches DOMException AbortError (Node fetch)", () => {
    expect(isAbortError(new DOMException("This operation was aborted", "AbortError"))).toBe(
      true,
    );
  });

  it("matches Error named AbortError", () => {
    const err = new Error("aborted");
    err.name = "AbortError";
    expect(isAbortError(err)).toBe(true);
  });

  it("ignores ordinary failures", () => {
    expect(isAbortError(new Error("upstream 502"))).toBe(false);
    expect(isAbortError("abort")).toBe(false);
  });
});

describe("isBenignProxyDisconnect", () => {
  it("treats client reset as non-fatal", () => {
    expect(isBenignProxyDisconnect({ code: "ECONNRESET" })).toBe(true);
    expect(isBenignProxyDisconnect({ code: "ERR_STREAM_PREMATURE_CLOSE" })).toBe(
      true,
    );
  });
});

describe("watchFetchAbort", () => {
  it("keeps aborted fetch from becoming unhandledRejection", async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const pending = watchFetchAbort(
      fetch("https://example.invalid/", { signal: ctrl.signal }),
    );
    await expect(pending).rejects.toSatisfy(isAbortError);
  });
});
