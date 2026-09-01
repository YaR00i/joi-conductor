import { createWriteStream, mkdirSync, unlinkSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { pipeline } from "node:stream/promises";

export const DOWNLOAD_STALL_TIMEOUT_MS = 30_000;

const DEFAULT_UA = "joi-conductor/install";

const ipv4HttpsAgent = new https.Agent({ family: 4, keepAlive: false });
const ipv4HttpAgent = new http.Agent({ family: 4, keepAlive: false });

function resolveRedirect(fromUrl, location) {
  try {
    return new URL(location, fromUrl).toString();
  } catch {
    return location;
  }
}

/**
 * Download to a file, following redirects. A connection that stops delivering
 * bytes (VPN drop, sleeping Wi-Fi) rejects after stallTimeoutMs instead of
 * hanging the installer forever; healthy slow downloads are not affected
 * because the timer resets on every chunk.
 *
 * Stall is attached only to the hop that receives the body. An idle keep-alive
 * socket from a 302 must not abort a CDN transfer that is still flowing.
 *
 * @param {string} url
 * @param {string} dest
 * @param {(pct: number) => void} [onProgress]
 * @param {number} [stallTimeoutMs]
 * @param {{ family?: number, userAgent?: string }} [opts]
 */
export function downloadFile(
  url,
  dest,
  onProgress,
  stallTimeoutMs = DOWNLOAD_STALL_TIMEOUT_MS,
  opts = {},
) {
  return new Promise((resolve, reject) => {
    mkdirSync(path.dirname(dest), { recursive: true });
    const file = createWriteStream(dest);

    let settled = false;
    let hop = 0;
    let stallTimer = null;

    const clearStall = () => {
      if (stallTimer != null) {
        clearTimeout(stallTimer);
        stallTimer = null;
      }
    };

    const failCleanup = () => {
      try {
        unlinkSync(dest);
      } catch {
        /* dest may not exist */
      }
    };

    const done = (err) => {
      if (settled) return;
      settled = true;
      clearStall();
      hop += 1;
      if (err) {
        file.destroy();
        failCleanup();
        reject(err);
      } else {
        resolve();
      }
    };

    const armStall = (req) => {
      if (!stallTimeoutMs || stallTimeoutMs <= 0) return;
      clearStall();
      stallTimer = setTimeout(() => {
        req.destroy(
          new Error(
            `Загрузка зависла: нет данных ${Math.round(stallTimeoutMs / 1000)}с`,
          ),
        );
      }, stallTimeoutMs);
    };

    const follow = (u, redirects = 0) => {
      if (redirects > 8) {
        done(new Error("Слишком много редиректов"));
        return;
      }
      const myHop = ++hop;
      const getter = u.startsWith("https") ? https : http;
      const family4 = opts.family === 4;
      const req = getter.get(
        u,
        {
          headers: {
            "User-Agent": opts.userAgent || DEFAULT_UA,
            Accept: "*/*",
          },
          agent: family4
            ? u.startsWith("https")
              ? ipv4HttpsAgent
              : ipv4HttpAgent
            : undefined,
        },
        (res) => {
          if (myHop !== hop) {
            res.resume();
            return;
          }
          if (
            res.statusCode &&
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            clearStall();
            res.resume();
            follow(resolveRedirect(u, res.headers.location), redirects + 1);
            return;
          }
          if ((res.statusCode ?? 500) >= 400) {
            res.resume();
            done(new Error(`HTTP ${res.statusCode} для ${u}`));
            return;
          }
          const total = Number(res.headers["content-length"] || 0);
          let got = 0;
          armStall(req);
          res.on("data", (chunk) => {
            got += chunk.length;
            armStall(req);
            if (total > 0 && onProgress) {
              onProgress(Math.min(99, Math.round((got / total) * 100)));
            }
          });
          pipeline(res, file).then(() => done()).catch(done);
        },
      );
      armStall(req);
      req.on("error", (err) => {
        if (myHop !== hop) return;
        done(err);
      });
    };
    follow(url);
  });
}
