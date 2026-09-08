import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  locatePortablePython,
  portablePythonNupkgFallbackUrl,
  portablePythonNugetUrl,
  PORTABLE_PYTHON_VERSION,
} from "./pythonRuntime.mjs";

describe("portablePythonNugetUrl", () => {
  it("picks the Windows NuGet package", () => {
    expect(portablePythonNugetUrl("win32", "x64")).toBe(
      `https://www.nuget.org/api/v2/package/python/${PORTABLE_PYTHON_VERSION}`,
    );
    expect(portablePythonNugetUrl("win32", "arm64")).toBe(
      `https://www.nuget.org/api/v2/package/pythonarm64/${PORTABLE_PYTHON_VERSION}`,
    );
    expect(portablePythonNugetUrl("linux", "x64")).toBeNull();
  });

  it("has a NuGet CDN fallback", () => {
    expect(portablePythonNupkgFallbackUrl("win32", "x64")).toBe(
      `https://globalcdn.nuget.org/packages/python.${PORTABLE_PYTHON_VERSION}.nupkg`,
    );
  });
});

describe("locatePortablePython", () => {
  it("prefers tools/python.exe from the NuGet layout", () => {
    const root = path.join(os.tmpdir(), `py-loc-${Date.now()}`);
    const tools = path.join(root, "tools");
    mkdirSync(tools, { recursive: true });
    const exe = path.join(tools, "python.exe");
    writeFileSync(exe, "");
    writeFileSync(path.join(root, "python.exe"), "");
    try {
      expect(locatePortablePython(root, "win32")).toBe(exe);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns null when missing", () => {
    expect(
      locatePortablePython(path.join(os.tmpdir(), "no-such-python"), "win32"),
    ).toBe(null);
  });
});
