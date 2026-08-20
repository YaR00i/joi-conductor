/**
 * App-managed Ollama CLI (official GitHub zip). Used when no system install exists.
 */
import { app } from "electron";
import { createWriteStream, mkdirSync, promises as fs } from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";
import {
  locateOllamaExe,
  ollamaExeName,
  ollamaReleaseUrl,
} from "./ollamaRuntime.mjs";

export {
  locateOllamaExe,
  ollamaExeName,
  ollamaReleaseAsset,
  ollamaReleaseUrl,
} from "./ollamaRuntime.mjs";

export function ollamaAppRoot() {
  return path.join(app.getPath("userData"), "ollama");
}

export function findAppOllamaBinary() {
  return locateOllamaExe(ollamaAppRoot());
}

function downloadFile(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    mkdirSync(path.dirname(dest), { recursive: true });
    const file = createWriteStream(dest);
    const getter = url.startsWith("https") ? https : http;

    const follow = (u, redirects = 0) => {
      if (redirects > 8) {
        reject(new Error("Слишком много редиректов"));
        return;
      }
      getter
        .get(
          u,
          { headers: { "User-Agent": "joi-conductor/ollama" } },
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
              file.close();
              reject(new Error(`HTTP ${res.statusCode} для ${u}`));
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
            pipeline(res, file).then(resolve).catch(reject);
          },
        )
        .on("error", reject);
    };
    follow(url);
  });
}

function expandZip(zipPath, outDir) {
  mkdirSync(outDir, { recursive: true });
  return new Promise((resolve, reject) => {
    const ps = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${outDir.replace(/'/g, "''")}' -Force`,
      ],
      { windowsHide: true },
    );
    ps.on("error", reject);
    ps.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Распаковка Ollama zip код ${code}`));
    });
  });
}

/** @type {Promise<string> | null} */
let installLock = null;

/**
 * @param {(p: { phase: string, pct: number, detail?: string }) => void} [onProgress]
 * @returns {Promise<string>}
 */
export async function installOllamaRuntime(onProgress) {
  const existing = findAppOllamaBinary();
  if (existing) return existing;
  if (installLock) return installLock;

  installLock = (async () => {
    const url = ollamaReleaseUrl();
    if (!url) {
      throw new Error(
        "Автоустановка Ollama есть только для Windows. Поставь Ollama с ollama.com, потом снова «Скачать».",
      );
    }
    const root = ollamaAppRoot();
    mkdirSync(root, { recursive: true });
    const zipPath = path.join(root, path.basename(url));
    onProgress?.({
      phase: "Скачиваю Ollama",
      pct: 1,
      detail: "официальный CLI + GPU-библиотеки (~1 ГБ)…",
    });
    await downloadFile(url, zipPath, (pct) =>
      onProgress?.({
        phase: "Скачиваю Ollama",
        pct: Math.max(1, Math.round(pct * 0.82)),
        detail: `${pct}% архива`,
      }),
    );
    onProgress?.({
      phase: "Распаковываю Ollama",
      pct: 86,
      detail: root,
    });
    await expandZip(zipPath, root);
    try {
      await fs.unlink(zipPath);
    } catch {
      /* ignore */
    }
    const exe = locateOllamaExe(root);
    if (!exe) {
      throw new Error(
        `Архив Ollama распакован, но ${ollamaExeName()} не найден в ${root}`,
      );
    }
    onProgress?.({
      phase: "Ollama готов",
      pct: 100,
      detail: exe,
    });
    return exe;
  })().finally(() => {
    installLock = null;
  });

  return installLock;
}
