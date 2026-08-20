import { describe, expect, it } from "vitest";
import {
  buildQueue,
  clampSessionHeat,
  edgeCapacityForDuration,
  type CatalogSlice,
} from "./conductor";
import type { FunctionDef, SessionParams, ToyDef } from "./types";
import { emptyWallet } from "./wallet";

function makeFn(
  partial: Pick<FunctionDef, "id" | "category" | "modes"> &
    Partial<FunctionDef>,
): FunctionDef {
  return {
    name: partial.id,
    nameRu: partial.id,
    descriptionRu: "",
    intensity: 2,
    hands: "one",
    bodyFocus: ["shaft"],
    requiresToys: [],
    incompatibleWith: [],
    cuesRu: [],
    enabled: true,
    ...partial,
  };
}

function makeCatalog(): CatalogSlice {
  const functions: FunctionDef[] = [
    makeFn({
      id: "stroke_basic",
      category: "stroke",
      modes: ["stroke"],
    }),
    makeFn({
      id: "stroke_slow",
      category: "stroke",
      modes: ["stroke"],
      intensity: 1,
    }),
    makeFn({
      id: "rest_hands_off",
      category: "stroke",
      modes: ["stroke", "anal", "chastity", "onahole", "cbt", "oral"],
      hands: "none",
      intensity: 1,
    }),
    makeFn({
      id: "finale_roulette",
      category: "stroke",
      modes: ["stroke"],
      intensity: 3,
    }),
    // Gated until bought — must not appear with empty unlocks.
    makeFn({
      id: "plapping",
      category: "stroke",
      modes: ["stroke", "plapping"],
      intensity: 3,
    }),
  ];

  const patterns = [
    {
      id: "meter_4_4",
      name: "4/4",
      nameRu: "4/4",
      descriptionRu: "",
      kind: "meter" as const,
      steps: [1, 1, 1, 1],
      cuesRu: [],
      enabled: true,
    },
    {
      id: "vibe_timeline",
      name: "vibe",
      nameRu: "vibe",
      descriptionRu: "",
      kind: "special" as const,
      cuesRu: [],
      enabled: true,
    },
  ];

  const toys: ToyDef[] = [
    {
      id: "hands",
      nameRu: "Руки",
      descriptionRu: "",
      owned: true,
      tags: [],
    },
  ];

  return { functions, patterns, toys };
}

function baseParams(over: Partial<SessionParams> = {}): SessionParams {
  return {
    durationSec: 600,
    mode: "stroke",
    edgesTarget: 3,
    ruinsTarget: 1,
    pCum: 0.4,
    pRuin: 0.2,
    finishId: "full",
    cumplayId: "none",
    bpmMin: 60,
    bpmMax: 100,
    blockSecMin: 40,
    blockSecMax: 55,
    allowedFunctionIds: [],
    allowedPatternIds: [],
    ...over,
  };
}

describe("clampSessionHeat / edgeCapacityForDuration", () => {
  it("clamps non-finite and negative heat to 0", () => {
    expect(clampSessionHeat(Number.NaN)).toBe(0);
    expect(clampSessionHeat(-1)).toBe(0);
    expect(clampSessionHeat(0)).toBe(0);
  });

  it("caps heat at 1.35", () => {
    expect(clampSessionHeat(2)).toBe(1.35);
    expect(clampSessionHeat(0.5)).toBe(0.5);
  });

  it("estimates non-negative edge capacity from duration", () => {
    expect(edgeCapacityForDuration(90, 40, 55)).toBe(0);
    expect(edgeCapacityForDuration(600, 40, 55)).toBeGreaterThan(0);
  });
});

