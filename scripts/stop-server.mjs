import { existsSync, readFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isPortListening,
  killPortListeners,
  killProcessTree,
  killProjectNodeProcesses,
} from "./process-utils.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const pidFile = path.join(root, ".joi-conductor-server.pid");
const port = Number(process.env.PORT || 5173);

export function stopJoiConductorServer(options = {}) {
  const { silent = false } = options;
  const log = silent ? () => {} : console.log;

  let stopped = 0;

  if (existsSync(pidFile)) {
    const raw = readFileSync(pidFile, "utf8").trim();
    const pid = Number(raw.split(/\s+/)[0]);
    if (Number.isFinite(pid) && pid > 0) {
      if (killProcessTree(pid)) stopped += 1;
    }
    try {
      unlinkSync(pidFile);
    } catch {
      // ignore
    }
  }

  stopped += killPortListeners(port);
  stopped += killProjectNodeProcesses(root);

  const stillUp = isPortListening(port);
  if (!silent) {
    if (stillUp) {
      console.log(
        `[Внимание] Порт ${port} всё ещё занят. Запустите Остановить.bat ещё раз.`,
      );
    } else {
      log(`Сервер на порту ${port} остановлен.`);
    }
  }

  return { stopped, portFree: !stillUp };
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  stopJoiConductorServer();
}
