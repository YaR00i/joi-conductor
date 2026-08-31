import http from "node:http";
import https from "node:https";
import { Readable } from "node:stream";
import { booruCdnReferer } from "./booruSites";

/** Dead IPv6 AAAA must not hang the shelf downloader. */
export const MEDIA_CDN_IPV4_TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 5;

const MEDIA_CDN_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const httpsAgent = new https.Agent({ family: 4, keepAlive: true });
const httpAgent = new http.Agent({ family: 4, keepAlive: true });

/** Hotlink Referer for media-proxy (booru CDNs, nhentai, else gelbooru). */
export function mediaCdnReferer(url: string): string {
  const booru = booruCdnReferer(url);
  if (booru) return booru;
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === "nhentai.net" || host.endsWith(".nhentai.net")) {
      return "https://nhentai.net/";
    }
    if (
      host === "the-joi-database.com" ||
      host.endsWith(".the-joi-database.com")
    ) {
      return "https://www.the-joi-database.com/";
    }
  } catch {
    /* fall through */
  }
  return "https://gelbooru.com/";
}

export function mediaCdnRequestHeaders(
  url: string,
  range?: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": MEDIA_CDN_UA,
    Accept: "*/*",
    "Accept-Encoding": "identity",
    Referer: mediaCdnReferer(url),
  };
  if (range) headers.Range = range;
  return headers;
}

export type FetchMediaCdnIpv4Opts = {
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
};

/**
 * Same IPv4 pin as the booru list http-proxy. Node `fetch` (undici) still
 * follows AAAA first; `dns.setDefaultResultOrder("ipv4first")` is not enough.
 */
export function fetchMediaCdnIpv4(
  url: string,
  opts: FetchMediaCdnIpv4Opts = {},
): Promise<Response> {
  return fetchOnce(url, opts, 0);
}

function abortError(): Error {
  return Object.assign(new Error("media-cdn aborted"), { name: "AbortError" });
}

function fetchOnce(
  url: string,
  opts: FetchMediaCdnIpv4Opts,
  redirects: number,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch (err) {
      reject(err);
      return;
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      reject(new Error("protocol"));
      return;
    }
    if (opts.signal?.aborted) {
      reject(abortError());
      return;
    }

    const isHttps = parsed.protocol === "https:";
    const lib = isHttps ? https : http;
    const timeoutMs = opts.timeoutMs ?? MEDIA_CDN_IPV4_TIMEOUT_MS;

    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let req: http.ClientRequest | null = null;

    const cleanup = () => {
      if (timeoutId != null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      opts.signal?.removeEventListener("abort", onAbort);
    };

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      req?.destroy();
      reject(err);
    };

    const onAbort = () => fail(abortError());

    req = lib.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || undefined,
        path: parsed.pathname + parsed.search,
        method: "GET",
        family: 4,
        agent: isHttps ? httpsAgent : httpAgent,
        headers: opts.headers,
      },
      (res) => {
        const status = res.statusCode ?? 502;
        const location = res.headers.location;
        if (
          status >= 300 &&
          status < 400 &&
          typeof location === "string" &&
          location &&
          redirects < MAX_REDIRECTS
        ) {
          res.resume();
          if (settled) return;
          settled = true;
          cleanup();
          const next = new URL(location, parsed).toString();
          void fetchOnce(next, opts, redirects + 1).then(resolve, reject);
          return;
        }

        if (settled) {
          res.resume();
          return;
        }
        settled = true;
        cleanup();

        const headers = new Headers();
        for (const [key, value] of Object.entries(res.headers)) {
          if (value == null) continue;
          if (
            key === "transfer-encoding" ||
            key === "connection" ||
            key === "keep-alive"
          ) {
            continue;
          }
          if (Array.isArray(value)) headers.set(key, value.join(", "));
          else headers.set(key, value);
        }

        const empty = status === 204 || status === 304;
        const body = empty
          ? null
          : (Readable.toWeb(res) as ReadableStream<Uint8Array>);
        resolve(
          new Response(body, {
            status,
            statusText: res.statusMessage,
            headers,
          }),
        );
      },
    );

    timeoutId = setTimeout(() => {
      fail(new Error("media-cdn timeout"));
    }, timeoutMs);

    opts.signal?.addEventListener("abort", onAbort, { once: true });
    req.on("error", (err) => {
      fail(err instanceof Error ? err : new Error(String(err)));
    });
    req.end();
  });
}
