import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  extraReqPath,
  ffmpegLooksReady,
  isSovitsRepo,
  pretrainedLooksReady,
  requirementsPath,
  sovitsRepoDir,
  sovitsUserDataRoot,
  sovitsVenvDir,
} from "./sovitsPaths.mjs";

describe("sovitsPaths", () => {
  it("nests repo and venv under userData/gpt-sovits", () => {
    const root = "C:/data/joi";
    expect(sovitsUserDataRoot(root).replace(/\\/g, "/")).toBe(
      "C:/data/joi/gpt-sovits",
    );
    expect(sovitsRepoDir(root).replace(/\\/g, "/")).toBe(
      "C:/data/joi/gpt-sovits/repo",
    );
    expect(sovitsVenvDir(root).replace(/\\/g, "/")).toBe(
      "C:/data/joi/gpt-sovits/venv",
    );
  });

  it("detects api_v2.py and pretrained markers", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "gsv-"));
    try {
      expect(isSovitsRepo(dir)).toBe(false);
      expect(pretrainedLooksReady(dir)).toBe(false);
      writeFileSync(path.join(dir, "api_v2.py"), "# stub\n");
      writeFileSync(path.join(dir, "extra-req.txt"), "x\n");
      writeFileSync(path.join(dir, "requirements.txt"), "y\n");
      expect(isSovitsRepo(dir)).toBe(true);
      expect(extraReqPath(dir).endsWith("extra-req.txt")).toBe(true);
      expect(requirementsPath(dir).endsWith("requirements.txt")).toBe(true);

      const pre = path.join(dir, "GPT_SoVITS", "pretrained_models", "sv");
      mkdirSync(pre, { recursive: true });
      writeFileSync(path.join(pre, "dummy.ckpt"), "");
      expect(pretrainedLooksReady(dir)).toBe(true);

      writeFileSync(path.join(dir, "ffmpeg.exe"), "");
      expect(ffmpegLooksReady(dir, "win32")).toBe(true);
      expect(ffmpegLooksReady(dir, "linux")).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
