import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { wd14ModelsReady } from "./wd14Runtime.mjs";

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
