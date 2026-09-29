import { getContractDef } from "./catalog";
import {
  canonicalSeriesDef,
  coerceSeriesTheme,
  emptySeriesDaySpec,
  expectedSeriesLength,
  resizeSeriesDays,
  SERIES_THEMES,
  type ContractSeriesDef,
  type ContractSeriesDaySpec,
  type ContractSeriesPeriodKind,
  type ContractSeriesTheme,
} from "./seriesCatalog";
import { restrictOverridesToDef } from "./seriesParams";

export type SeriesEditorDraft = {
  id: string;
  nameRu: string;
  descriptionRu: string;
  periodKind: ContractSeriesPeriodKind;
  theme: ContractSeriesTheme;
  days: ContractSeriesDaySpec[];
  clonedFrom?: string;
};

export function emptySeriesDraft(
  periodKind: ContractSeriesPeriodKind = "week",
): SeriesEditorDraft {
  const n = expectedSeriesLength(periodKind);
  return {
    id: "",
    nameRu: "",
    descriptionRu: "",
    periodKind,
    theme: SERIES_THEMES[0] ?? { id: "edge_control", labelRu: "Контроль возбуждения" },
    days: Array.from({ length: n }, () => emptySeriesDaySpec()),
  };
}

export function draftFromSeriesDef(def: ContractSeriesDef): SeriesEditorDraft {
  const theme =
    def.theme?.labelRu || def.theme?.id
      ? def.theme
      : SERIES_THEMES[0]!;
  return {
    id: def.id,
    nameRu: def.nameRu,
    descriptionRu: def.descriptionRu,
    periodKind: def.periodKind,
    theme: coerceSeriesTheme(theme),
    days: resizeSeriesDays(def.days ?? [], def.periodKind),
    clonedFrom:
      "clonedFrom" in def
        ? (def as { clonedFrom?: string }).clonedFrom
        : undefined,
  };
}

export function payloadFromSeriesDraft(draft: SeriesEditorDraft): ContractSeriesDef {
  return canonicalSeriesDef({
    id: draft.id,
    periodKind: draft.periodKind,
    nameRu: draft.nameRu.trim(),
    descriptionRu: draft.descriptionRu.trim(),
    theme: {
      id: draft.theme.id.trim() || "custom",
      labelRu: draft.theme.labelRu.trim(),
    },
    days: resizeSeriesDays(draft.days, draft.periodKind).map((d) => {
      const child = getContractDef(d.contractDefId);
      const paramOverrides = restrictOverridesToDef(child, d.paramOverrides);
      return paramOverrides
        ? {
            contractDefId: d.contractDefId,
            intensity: d.intensity,
            paramOverrides,
          }
        : { contractDefId: d.contractDefId, intensity: d.intensity };
    }),
  });
}

export function patchSeriesDay(
  days: ContractSeriesDaySpec[],
  index: number,
  patch: Partial<ContractSeriesDaySpec>,
): ContractSeriesDaySpec[] {
  const next = days.slice();
  const prev = next[index] ?? emptySeriesDaySpec();
  const merged: ContractSeriesDaySpec = {
    contractDefId: patch.contractDefId ?? prev.contractDefId,
    intensity: patch.intensity ?? prev.intensity,
    paramOverrides:
      patch.paramOverrides !== undefined
        ? patch.paramOverrides
        : prev.paramOverrides,
  };
  if (patch.contractDefId && patch.contractDefId !== prev.contractDefId) {
    const child = getContractDef(patch.contractDefId);
    merged.paramOverrides = restrictOverridesToDef(child, merged.paramOverrides);
  }
  next[index] = merged.paramOverrides
    ? merged
    : { contractDefId: merged.contractDefId, intensity: merged.intensity };
  return next;
}
