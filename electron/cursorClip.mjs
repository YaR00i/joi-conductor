import { spawn, spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/** @type {import("node:child_process").ChildProcessWithoutNullStreams | null} */
let helper = null;
/** @type {import("electron").BrowserWindow | null} */
let lastWin = null;
let grabActive = false;

const HELPER_CS = `using System;
using System.Runtime.InteropServices;
internal static class Program {
  [StructLayout(LayoutKind.Sequential)]
  private struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [StructLayout(LayoutKind.Sequential)]
  private struct POINT { public int X; public int Y; }
  [DllImport("user32.dll")] private static extern bool ClipCursor(ref RECT rect);
  [DllImport("user32.dll")] private static extern bool ClipCursor(IntPtr rect);
  [DllImport("user32.dll")] private static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] private static extern bool GetClientRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")] private static extern bool ClientToScreen(IntPtr hWnd, ref POINT lpPoint);
  private static bool ClipHwnd(IntPtr h) {
    RECT rc;
    if (!GetClientRect(h, out rc)) return false;
    POINT ul = new POINT { X = rc.Left, Y = rc.Top };
    POINT lr = new POINT { X = rc.Right, Y = rc.Bottom };
    if (!ClientToScreen(h, ref ul) || !ClientToScreen(h, ref lr)) return false;
    RECT clip = new RECT { Left = ul.X, Top = ul.Y, Right = lr.X, Bottom = lr.Y };
    return ClipCursor(ref clip);
  }
  private static bool WarpCenter(IntPtr h) {
    RECT rc;
    if (!GetClientRect(h, out rc)) return false;
    POINT c = new POINT { X = (rc.Left + rc.Right) / 2, Y = (rc.Top + rc.Bottom) / 2 };
    if (!ClientToScreen(h, ref c)) return false;
    return SetCursorPos(c.X, c.Y);
  }
  private static int Main() {
    string line;
    while ((line = Console.ReadLine()) != null) {
      line = line.Trim();
      if (line.Length == 0) continue;
      string[] p = line.Split(' ');
      string cmd = p[0];
      if (cmd == "quit") break;
      if (cmd == "unclip") ClipCursor(IntPtr.Zero);
      else if (cmd == "cliphwnd" && p.Length >= 2)
        ClipHwnd(new IntPtr(long.Parse(p[1])));
      else if (cmd == "warpcenter" && p.Length >= 2)
        WarpCenter(new IntPtr(long.Parse(p[1])));
    }
    ClipCursor(IntPtr.Zero);
    return 0;
  }
}
`;

export function contentCssToDipRect(contentBounds, css, inset = 0) {
  const width = Math.max(0, Math.round(css.width) - inset * 2);
  const height = Math.max(0, Math.round(css.height) - inset * 2);
  if (width < 8 || height < 8) return null;
  return {
    x: Math.round(contentBounds.x + css.left + inset),
    y: Math.round(contentBounds.y + css.top + inset),
    width,
    height,
  };
}

export function nativeHandleToHwnd(handle) {
  if (handle == null) return 0n;
  if (typeof handle === "bigint") return handle;
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(handle)) {
    if (handle.length >= 8) return handle.readBigUInt64LE(0);
    if (handle.length >= 4) return BigInt(handle.readUInt32LE(0));
  }
  return 0n;
}

function cscPath() {
  const root = process.env.WINDIR || "C:\\Windows";
  const x64 = path.join(
    root,
    "Microsoft.NET",
    "Framework64",
    "v4.0.30319",
    "csc.exe",
  );
  if (existsSync(x64)) return x64;
  const x86 = path.join(
    root,
    "Microsoft.NET",
    "Framework",
    "v4.0.30319",
    "csc.exe",
  );
  return existsSync(x86) ? x86 : null;
}

function helperExePath() {
  return path.join(os.tmpdir(), "joi-conductor-cursor-grab-v2.exe");
}

function ensureHelperExe() {
  const exe = helperExePath();
  if (existsSync(exe)) return exe;
  const csc = cscPath();
  if (!csc) return null;
  const cs = path.join(os.tmpdir(), "joi-conductor-cursor-grab-v2.cs");
  writeFileSync(cs, HELPER_CS, "utf8");
  const built = spawnSync(csc, ["/nologo", "/t:exe", `/out:${exe}`, cs], {
    windowsHide: true,
    encoding: "utf8",
  });
  return built.status === 0 && existsSync(exe) ? exe : null;
}

function ignoreClosedPipe(stream) {
  if (!stream || typeof stream.on !== "function") return;
  stream.on("error", () => {
    /* EPIPE / destroyed pipe while quitting the grab helper */
  });
}

function ensureHelper() {
  if (process.platform !== "win32") return null;
  if (helper && !helper.killed && helper.stdin && !helper.stdin.destroyed) {
    return helper;
  }
  const exe = ensureHelperExe();
  if (!exe) return null;
  helper = spawn(exe, [], {
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
  helper.stdin.setDefaultEncoding("utf8");
  ignoreClosedPipe(helper);
  ignoreClosedPipe(helper.stdin);
  ignoreClosedPipe(helper.stdout);
  ignoreClosedPipe(helper.stderr);
  helper.stdout?.resume();
  helper.stderr?.resume();
  helper.on("exit", () => {
    helper = null;
  });
  return helper;
}

function hwndOf(win) {
  try {
    return nativeHandleToHwnd(win.getNativeWindowHandle());
  } catch {
    return 0n;
  }
}

function sendCmd(line, startIfMissing = false) {
  const proc = startIfMissing ? ensureHelper() : helper;
  const stdin = proc?.stdin;
  if (!proc || proc.killed || !stdin || stdin.destroyed || !stdin.writable) {
    return false;
  }
  try {
    return stdin.write(`${line}\n`);
  } catch {
    return false;
  }
}

export function releaseCursorClip() {
  grabActive = false;
  lastWin = null;
  sendCmd("unclip");
  return { ok: true };
}

export function applyCursorClip(win) {
  if (!win || win.isDestroyed?.()) return releaseCursorClip();
  lastWin = win;
  grabActive = true;
  const hwnd = hwndOf(win);
  if (!hwnd) return { ok: process.platform !== "win32" };
  const ok =
    sendCmd(`cliphwnd ${hwnd}`, true) && sendCmd(`warpcenter ${hwnd}`);
  return { ok: ok || process.platform !== "win32" };
}

export function warpCursorToWindow(win = lastWin) {
  const target = win && !win.isDestroyed?.() ? win : lastWin;
  if (!target || target.isDestroyed?.()) return { ok: false };
  const hwnd = hwndOf(target);
  if (!hwnd) return { ok: false };
  return { ok: sendCmd(`warpcenter ${hwnd}`, true) };
}

export function reapplyCursorClip() {
  if (!grabActive || !lastWin) return { ok: false };
  return applyCursorClip(lastWin);
}

export function stopCursorGrab() {
  grabActive = false;
  lastWin = null;
  const proc = helper;
  helper = null;
  if (!proc) return;
  const stdin = proc.stdin;
  if (stdin && !stdin.destroyed) {
    ignoreClosedPipe(stdin);
    try {
      stdin.end();
    } catch {
      try {
        stdin.destroy();
      } catch {
        /* already gone */
      }
    }
  }
  try {
    proc.kill();
  } catch {
    /* already gone */
  }
}
