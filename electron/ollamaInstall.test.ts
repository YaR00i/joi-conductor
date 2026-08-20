import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  locateOllamaExe,
  ollamaReleaseAsset,
  ollamaReleaseUrl,
} from "./ollamaRuntime.mjs";

describe("ollamaReleaseAsset", () => {
  it("picks the official Windows zip", () => {
    expect(ollamaReleaseAsset("win32", "x64")).toBe("ollama-windows-amd64.zip");
    expect(ollamaReleaseAsset("win32", "arm64")).toBe(
      "ollama-windows-arm64.zip",
    );
    expect(ollamaReleaseAsset("linux", "x64")).toBeNull();
    expect(ollamaReleaseUrl("win32", "x64")).toBe(
      "https://github.com/ollama/ollama/releases/latest/download/ollama-windows-amd64.zip",
    );
  });
});

describe("locateOllamaExe", () => {
  it("finds ollama.exe a couple of folders down", () => {
    const root = path.join(os.tmpdir(), `ollama-loc-${Date.now()}`);
    const nested = path.join(root, "bin", "inner");
    mkdirSync(nested, { recursive: true });
    const exe = path.join(nested, "ollama.exe");
    writeFileSync(exe, "");
    try {
      expect(locateOllamaExe(root, "win32")).toBe(exe);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns null when missing", () => {
    expect(locateOllamaExe(path.join(os.tmpdir(), "no-such-ollama"), "win32")).toBe(
      null,
    );
  });
});
