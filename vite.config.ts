import dns from "node:dns";
import type { IncomingMessage, ServerResponse } from "node:http";
import https from "node:https";
import {
  cpSync,
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import type { Connect, Plugin } from "vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import {
  MEDIA_STREAM_HEAD_BYTES,
  MEDIA_STREAM_TAIL_PARTS,
  mediaByteSegments,
  mediaStreamHeadEnd,
  parseContentRangeTotal,
  parseHttpRange,
  shouldParallelStreamRange,
} from "./src/lib/mediaRangeParts";
import {
  fetchMediaCdnIpv4,
  mediaCdnRequestHeaders,
} from "./src/lib/mediaCdnIpv4Fetch";
import {
  cancelWebBody,
  isBenignProxyDisconnect,
  watchFetchAbort,
} from "./src/lib/proxyAbort";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// *.booru.org / xbooru / hypnohub publish AAAA that black-hole here.
// List proxies use https.Agent({ family: 4 }). Media-proxy must not use
// Node fetch/undici: ipv4first is ignored and the shelf save hangs on КАЧАЮ.
dns.setDefaultResultOrder("ipv4first");
const booruIpv4Agent = new https.Agent({ family: 4, keepAlive: true });

function emberMiddleware(root: string): Connect.NextHandleFunction {
  return (req, res, next) => {
    if (!req.url?.startsWith("/ember/")) {
      next();
      return;
    }
    try {
      const url = new URL(req.url, "http://127.0.0.1");
      const rel = decodeURIComponent(url.pathname.replace(/^\/ember\//, ""));
      if (rel.includes("..") || path.isAbsolute(rel) || rel.includes("\0")) {
        res.statusCode = 400;
        res.end("bad path");
        return;
      }

      // Directory listing: GET /ember/scenes?list=1
      if (url.searchParams.get("list") === "1") {
        const dir = path.resolve(root, rel || ".");
        if (!dir.startsWith(root) || !existsSync(dir) || !statSync(dir).isDirectory()) {
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ names: [] }));
          return;
        }
        const names = readdirSync(dir).filter((name) => {
          try {
            return statSync(path.join(dir, name)).isFile();
          } catch {
            return false;
          }
        });
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.end(JSON.stringify({ names }));
        return;
      }

      if (!rel) {
        res.statusCode = 400;
        res.end("bad path");
        return;
      }
      const file = path.resolve(root, rel);
      if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
        res.statusCode = 404;
        res.end("not found");
        return;
      }
      const ext = path.extname(file).toLowerCase();
      const types: Record<string, string> = {
        ".json": "application/json; charset=utf-8",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".webp": "image/webp",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
      };
      res.setHeader("Content-Type", types[ext] ?? "application/octet-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.end(readFileSync(file));
    } catch (err) {
      res.statusCode = 500;
      res.end(err instanceof Error ? err.message : "ember error");
    }
  };
}

/** Serve content/ember at /ember/* for game + editor; copy into dist on build. */
function emberContentPlugin(): Plugin {
  const root = path.resolve(__dirname, "content/ember");
  return {
    name: "ember-content",
    configureServer(server) {
      server.middlewares.use(emberMiddleware(root));
    },
    configurePreviewServer(server) {
      server.middlewares.use(emberMiddleware(root));
    },
    writeBundle() {
      const out = path.resolve(__dirname, "dist/ember");
      cpSync(root, out, {
        recursive: true,
        // Crash-leftover `.tmp-*` siblings and `.bak` backups are not content.
        filter: (src) => {
          const name = path.basename(src);
          return !/\.tmp-/.test(name) && !name.endsWith(".bak.json");
        },
      });
      console.log(`[ember-content] copied → ${out}`);
    },
  };
}

function mediaCdnHeaders(
  hostname: string,
  range?: string,
  href?: string,
): Record<string, string> {
  return mediaCdnRequestHeaders(href ?? `https://${hostname}/`, range);
}

