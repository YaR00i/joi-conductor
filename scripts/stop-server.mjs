import { existsSync, readFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isPortListening,
  killPortListeners,
  killProcessTree,
  killProjectElectronProcesses,
  killProjectViteProcesses,
  listProjectViteProcesses,
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
      // Windows recycles PIDs; never kill whatever happens to own the number now.
      const stillOurs = listProjectViteProcesses(root).some(
        (row) => row.ProcessId === pid,
      );
      if (stillOurs) {
        if (killProcessTree(pid)) stopped += 1;
      } else {
        log(`[Внимание] PID ${pid} из pid-файла больше не наш сервер — не трогаю его.`);
      }
    }
    try {
      unlinkSync(pidFile);
    } catch {
      // ignore
    }
  }

  stopped += killPortListeners(port);
  stopped += killProjectViteProcesses(root);
  stopped += killProjectElectronProcesses(root);

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
