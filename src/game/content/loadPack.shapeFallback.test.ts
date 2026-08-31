import { beforeEach, describe, expect, it, vi } from "vitest";
import { listEmberDir, readEmberJson } from "./io";

vi.mock("./io", () => ({
  readEmberJson: vi.fn(),
  listEmberDir: vi.fn(),
}));

import { loadEmberPack } from "./loadPack";

const META = {
  id: "ember",
  version: 1,
  nameRu: "Ember",
  defaultStageId: "hu_tao_p1",
};

/** Mock io so only files explicitly listed exist; everything else 404s. */
function mockPackFiles(files: Record<string, unknown>): void {
  vi.mocked(readEmberJson).mockImplementation(async (rel: string) => {
    if (rel in files) {
      return { ok: true as const, data: files[rel], source: "fetch" as const };
    }
    return { ok: false as const, error: `ember ${rel}: 404 not found` };
  });
  vi.mocked(listEmberDir).mockImplementation(async () => ({
    ok: true as const,
    data: [] as string[],
    source: "fetch" as const,
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPackFiles({ "pack.json": META });
});

describe("loadEmberPack shape fallback", () => {
  it("degrades a wrong-shape weapons.json instead of throwing", async () => {
    mockPackFiles({ "pack.json": META, "weapons.json": {} });
    const { pack, issues } = await loadEmberPack();
    expect(pack.weapons).toEqual({});
    const issue = issues.find((i) => i.path === "weapons.json");
    expect(issue?.level).toBe("error");
    expect(issue?.message).toContain("Структура файла");
  });

  it("survives a null portraits registry without an undefined key", async () => {
    mockPackFiles({ "pack.json": META, "portraits/hu_tao/registry.json": null });
    const { pack, issues } = await loadEmberPack();
    expect(Object.keys(pack.portraits)).toEqual(["hu_tao"]);
    expect(pack.portraits.hu_tao).toEqual({ mistressId: "hu_tao", expressions: {} });
    expect(issues.some((i) => i.path === "portraits/hu_tao/registry.json")).toBe(true);
  });

  it("degrades a broken pool to an empty pool with its stable id", async () => {
    mockPackFiles({ "pack.json": META, "pools/p1_weapons.json": null });
    const { pack, issues } = await loadEmberPack();
    expect(pack.pools.p1_weapons).toEqual({ id: "p1_weapons", entries: [] });
    expect(issues.some((i) => i.path === "pools/p1_weapons.json")).toBe(true);
  });

  it("passes a correctly shaped catalog through without an issue", async () => {
    mockPackFiles({
      "pack.json": META,
      "weapons.json": { weapons: [] },
      "pools/p1_weapons.json": { id: "p1_weapons", entries: [] },
    });
    const { issues } = await loadEmberPack();
    expect(issues.some((i) => i.path === "weapons.json")).toBe(false);
    expect(issues.some((i) => i.path === "pools/p1_weapons.json")).toBe(false);
  });

  it("keeps loading the pack when a core file is missing entirely", async () => {
    const { pack, issues } = await loadEmberPack();
    expect(pack.meta).toEqual(META);
    expect(pack.weapons).toEqual({});
    const issue = issues.find((i) => i.path === "weapons.json");
    expect(issue?.level).toBe("error");
    expect(issue?.message).toContain("не загружен");
  });
});