async function pipeWebBody(
  body: ReadableStream<Uint8Array>,
  res: ServerResponse,
  end: boolean,
): Promise<void> {
  const node = Readable.fromWeb(
    body as import("node:stream/web").ReadableStream,
  );
  try {
    if (end) {
      await pipeline(node, res);
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const onError = (err: Error) => {
        node.destroy();
        reject(err);
      };
      node.once("error", onError);
      res.once("error", onError);
      node.once("end", () => resolve());
      node.pipe(res, { end: false });
    });
  } catch (err) {
    if (isBenignProxyDisconnect(err)) return;
    throw err;
  }
}

function writeProxyCommonHeaders(
  res: ServerResponse,
  type: string,
  length: number | null,
  extra?: { acceptRanges?: string; contentRange?: string },
): void {
  res.setHeader("Content-Type", type);
  if (length != null) res.setHeader("Content-Length", String(length));
  if (extra?.acceptRanges) res.setHeader("Accept-Ranges", extra.acceptRanges);
  else res.setHeader("Accept-Ranges", "bytes");
  if (extra?.contentRange) res.setHeader("Content-Range", extra.contentRange);
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Expose-Headers",
    "Content-Length, Content-Range, Accept-Ranges",
  );
}

async function proxyParallelRange(opts: {
  url: string;
  hostname: string;
  start: number;
  wantEnd: number;
  total: number;
  head: Response;
  headEnd: number;
  tailCount: number;
  clientHadRange: boolean;
  signal: AbortSignal;
  res: ServerResponse;
}): Promise<void> {
  const type =
    opts.head.headers.get("content-type") || "application/octet-stream";
  const length = opts.wantEnd - opts.start + 1;
  opts.res.statusCode = opts.clientHadRange ? 206 : 200;
  writeProxyCommonHeaders(opts.res, type, length, {
    contentRange: opts.clientHadRange
      ? `bytes ${opts.start}-${opts.wantEnd}/${opts.total}`
      : undefined,
  });

  const tails =
    opts.wantEnd > opts.headEnd
      ? mediaByteSegments(
          opts.headEnd + 1,
          opts.wantEnd,
          Math.max(1, opts.tailCount),
        ).map((part) =>
          watchFetchAbort(
            fetchMediaCdnIpv4(opts.url, {
              headers: mediaCdnHeaders(
                opts.hostname,
                `bytes=${part.start}-${part.end}`,
                opts.url,
              ),
              signal: opts.signal,
            }),
          ),
        )
      : [];

  if (!opts.head.body) {
    throw new Error("upstream empty");
  }
  await pipeWebBody(opts.head.body, opts.res, tails.length === 0);
  for (let i = 0; i < tails.length; i += 1) {
    const upstream = await tails[i]!;
    if (upstream.status !== 206 || !upstream.body) {
      throw new Error(`upstream ${upstream.status}`);
    }
    await pipeWebBody(upstream.body, opts.res, i === tails.length - 1);
  }
}

