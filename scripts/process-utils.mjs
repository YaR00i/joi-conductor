import { spawnSync } from "node:child_process";

function resolvePid(target) {
  if (typeof target === "number") return target;
  if (target && typeof target.pid === "number") return target.pid;
  return null;
}

/** Kill process tree on Windows; SIGTERM elsewhere. */
export function killProcessTree(target) {
  const pid = resolvePid(target);
  if (!pid || pid <= 0) return false;

  if (process.platform === "win32") {
    const result = spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return result.status === 0;
  }

  try {
    process.kill(pid, "SIGTERM");
    return true;
  } catch {
    return false;
  }
}

/** PIDs listening on TCP port (Windows netstat). */
export function findPortListenerPids(targetPort) {
  if (process.platform !== "win32") return [];

  const result = spawnSync("netstat", ["-ano"], {
    encoding: "utf8",
    windowsHide: true,
  });

  const pids = new Set();
  const portToken = `:${targetPort}`;

  for (const line of (result.stdout || "").split(/\r?\n/)) {
    if (!/LISTENING/i.test(line)) continue;
    if (!line.includes(portToken)) continue;

    const parts = line.trim().split(/\s+/);
    const pid = Number(parts[parts.length - 1]);
    if (Number.isFinite(pid) && pid > 0 && pid !== process.pid) {
      pids.add(pid);
    }
  }

  return [...pids];
}

export function killPortListeners(targetPort) {
  const pids = findPortListenerPids(targetPort);
  let killed = 0;
  for (const pid of pids) {
    if (killProcessTree(pid)) killed += 1;
  }
  return killed;
}

const VITE_SCRIPT_SEGMENT = "node_modules/vite/bin/vite.js";

function normalizeForMatch(value) {
  return String(value ?? "").replace(/\\/g, "/").toLowerCase();
}

/**
 * True only for this project's own vite dev/preview server. Stop runs on every
 * app launch, so a broader match (any project node.exe) used to take down
 * vitest watchers, tsx agents and editor tooling sharing the repo path.
 */
export function isProjectViteCommandLine(commandLine, projectRoot) {
  if (typeof commandLine !== "string" || !commandLine) return false;
  const line = normalizeForMatch(commandLine);
  const root = normalizeForMatch(projectRoot).replace(/\/+$/, "");
  return line.includes(root) && line.includes(VITE_SCRIPT_SEGMENT);
}

/** True when the executable is Electron shipped in this project's node_modules. */
export function isProjectElectronPath(executablePath, projectRoot) {
  if (typeof executablePath !== "string" || !executablePath) return false;
  const exe = normalizeForMatch(executablePath);
  const root = normalizeForMatch(projectRoot).replace(/\/+$/, "");
  return exe.startsWith(`${root}/node_modules/electron/`);
}

/** Windows-only process rows for an image name (pid, command line, exe path). */
function listWindowsProcesses(imageName) {
  if (process.platform !== "win32") return [];

  const ps = `
    Get-CimInstance Win32_Process -Filter "Name = '${imageName}'" |
      Select-Object ProcessId, CommandLine, ExecutablePath |
      ConvertTo-Json -Compress
  `;

  const result = spawnSync(
    "powershell",
    ["-NoProfile", "-NonInteractive", "-Command", ps],
    { encoding: "utf8", windowsHide: true },
  );

  const stdout = (result.stdout || "").trim();
  if (!stdout) return [];
  try {
    const parsed = JSON.parse(stdout);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

/** Live vite dev/preview server processes belonging to this project. */
export function listProjectViteProcesses(projectRoot) {
  return listWindowsProcesses("node.exe").filter((row) =>
    isProjectViteCommandLine(row.CommandLine, projectRoot),
  );
}

/** Kill this project's vite servers; unrelated project tooling survives. */
export function killProjectViteProcesses(projectRoot) {
  let killed = 0;
  for (const row of listProjectViteProcesses(projectRoot)) {
    if (row.ProcessId === process.pid) continue;
    if (killProcessTree(row.ProcessId)) killed += 1;
  }
  return killed;
}

/** Kill Electron windows launched from this project's node_modules. */
export function killProjectElectronProcesses(projectRoot) {
  let killed = 0;
  for (const row of listWindowsProcesses("electron.exe")) {
    if (row.ProcessId === process.pid) continue;
    if (!isProjectElectronPath(row.ExecutablePath, projectRoot)) continue;
    if (killProcessTree(row.ProcessId)) killed += 1;
  }
  return killed;
}

export function isPortListening(targetPort) {
  return findPortListenerPids(targetPort).length > 0;
}
