import { getContractDef, type ContractDef } from "./catalog";
import { contractRng } from "./contractTime";
import { fillContractTemplate } from "./contractInstantiate";
import { coerceIntensity, type ContractSeriesDef, type ContractSeriesIntensity } from "./seriesCatalog";
import { resolveSeriesDayParams } from "./seriesParams";

export type SeriesDaySnapshot = {
  dayIndex: number;
  contractDefId: string;
  intensity: ContractSeriesIntensity;
  resolvedParams: Record<string, string | number>;
  titleRu: string;
  bodyRu: string;
};

export function seriesDayRngSeed(
  seriesInstanceId: string,
  dayIndex: number,
): string {
  return `${seriesInstanceId}|d${dayIndex}`;
}

export function buildSeriesSnapshot(
  def: ContractSeriesDef,
  seriesInstanceId: string,
  lookup: (id: string) => ContractDef | undefined = getContractDef,
): SeriesDaySnapshot[] {
  return def.days.map((spec, dayIndex) => {
    const child = lookup(spec.contractDefId);
    const rng = contractRng(seriesDayRngSeed(seriesInstanceId, dayIndex));
    const resolvedParams = child
      ? resolveSeriesDayParams(child, spec, rng)
      : {};
    return {
      dayIndex,
      contractDefId: spec.contractDefId,
      intensity: spec.intensity,
      resolvedParams,
      titleRu: child?.nameRu ?? spec.contractDefId,
      bodyRu: child
        ? fillContractTemplate(child.instructionRu, resolvedParams)
        : "",
    };
  });
}

export function coerceSeriesSnapshot(raw: unknown): SeriesDaySnapshot[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: SeriesDaySnapshot[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") return undefined;
    const r = row as Record<string, unknown>;
    if (typeof r.dayIndex !== "number" || typeof r.contractDefId !== "string") {
      return undefined;
    }
    const intensity = coerceIntensity(r.intensity);
    if (!intensity) return undefined;
    const resolvedParams: Record<string, string | number> = {};
    if (r.resolvedParams && typeof r.resolvedParams === "object") {
      for (const [key, value] of Object.entries(
        r.resolvedParams as Record<string, unknown>,
      )) {
        if (typeof value === "number" && Number.isFinite(value)) {
          resolvedParams[key] = value;
        } else if (typeof value === "string") {
          resolvedParams[key] = value;
        }
      }
    }
    out.push({
      dayIndex: r.dayIndex,
      contractDefId: r.contractDefId,
      intensity,
      resolvedParams,
      titleRu: typeof r.titleRu === "string" ? r.titleRu : r.contractDefId,
      bodyRu: typeof r.bodyRu === "string" ? r.bodyRu : "",
    });
  }
  out.sort((a, b) => a.dayIndex - b.dayIndex);
  return out;
}