function mediaProxyMiddleware(): Connect.NextHandleFunction {
  return async (req, res, next) => {
    if (!req.url?.startsWith("/api/media-proxy")) {
      next();
      return;
    }

    let settled = false;
    let onClose: (() => void) | undefined;
    try {
      const incoming = new URL(req.url, "http://127.0.0.1");
      const target = incoming.searchParams.get("url");
      if (!target) {
        res.statusCode = 400;
        res.end("missing url");
        return;
      }

      let parsed: URL;
      try {
        parsed = new URL(target);
      } catch {
        res.statusCode = 400;
        res.end("bad url");
        return;
      }

      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        res.statusCode = 400;
        res.end("protocol");
        return;
      }

      const ac = new AbortController();
      onClose = () => {
        if (!settled) ac.abort();
      };
      req.on("close", onClose);

      const rangeHeader =
        typeof req.headers.range === "string" ? req.headers.range.trim() : "";
      const parsedRange = parseHttpRange(rangeHeader || null);
      const clientHadRange = Boolean(rangeHeader);
      const start = parsedRange?.start ?? 0;
      const hintedEnd = parsedRange?.end ?? null;
      const headEndHint =
        hintedEnd != null
          ? mediaStreamHeadEnd(start, hintedEnd)
          : start + MEDIA_STREAM_HEAD_BYTES - 1;

      const headers = mediaCdnHeaders(
        parsed.hostname,
        parsedRange == null
          ? rangeHeader || undefined
          : `bytes=${start}-${headEndHint}`,
        parsed.toString(),
      );

      const upstream = await watchFetchAbort(
        fetchMediaCdnIpv4(parsed.toString(), {
          headers,
          signal: ac.signal,
        }),
      );

      if (ac.signal.aborted) {
        cancelWebBody(upstream.body);
        return;
      }
      ac.signal.addEventListener(
        "abort",
        () => cancelWebBody(upstream.body),
        { once: true },
      );

      if (!upstream.body) {
        res.statusCode = upstream.status || 502;
        res.end(`upstream ${upstream.status}`);
        return;
      }

      const total =
        parseContentRangeTotal(upstream.headers.get("content-range")) ??
        (upstream.status === 200
          ? Number(upstream.headers.get("content-length")) || null
          : null);
      const canFanOut =
        upstream.status === 206 &&
        parsedRange != null &&
        total != null &&
        Number.isFinite(total);

      if (canFanOut) {
        const wantEnd =
          hintedEnd == null ? total - 1 : Math.min(hintedEnd, total - 1);
        const headEnd = Math.min(
          mediaStreamHeadEnd(start, wantEnd),
          wantEnd,
        );
        if (wantEnd > headEnd) {
          await proxyParallelRange({
            url: parsed.toString(),
            hostname: parsed.hostname,
            start,
            wantEnd,
            total,
            head: upstream,
            headEnd,
            tailCount: shouldParallelStreamRange(wantEnd - start + 1)
              ? MEDIA_STREAM_TAIL_PARTS
              : 1,
            clientHadRange,
            signal: ac.signal,
            res,
          });
          return;
        }
      }

      res.statusCode = upstream.status;
      copyProxyResponseHeaders(upstream, res);

      try {
        await pipeline(
          Readable.fromWeb(
            upstream.body as import("node:stream/web").ReadableStream,
          ),
          res,
        );
      } catch (err) {
        if (
          ac.signal.aborted ||
          req.destroyed ||
          res.destroyed ||
          isBenignProxyDisconnect(err)
        ) {
          return;
        }
        throw err;
      }
    } catch (err) {
      if (
        isBenignProxyDisconnect(err) ||
        req.destroyed ||
        res.destroyed ||
        res.headersSent
      ) {
        return;
      }
      res.statusCode = 502;
      res.end(err instanceof Error ? err.message : "proxy error");
    } finally {
      settled = true;
      if (onClose) req.off("close", onClose);
    }
  };
}

function copyProxyResponseHeaders(
  upstream: Response,
  res: ServerResponse,
): void {
  const type = upstream.headers.get("content-type") || "application/octet-stream";
  res.setHeader("Content-Type", type);
  const length = upstream.headers.get("content-length");
  if (length) res.setHeader("Content-Length", length);
  const acceptRanges = upstream.headers.get("accept-ranges");
  if (acceptRanges) res.setHeader("Accept-Ranges", acceptRanges);
  const contentRange = upstream.headers.get("content-range");
  if (contentRange) res.setHeader("Content-Range", contentRange);
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Expose-Headers",
    "Content-Length, Content-Range, Accept-Ranges",
  );
}

