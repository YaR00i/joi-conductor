import { describe, expect, it, vi } from "vitest";
import type { EmberVoxelModel } from "../content/types";

const h = vi.hoisted(() => ({
  log: [] as string[],
  gate: null as null | Promise<void>,
}));

vi.mock("../content/io", () => ({
  deleteEmberFile: async (rel: string) => {
    h.log.push(`del:${rel}`);
    return { ok: true as const };
  },
  readEmberBytes: async (rel: string) => {
    h.log.push(`voxread:${rel}`);
    return { ok: false as const, error: "404" };
  },
  readEmberJsonFromDisk: async (rel: string) => {
    h.log.push(`read:${rel}`);
    return { ok: false as const, error: "404" };
  },
  writeEmberBytes: async (rel: string) => {
    h.log.push(`vox:${rel}`);
    return { ok: true as const, data: true, source: "electron" as const };
  },
  writeEmberJson: async (rel: string) => {
    h.log.push(`json:${rel}`);
    const gate = h.gate;
    if (gate) {
      h.gate = null;
      await gate;
    }
    return { ok: true as const, data: true, source: "electron" as const };
  },
}));

import { writeVoxelRegistry } from "./voxelRegistry";

function model(id: string, mark: number): EmberVoxelModel {
  return {
    id,
    sizeBlocks: { x: 1, y: 1, z: 1 },
    palette: ["", "#fff"],
    voxels: [mark],
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("writeVoxelRegistry serialization", () => {
  it("runs the second save only after the first cycle finished", async () => {
    let releaseGate: (() => void) | undefined;
    h.gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });

    const first = writeVoxelRegistry(
      { a: model("a", 1) },
      {},
      { dirtyIds: ["a"] },
    );
    await flush();
    // First save suspended inside its json write on the gate.
    expect(h.log.filter((e) => e.startsWith("read:")).length).toBe(1);

    const second = writeVoxelRegistry(
      { a: model("a", 2) },
      {},
      { dirtyIds: ["a"] },
    );
    await flush();
    // The queued save must not read disk before the running one has written.
    expect(h.log.filter((e) => e.startsWith("read:")).length).toBe(1);

    releaseGate?.();
    const [a, b] = await Promise.all([first, second]);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);

    const reads = h.log.map((e, i) => ({ e, i })).filter((x) => x.e.startsWith("read:"));
    const firstJson = h.log.findIndex((e) => e.startsWith("json:"));
    expect(reads.length).toBe(2);
    // First cycle's json write precedes the second cycle's disk read.
    expect(firstJson).toBeGreaterThanOrEqual(0);
    expect(firstJson).toBeLessThan(reads[1].i);
  });
});
