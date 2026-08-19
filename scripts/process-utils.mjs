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

/** Kill node.exe processes tied to this project. */
export function killProjectNodeProcesses(projectRoot) {
  if (process.platform !== "win32") return 0;

  const marker = projectRoot.replace(/\\/g, "\\\\");
  const ps = `
    $root = '${marker}'
    Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
      Where-Object { $_.CommandLine -and $_.CommandLine -like "*$root*" } |
      ForEach-Object { $_.ProcessId }
  `;

  const result = spawnSync(
    "powershell",
    ["-NoProfile", "-NonInteractive", "-Command", ps],
    { encoding: "utf8", windowsHide: true },
  );

  const pids = (result.stdout || "")
    .split(/\r?\n/)
    .map((line) => Number(line.trim()))
    .filter((pid) => Number.isFinite(pid) && pid > 0 && pid !== process.pid);

  let killed = 0;
  for (const pid of pids) {
    if (killProcessTree(pid)) killed += 1;
  }
  return killed;
}

export function isPortListening(targetPort) {
  return findPortListenerPids(targetPort).length > 0;
}