/** Proxy remote booru / nhentai CDN files so <img> isn't blocked by hotlink/CORS. */
function mediaProxyPlugin(): Plugin {
  const middleware = mediaProxyMiddleware();
  return {
    name: "joi-media-proxy",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

const NHENTAI_API_UA = "JOI-Conductor/0.1 (local desktop)";

function readRequestBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function nhentaiApiMiddleware(): Connect.NextHandleFunction {
  return async (req, res, next) => {
    if (!req.url?.startsWith("/api/nhentai")) {
      next();
      return;
    }

    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
      res.end();
      return;
    }

    const method = (req.method || "GET").toUpperCase();
    if (method !== "GET" && method !== "POST" && method !== "DELETE") {
      res.statusCode = 405;
      res.end("method not allowed");
      return;
    }

    try {
      const incoming = new URL(req.url, "http://127.0.0.1");
      const rest = incoming.pathname.replace(/^\/api\/nhentai/, "") || "/";
      const target = new URL(`https://nhentai.net/api/v2${rest}`);
      target.search = incoming.search;

      const headers: Record<string, string> = {
        "User-Agent": NHENTAI_API_UA,
        Accept: "application/json",
      };
      const auth = req.headers.authorization;
      if (typeof auth === "string" && auth.trim()) {
        headers.Authorization = auth;
      }
      const contentType = req.headers["content-type"];
      if (typeof contentType === "string" && contentType.trim()) {
        headers["Content-Type"] = contentType;
      }

      const body =
        method === "GET" ? undefined : await readRequestBody(req);

      const upstream = await fetch(target.toString(), {
        method,
        headers,
        body: body && body.length > 0 ? body : undefined,
        redirect: "follow",
      });
      const text = await upstream.text();
      res.statusCode = upstream.status;
      res.setHeader(
        "Content-Type",
        upstream.headers.get("content-type") || "application/json",
      );
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.end(text);
    } catch (err) {
      res.statusCode = 502;
      res.end(err instanceof Error ? err.message : "nhentai proxy error");
    }
  };
}

function nhentaiApiPlugin(): Plugin {
  const middleware = nhentaiApiMiddleware();
  return {
    name: "joi-nhentai-api",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

/** Google Translate (gtx) proxy — avoids CORS for shop tag labels. */
function gtranslateProxyPlugin(): Plugin {
  return {
    name: "joi-gtranslate-proxy",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/gtranslate")) {
          next();
          return;
        }
        try {
          const incoming = new URL(req.url, "http://127.0.0.1");
          const q = incoming.searchParams.get("q") ?? "";
          const sl = incoming.searchParams.get("sl") ?? "en";
          const tl = incoming.searchParams.get("tl") ?? "ru";
          if (!q.trim()) {
            res.statusCode = 400;
            res.end("missing q");
            return;
          }
          const target = new URL(
            "https://translate.googleapis.com/translate_a/single",
          );
          target.searchParams.set("client", "gtx");
          target.searchParams.set("sl", sl);
          target.searchParams.set("tl", tl);
          target.searchParams.set("dt", "t");
          target.searchParams.set("q", q);

          const upstream = await fetch(target.toString(), {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
              Accept: "application/json",
            },
          });
          const body = await upstream.text();
          res.statusCode = upstream.status;
          res.setHeader(
            "Content-Type",
            upstream.headers.get("content-type") || "application/json",
          );
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.end(body);
        } catch (err) {
          res.statusCode = 502;
          res.end(err instanceof Error ? err.message : "translate proxy error");
        }
      });
    },
  };
}

function booruIpv4ViteProxy(opts: {
  site: string;
  origin: string;
  accept: string;
}) {
  const { site, origin, accept } = opts;
  return {
    target: origin,
    changeOrigin: true,
    agent: booruIpv4Agent,
    timeout: 20_000,
    proxyTimeout: 20_000,
    rewrite: (path: string) =>
      path.replace(new RegExp(`^/api/booru/${site}`), "/index.php"),
    configure(
      proxy: {
        on: (
          event: string,
          listener: (...args: unknown[]) => void,
        ) => void;
      },
    ) {
      proxy.on("proxyReq", (...args: unknown[]) => {
        const proxyReq = args[0] as
          | { setHeader?: (k: string, v: string) => void }
          | undefined;
        proxyReq?.setHeader?.(
          "User-Agent",
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        );
        proxyReq?.setHeader?.("Referer", `${origin.replace(/\/+$/, "")}/`);
        proxyReq?.setHeader?.("Accept", accept);
      });
      proxy.on("error", (err: unknown, _req: unknown, socket: unknown) => {
        if (isBenignProxyDisconnect(err)) return;
        const res = socket as ServerResponse | undefined;
        if (res && "headersSent" in res && !res.headersSent) {
          try {
            res.statusCode = 502;
            res.end(`${site} booru proxy error`);
          } catch {
            /* client gone */
          }
        }
      });
    },
  };
}

function gelbooru01ViteProxy(site: "censored" | "blacked") {
  return booruIpv4ViteProxy({
    site,
    origin: `https://${site}.booru.org`,
    accept: "text/html,application/xhtml+xml,*/*",
  });
}