describe("buildQueue", () => {
  const catalog = makeCatalog();
  const seed = 42_001;

  it("returns a non-empty queue ending with finale", () => {
    const queue = buildQueue(baseParams(), catalog, seed);
    expect(queue.length).toBeGreaterThan(2);
    expect(queue.at(-1)?.goal).toBe("finale");
    expect(queue.every((b) => b.durationSec > 0)).toBe(true);
    expect(queue.every((b) => typeof b.id === "string" && b.id.length > 0)).toBe(
      true,
    );
  });

  it("is deterministic for the same seed", () => {
    const a = buildQueue(baseParams(), catalog, seed);
    const b = buildQueue(baseParams(), catalog, seed);
    expect(a.map((x) => `${x.goal}:${x.functionId}:${x.durationSec}`)).toEqual(
      b.map((x) => `${x.goal}:${x.functionId}:${x.durationSec}`),
    );
  });

  it("covers at least durationSec before the finale block", () => {
    const params = baseParams({ durationSec: 480 });
    const queue = buildQueue(params, catalog, seed);
    const beforeFinale = queue.slice(0, -1);
    const planned = beforeFinale.reduce((s, b) => s + b.durationSec, 0);
    expect(planned).toBeGreaterThanOrEqual(params.durationSec);
  });

  it("places at least one edge when edgesTarget > 0 and duration allows", () => {
    const queue = buildQueue(
      baseParams({ edgesTarget: 4, ruinsTarget: 0, durationSec: 720 }),
      catalog,
      seed,
    );
    const edges = queue.filter((b) => b.goal === "edge").length;
    expect(edges).toBeGreaterThanOrEqual(1);
  });

  it("never queues gated functions without unlocks", () => {
    const unlocks = emptyWallet().unlocks;
    const queue = buildQueue(baseParams(), catalog, seed, { unlocks });
    expect(queue.some((b) => b.functionId === "plapping")).toBe(false);
  });

  it("respects allowedFunctionIds whitelist (plus unlocked merge path)", () => {
    const queue = buildQueue(
      baseParams({
        allowedFunctionIds: ["stroke_basic", "rest_hands_off", "finale_roulette"],
      }),
      catalog,
      seed,
    );
    const midIds = new Set(
      queue
        .filter((b) => b.goal !== "finale")
        .map((b) => b.functionId),
    );
    expect(midIds.has("stroke_slow")).toBe(false);
    expect(midIds.has("stroke_basic") || midIds.has("rest_hands_off")).toBe(
      true,
    );
  });

  it("throws when no compatible functions remain", () => {
    const emptyFns: CatalogSlice = {
      ...catalog,
      functions: catalog.functions.map((f) => ({ ...f, enabled: false })),
    };
    expect(() => buildQueue(baseParams(), emptyFns, seed)).toThrow(
      /No compatible functions/,
    );
  });

  it("queues vibe blocks when a wand or vibe bullet is equipped", () => {
    const vibeCatalog: CatalogSlice = {
      functions: [
        ...catalog.functions,
        makeFn({
          id: "hands_off_vibe",
          category: "vibe",
          modes: ["stroke", "chastity"],
          drive: "vibe",
          requiresToys: ["wand"],
          intensity: 3,
        }),
      ],
      patterns: catalog.patterns,
      toys: [
        ...catalog.toys,
        {
          id: "vibe_bullet",
          nameRu: "Вибропуля",
          descriptionRu: "",
          owned: true,
          tags: ["vibe"],
          satisfies: ["wand", "external_vibe"],
        },
      ],
    };
    const unlocks = {
      ...emptyWallet().unlocks,
      functionIds: ["hands_off_vibe"],
    };
    const without = buildQueue(
      baseParams({
        allowedToyIds: ["vibe_bullet"],
        allowedFunctionIds: ["hands_off_vibe", "rest_hands_off"],
      }),
      vibeCatalog,
      seed,
      { unlocks },
    );
    expect(without.some((b) => b.drive === "vibe")).toBe(false);

    const withBullet = buildQueue(
      baseParams({
        allowedToyIds: ["vibe_bullet"],
        allowedFunctionIds: ["hands_off_vibe", "rest_hands_off"],
      }),
      vibeCatalog,
      seed,
      { unlocks, equippedToyIds: ["vibe_bullet"] },
    );
    expect(withBullet.some((b) => b.functionId === "hands_off_vibe")).toBe(
      true,
    );
    expect(withBullet.some((b) => b.drive === "vibe")).toBe(true);
  });
});
