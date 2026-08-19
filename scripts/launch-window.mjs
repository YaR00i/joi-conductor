import { spawn } from "node:child_process";
import { existsSync, writeFileSync, unlinkSync } from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isPortListening, killProcessTree } from "./process-utils.mjs";
import { stopJoiConductorServer } from "./stop-server.mjs";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || 5173);
const url = `http://127.0.0.1:${port}`;
const viteBin = path.join(root, "node_modules", "vite", "bin", "vite.js");
const pidFile = path.join(root, ".joi-conductor-server.pid");
const useProd = process.env.JOI_CONDUCTOR_PROD === "1";

let server = null;
let shuttingDown = false;

function waitForServer(timeoutMs = 90000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`Сервер не ответил за ${timeoutMs / 1000}с: ${url}`));
          return;
        }
        setTimeout(tick, 400);
      });
    };
    tick();
  });
}

function writePidFile(pid) {
  try {
    writeFileSync(pidFile, String(pid), "utf8");
  } catch {
    // ignore
  }
}

function removePidFile() {
  try {
    if (existsSync(pidFile)) unlinkSync(pidFile);
  } catch {
    // ignore
  }
}

function stopServer(reason = "shutdown") {
  if (shuttingDown) return;
  shuttingDown = true;

  if (server) {
    console.log(`\nОстанавливаю сервер (${reason})...`);
    killProcessTree(server);
    server = null;
    removePidFile();
    stopJoiConductorServer({ silent: true });
  }
}

function registerShutdownHandlers() {
  const handler = (signal) => {
    stopServer(signal);
    setTimeout(() => process.exit(0), 400);
  };

  process.on("SIGINT", () => handler("SIGINT"));
  process.on("SIGTERM", () => handler("SIGTERM"));
  process.on("exit", () => {
    if (!shuttingDown && server) {
      killProcessTree(server);
      removePidFile();
    }
  });

  if (process.platform === "win32") {
    process.on("SIGBREAK", () => handler("SIGBREAK"));
  }
}

function startServer() {
  if (!existsSync(viteBin)) {
    throw new Error("Vite не найден. Запустите npm install в папке проекта.");
  }

  const distIndex = path.join(root, "dist", "index.html");
  const mode = useProd && existsSync(distIndex) ? "preview" : "dev";

  console.log(
    mode === "preview"
      ? "Запуск production preview..."
      : "Запуск Vite dev-сервера...",
  );

  const args =
    mode === "dev"
      ? [viteBin, "--host", "127.0.0.1", "--port", String(port), "--strictPort"]
      : [
          viteBin,
          "preview",
          "--host",
          "127.0.0.1",
          "--port",
          String(port),
          "--strictPort",
        ];

  const child = spawn(process.execPath, args, {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: "inherit",
    windowsHide: false,
    detached: false,
  });

  child.on("error", (err) => {
    console.error("Не удалось запустить сервер:", err.message);
    process.exit(1);
  });

  child.on("exit", (code) => {
    removePidFile();
    if (!shuttingDown && code && code !== 0) {
      console.error(`Сервер завершился с кодом ${code}`);
      process.exit(code);
    }
  });

  if (child.pid) writePidFile(child.pid);
  return child;
}

function findBrowser() {
  const localAppData = process.env.LOCALAPPDATA || "";
  const programFiles = process.env.PROGRAMFILES || "C:\\Program Files";
  const programFilesX86 =
    process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)";

  const candidates = [
    path.join(localAppData, "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
    path.join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
    path.join(localAppData, "Google", "Chrome", "Application", "chrome.exe"),
  ];

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function findElectronBinary() {
  try {
    const binary = require("electron");
    if (typeof binary === "string" && existsSync(binary)) return binary;
  } catch {
    // not installed
  }
  return null;
}

/** Launch Electron and resolve when the app window/process exits. */
function openElectronWindow(electronBin) {
  return new Promise((resolve, reject) => {
    console.log("Открываю Electron (без рамки Windows)...");
    const env = { ...process.env, PORT: String(port), JOI_CONDUCTOR_URL: url };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(electronBin, ["."], {
      cwd: root,
      env,
      detached: false,
      stdio: "ignore",
      windowsHide: false,
    });
    child.on("error", (err) => {
      console.error("Не удалось открыть Electron:", err.message);
      reject(err);
    });
    child.on("exit", (code, signal) => {
      console.log(
        `Окно приложения закрыто${code != null ? ` (код ${code})` : signal ? ` (${signal})` : ""}.`,
      );
      resolve(code ?? 0);
    });
  });
}

function openBrowserFallback() {
  const browser = findBrowser();
  const appArgs = [
    `--app=${url}`,
    "--new-window",
    "--window-size=1280,820",
    "--window-position=60,40",
  ];

  if (browser) {
    console.log(`Electron нет — открываю браузер: ${browser}`);
    console.log(
      "Внимание: закрытие вкладки браузера не остановит сервер — закройте консоль или Остановить.bat.",
    );
    const child = spawn(browser, appArgs, {
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    });
    child.on("error", (err) => {
      console.error("Не удалось открыть окно браузера:", err.message);
    });
    child.unref();
    return;
  }

  console.log("Edge/Chrome не найдены — открываю системный браузер.");
  spawn(`start "" "${url}"`, {
    detached: true,
    stdio: "ignore",
    shell: true,
    windowsHide: true,
  }).unref();
}

registerShutdownHandlers();

console.log("Освобождаю порт", port, "...");
const { portFree } = stopJoiConductorServer({ silent: true });
if (!portFree) {
  console.log("Порт был занят — повторная попытка...");
  await new Promise((r) => setTimeout(r, 800));
  stopJoiConductorServer({ silent: true });
}

if (isPortListening(port)) {
  console.error(
    `[Ошибка] Порт ${port} всё ещё занят. Запустите Остановить.bat и повторите.`,
  );
  process.exit(1);
}

server = startServer();
await waitForServer();

const electronBin = findElectronBinary();
console.log(`JOI Conductor: ${url}`);

if (electronBin) {
  console.log("Закройте окно приложения — сервер остановится сам.");
  try {
    await openElectronWindow(electronBin);
  } catch {
    // already logged
  }
  stopServer("app-closed");
  process.exit(0);
}

openBrowserFallback();
console.log("Закройте это окно консоли или Ctrl+C — сервер остановится.");

await new Promise((resolve) => {
  server.on("exit", resolve);
});
stopServer("server-exit");
