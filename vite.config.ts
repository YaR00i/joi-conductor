import {
  cpSync,
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Connect, Plugin } from "vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
      cpSync(root, out, { recursive: true });
      console.log(`[ember-content] copied → ${out}`);
    },
  };
}

/** Proxy remote booru CDN files so <img>/<video> aren't blocked by hotlink/CORS. */
function mediaProxyPlugin(): Plugin {
  return {
    name: "joi-media-proxy",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/media-proxy")) {
          next();
          return;
        }

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

          const upstream = await fetch(parsed.toString(), {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
              Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
              Referer: "https://gelbooru.com/",
            },
            redirect: "follow",
          });

          if (!upstream.ok || !upstream.body) {
            res.statusCode = upstream.status || 502;
            res.end(`upstream ${upstream.status}`);
            return;
          }

          const type = upstream.headers.get("content-type") || "application/octet-stream";
          res.setHeader("Content-Type", type);
          res.setHeader("Cache-Control", "public, max-age=3600");
          res.setHeader("Access-Control-Allow-Origin", "*");

          const buf = Buffer.from(await upstream.arrayBuffer());
          res.end(buf);
        } catch (err) {
          res.statusCode = 502;
          res.end(err instanceof Error ? err.message : "proxy error");
        }
      });
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

export default defineConfig({
  plugins: [
    react(),
    emberContentPlugin(),
    mediaProxyPlugin(),
    gtranslateProxyPlugin(),
  ],
  assetsInclude: ["**/*.svg"],
  resolve: {
    alias: {
      "@": "/src",
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
      },
      "/api/ollama": {
        target: "http://127.0.0.1:11434",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ollama/, ""),
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
    },
  },
});