function joidbIpv4ViteProxy() {
  const origin = "https://www.the-joi-database.com";
  return {
    target: origin,
    changeOrigin: true,
    agent: booruIpv4Agent,
    timeout: 20_000,
    proxyTimeout: 20_000,
    rewrite: (path: string) => path.replace(/^\/api\/joidb/, "") || "/",
    configure(
      proxy: {
        on: (
          event: string,
          listener: (...args: unknown[]) => void,
        ) => void;
      },
    ) {
      proxy.on("proxyReq", (...args: unknown[]) => {
        const proxyReq = args[0] as
          | { setHeader?: (k: string, v: string) => void }
          | undefined;
        proxyReq?.setHeader?.(
          "User-Agent",
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        );
        proxyReq?.setHeader?.("Referer", `${origin}/`);
        proxyReq?.setHeader?.(
          "Accept",
          "application/vnd.apple.mpegurl,application/json,text/html,text/vtt,*/*",
        );
      });
      proxy.on("error", (err: unknown, _req: unknown, socket: unknown) => {
        if (isBenignProxyDisconnect(err)) return;
        const res = socket as ServerResponse | undefined;
        if (res && "headersSent" in res && !res.headersSent) {
          try {
            res.statusCode = 502;
            res.end("joidb proxy error");
          } catch {
            /* client gone */
          }
        }
      });
    },
  };
}

function gelbooruDapiViteProxy(site: "xbooru" | "hypnohub", origin: string) {
  return booruIpv4ViteProxy({
    site,
    origin,
    accept: "application/json,text/javascript,*/*",
  });
}

export default defineConfig({
  plugins: [
    react(),
    emberContentPlugin(),
    mediaProxyPlugin(),
    nhentaiApiPlugin(),
    gtranslateProxyPlugin(),
  ],
  assetsInclude: ["**/*.svg"],
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = id.replace(/\\/g, "/");
          if (!normalized.includes("/node_modules/")) return undefined;
          if (normalized.includes("/node_modules/three/")) {
            return "vendor-three";
          }
          if (
            normalized.includes("/node_modules/@xyflow/") ||
            normalized.includes("/node_modules/d3-")
          ) {
            return "vendor-graph";
          }
          if (
            normalized.includes("/node_modules/react/") ||
            normalized.includes("/node_modules/react-dom/") ||
            normalized.includes("/node_modules/scheduler/")
          ) {
            return "vendor-react";
          }
          return undefined;
        },
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    fs: {
      allow: [".", "content"],
    },
    proxy: {
      "/api/gelbooru": {
        target: "https://gelbooru.com",
        changeOrigin: true,
        rewrite: (path) =>
          path.replace(/^\/api\/gelbooru/, "/index.php"),
        configure(proxy) {
          proxy.on("error", (err, _req, socket) => {
            if (isBenignProxyDisconnect(err)) return;
            const res = socket as ServerResponse | undefined;
            if (res && "headersSent" in res && !res.headersSent) {
              try {
                res.statusCode = 502;
                res.end("gelbooru proxy error");
              } catch {
                /* client gone */
              }
            }
          });
        },
      },
      "/api/booru/censored": gelbooru01ViteProxy("censored"),
      "/api/booru/blacked": gelbooru01ViteProxy("blacked"),
      "/api/booru/xbooru": gelbooruDapiViteProxy("xbooru", "https://xbooru.com"),
      "/api/booru/hypnohub": gelbooruDapiViteProxy(
        "hypnohub",
        "https://hypnohub.net",
      ),
      "/api/booru/realbooru": booruIpv4ViteProxy({
        site: "realbooru",
        origin: "https://realbooru.com",
        accept: "text/html,application/xhtml+xml,*/*",
      }),
      "/api/joidb": joidbIpv4ViteProxy(),
      "/api/ollama": {
        target: "http://127.0.0.1:11434",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ollama/, ""),
      },
      "/api/ollama-hub": {
        target: "https://ollama.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ollama-hub/, ""),
      },
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api/ollama": {
        target: "http://127.0.0.1:11434",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ollama/, ""),
      },
      "/api/ollama-hub": {
        target: "https://ollama.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ollama-hub/, ""),
      },
    },
  },
});
