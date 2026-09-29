import { describe, expect, it } from "vitest";
import { getContractDef } from "./catalog";
import {
  BUILTIN_SERIES_CATALOG,
  coerceSeriesDefinition,
  expectedSeriesLength,
  seriesDayDefIds,
  validateSeriesDef,
} from "./seriesCatalog";
import { meanIntensity } from "./seriesProgression";

describe("seriesCatalog", () => {
  it("ships themed 7-day and 30-day builtins from existing defs", () => {
    const week = BUILTIN_SERIES_CATALOG.find((s) => s.periodKind === "week");
    const month = BUILTIN_SERIES_CATALOG.find((s) => s.periodKind === "month");
    expect(week?.days).toHaveLength(7);
    expect(month?.days).toHaveLength(30);
    expect(week?.theme.id).toBe("edge_control");
    expect(month?.theme.id).toBe("edge_control");
    expect(week?.nameRu).toMatch(/контрол/i);
    expect(month?.nameRu).toMatch(/контрол/i);
    for (const series of BUILTIN_SERIES_CATALOG) {
      expect(series.days).toHaveLength(expectedSeriesLength(series.periodKind));
      expect(seriesDayDefIds(series).every((id) => getContractDef(id)?.id === id)).toBe(
        true,
      );
      const valid = validateSeriesDef(series);
      expect(valid.ok).toBe(true);
      expect(valid.warnings).toEqual([]);
      const third = Math.max(1, Math.floor(series.days.length / 3));
      expect(
        meanIntensity(series.days.slice(series.days.length - third)),
      ).toBeGreaterThan(meanIntensity(series.days.slice(0, third)));
      expect(new Set(series.days.map((d) => d.intensity)).size).toBeGreaterThan(1);
    }
  });

  it("rejects wrong length, unknown child ids and empty name", () => {
    const week = BUILTIN_SERIES_CATALOG[0]!;
    expect(
      validateSeriesDef({ ...week, days: week.days.slice(0, 3) }).ok,
    ).toBe(false);
    expect(
      validateSeriesDef({
        ...week,
        days: week.days.map((d, i) =>
          i === 0 ? { ...d, contractDefId: "nope" } : d,
        ),
      }).errors.some((e) => e.includes("неизвестный")),
    ).toBe(true);
    expect(validateSeriesDef({ ...week, nameRu: "" }).ok).toBe(false);
    expect(validateSeriesDef({ ...week, theme: { id: "", labelRu: "" } }).ok).toBe(
      false,
    );
  });

  it("coerces legacy dayDefIds into days with default intensity", () => {
    const week = BUILTIN_SERIES_CATALOG[0]!;
    const coerced = coerceSeriesDefinition({
      id: "user_series_legacy",
      periodKind: "week",
      nameRu: "Старая",
      descriptionRu: "Было списком id",
      dayDefIds: seriesDayDefIds(week),
    });
    expect(coerced?.days).toHaveLength(7);
    expect(coerced?.days.every((d) => d.intensity === 3)).toBe(true);
    expect(coerced?.theme.labelRu).toBeTruthy();
    expect(coerced?.dayDefIds).toBeUndefined();
  });

  it("treats equal intensity as a warning, not a hard error", () => {
    const week = BUILTIN_SERIES_CATALOG[0]!;
    const flat = {
      ...week,
      days: week.days.map((d) => ({ ...d, intensity: 3 as const })),
    };
    const valid = validateSeriesDef(flat);
    expect(valid.ok).toBe(true);
    expect(valid.warnings.some((w) => w.includes("одинаковая"))).toBe(true);
  });
});
