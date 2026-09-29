import { beforeEach, describe, expect, it } from "vitest";
import {
  installLocalStorageMock,
  resetLocalStorage,
} from "../../test/localStorageMock";
import { BUILTIN_SERIES_CATALOG, seriesDayDefIds } from "./seriesCatalog";
import {
  duplicateToUserSeries,
  exportUserSeriesJson,
  importUserSeriesJson,
  listEditorSeries,
  restoreBuiltinSeriesOverride,
  upsertUserSeriesOverride,
} from "./userSeriesCatalog";
import { seriesOfferCards } from "./contractSeriesView";

installLocalStorageMock();

beforeEach(() => {
  resetLocalStorage();
});

describe("userSeriesCatalog", () => {
  it("overrides a builtin without dropping new fields on export/import", () => {
    const src = BUILTIN_SERIES_CATALOG[0]!;
    upsertUserSeriesOverride({
      ...src,
      nameRu: "Неделя · правка",
      clonedFrom: src.id,
    });
    const json = exportUserSeriesJson();
    expect(json).toContain("Неделя · правка");
    expect(json).toContain("periodKind");
    resetLocalStorage();
    const res = importUserSeriesJson(json, "merge");
    expect(res.imported).toBeGreaterThan(0);
    const row = listEditorSeries().find((r) => r.id === src.id);
    expect(row?.origin).toBe("override");
    expect(row?.def.nameRu).toBe("Неделя · правка");
    expect(row?.def.days).toEqual(src.days);
    expect(restoreBuiltinSeriesOverride(src.id)).toBe(true);
    expect(listEditorSeries().find((r) => r.id === src.id)?.origin).toBe(
      "builtin",
    );
  });

  it("skips broken records and duplicates as a new user series", () => {
    const res = importUserSeriesJson(
      JSON.stringify({
        version: 1,
        series: [{ nope: true }, { id: "user_series_ok", nameRu: "Ок", periodKind: "week", dayDefIds: [] }],
      }),
    );
    expect(res.imported).toBe(1);
    expect(res.skipped).toBe(1);
    const copy = duplicateToUserSeries(BUILTIN_SERIES_CATALOG[0]!);
    expect(copy.id.startsWith("user_series_")).toBe(true);
    expect(copy.nameRu).toContain("копия");
  });

  it("imports legacy dayDefIds JSON and lists a user preset in the start catalog", () => {
    const src = BUILTIN_SERIES_CATALOG[0]!;
    const res = importUserSeriesJson(
      JSON.stringify({
        version: 1,
        series: [
          {
            id: "user_series_theme",
            nameRu: "Мой контроль",
            descriptionRu: "Свой пресет",
            periodKind: "week",
            theme: { id: "edge_control", labelRu: "Контроль возбуждения" },
            dayDefIds: seriesDayDefIds(src),
          },
        ],
      }),
    );
    expect(res.imported).toBe(1);
    const row = listEditorSeries().find((r) => r.id === "user_series_theme");
    expect(row?.def.days).toHaveLength(7);
    expect(row?.origin).toBe("user");
    const offers = seriesOfferCards();
    expect(offers.some((o) => o.defId === "user_series_theme")).toBe(true);
  });
});
