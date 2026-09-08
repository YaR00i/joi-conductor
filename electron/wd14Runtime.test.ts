import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  WD14_ONNX_URLS,
  WD14_TAGS_URLS,
  wd14ModelsReady,
} from "./wd14Runtime.mjs";

describe("wd14ModelsReady", () => {
  it("needs onnx + selected_tags.csv", () => {
    const dir = path.join(os.tmpdir(), `wd14-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    try {
      expect(wd14ModelsReady(dir)).toBe(false);
      writeFileSync(path.join(dir, "model.onnx"), "");
      expect(wd14ModelsReady(dir)).toBe(false);
      writeFileSync(path.join(dir, "selected_tags.csv"), "tag\n");
      expect(wd14ModelsReady(dir)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("WD14 download URLs", () => {
  it("uses the public v2 repo, not the gated v1 onnx name", () => {
    expect(WD14_ONNX_URLS[0]).toContain("wd-v1-4-moat-tagger-v2");
    expect(WD14_ONNX_URLS[0]).toContain("model.onnx");
    expect(WD14_ONNX_URLS[0]).not.toContain("wd-v1-4-moat-tagger.onnx");
    expect(WD14_TAGS_URLS[0]).toContain("selected_tags.csv");
  });
});
