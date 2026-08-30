import { createWriteStream, mkdirSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { pipeline } from "node:stream/promises";

export const DOWNLOAD_STALL_TIMEOUT_MS = 30_000;

/**
 * Download to a file, following redirects. A connection that stops delivering
 * bytes (VPN drop, sleeping Wi-Fi) rejects after stallTimeoutMs instead of
 * hanging the installer forever; healthy slow downloads are not affected
 * because the timer resets on every chunk.
 */
export function downloadFile(
  url,
  dest,
  onProgress,
  stallTimeoutMs = DOWNLOAD_STALL_TIMEOUT_MS,
) {
  return new Promise((resolve, reject) => {
    mkdirSync(path.dirname(dest), { recursive: true });
    const file = createWriteStream(dest);

    let settled = false;
    const done = (err) => {
      if (settled) return;
      settled = true;
      if (err) {
        file.destroy();
        reject(err);
      } else {
        resolve();
      }
    };

    const follow = (u, redirects = 0) => {
      if (redirects > 8) {
        done(new Error("Слишком много редиректов"));
        return;
      }
      const getter = u.startsWith("https") ? https : http;
      const req = getter.get(
        u,
        { headers: { "User-Agent": "joi-conductor/install" } },
        (res) => {
          if (
            res.statusCode &&
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            res.resume();
            follow(res.headers.location, redirects + 1);
            return;
          }
          if ((res.statusCode ?? 500) >= 400) {
            res.resume();
            done(new Error(`HTTP ${res.statusCode} для ${u}`));
            return;
          }
          const total = Number(res.headers["content-length"] || 0);
          let got = 0;
          res.on("data", (chunk) => {
            got += chunk.length;
            if (total > 0 && onProgress) {
              onProgress(Math.min(99, Math.round((got / total) * 100)));
            }
          });
          pipeline(res, file).then(() => done()).catch(done);
        },
      );
      if (stallTimeoutMs > 0) {
        req.setTimeout(stallTimeoutMs, () => {
          req.destroy(new Error(`Загрузка зависла: нет данных ${Math.round(stallTimeoutMs / 1000)}с`));
        });
      }
      req.on("error", done);
    };
    follow(url);
  });
}
