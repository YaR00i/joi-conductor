/** Node undici `fetch` abort and client disconnects that must not crash Vite. */

export function isAbortError(err: unknown): boolean {
  if (err == null || typeof err !== "object") return false;
  const rec = err as { name?: string; code?: string };
  return (
    rec.name === "AbortError" ||
    rec.code === "ABORT_ERR" ||
    rec.code === "ERR_CANCELED"
  );
}

export function isBenignProxyDisconnect(err: unknown): boolean {
  if (isAbortError(err)) return true;
  if (err == null || typeof err !== "object") return false;
  const rec = err as { code?: string };
  return (
    rec.code === "ECONNRESET" ||
    rec.code === "EPIPE" ||
    rec.code === "ERR_STREAM_PREMATURE_CLOSE" ||
    rec.code === "ERR_STREAM_DESTROYED"
  );
}

/**
 * Attach a handler immediately so an aborted `fetch` cannot become an
 * unhandledRejection before the caller awaits it (parallel Range tails).
 */
export function watchFetchAbort<T>(p: Promise<T>): Promise<T> {
  void p.catch((err) => {
    if (isAbortError(err)) return;
  });
  return p;
}

export function cancelWebBody(body: ReadableStream<Uint8Array> | null): void {
  if (!body) return;
  try {
    void body.cancel().catch(() => undefined);
  } catch {
    /* locked or already closed */
  }
}
