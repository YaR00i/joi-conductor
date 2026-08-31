import { describe, expect, it } from "vitest";
import {
  CONTRACT_CATALOG,
  CONTRACT_CATEGORY_LABELS,
  getContractDef,
} from "./catalog";

describe("CONTRACT_CATALOG", () => {
  it("keeps unique ids", () => {
    const ids = CONTRACT_CATALOG.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("points media homework at JOI Content, not third-party roulette sites", () => {
    const blob = CONTRACT_CATALOG.map(
      (d) => `${d.nameRu}\n${d.briefRu}\n${d.instructionRu}`,
    ).join("\n");
    expect(blob).not.toMatch(/faproulette\.co/i);
    expect(blob).not.toMatch(/hypnotube\.com/i);
    expect(blob).not.toMatch(/joi\.how/i);
    expect(blob).not.toMatch(/Fap Roulette/i);
    expect(getContractDef("media_faproulette_deny")?.nameRu).toBe(
      "Отказ с экрана",
    );
    expect(getContractDef("media_hypnotube_timer")?.instructionRu).toContain(
      "joidb",
    );
  });

  it("does not put a perform timer on session seals", () => {
    const seal = getContractDef("session_ruin_only");
    expect(seal?.durationHintMin).toBe(5);
    expect(seal?.durationLimitMin).toBeUndefined();
    expect(getContractDef("media_porn_timer")?.durationLimitMin).toBe(25);
  });

  it("uses Russian category labels on the board", () => {
    expect(CONTRACT_CATEGORY_LABELS.oral_cei).toBe("Рот / CEI");
    expect(CONTRACT_CATEGORY_LABELS.session_mod).toBe("Сессия");
  });
});
