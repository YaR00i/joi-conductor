import {
  type ContractDef,
  type ContractRollKey,
} from "./catalog";
import { CONTRACT_ROLL_KEYS } from "./contractEditorDraft";
import { rollContractParams } from "./contractInstantiate";

const ROLL_KEY_SET = new Set<string>(CONTRACT_ROLL_KEYS);

export function isContractRollKey(key: string): key is ContractRollKey {
  return ROLL_KEY_SET.has(key);
}

export function numericRollBounds(
  def: ContractDef,
  key: ContractRollKey,
): { min: number; max: number } | null {
  const pool = def.rolls?.[key];
  if (!pool || pool.length === 0) return null;
  const nums = pool.filter((v): v is number => typeof v === "number");
  if (nums.length === 0) return null;
  return { min: Math.min(...nums), max: Math.max(...nums) };
}

export function rollKeysForDef(def: ContractDef | undefined): ContractRollKey[] {
  if (!def?.rolls) return [];
  return CONTRACT_ROLL_KEYS.filter((key) => {
    const pool = def.rolls?.[key];
    return Boolean(pool && pool.length > 0);
  });
}

export function normalizeParamOverrides(
  raw: unknown,
): Partial<Record<ContractRollKey, string | number>> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: Partial<Record<ContractRollKey, string | number>> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isContractRollKey(key)) continue;
    if (typeof value === "number") {
      if (!Number.isFinite(value) || value < 0) continue;
      out[key] = value;
      continue;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) continue;
      const num = Number(trimmed);
      if (Number.isFinite(num) && /^-?\d+(\.\d+)?$/.test(trimmed)) {
        if (num < 0) continue;
        out[key] = num;
      } else {
        out[key] = trimmed;
      }
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function restrictOverridesToDef(
  def: ContractDef | undefined,
  overrides: Partial<Record<ContractRollKey, string | number>> | undefined,
): Partial<Record<ContractRollKey, string | number>> | undefined {
  if (!overrides) return undefined;
  const allowed = new Set(rollKeysForDef(def));
  const next: Partial<Record<ContractRollKey, string | number>> = {};
  for (const key of CONTRACT_ROLL_KEYS) {
    const value = overrides[key];
    if (value == null || !allowed.has(key)) continue;
    next[key] = value;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

export function overrideRangeWarnings(
  def: ContractDef,
  overrides: Partial<Record<ContractRollKey, string | number>> | undefined,
): string[] {
  if (!overrides) return [];
  const warnings: string[] = [];
  for (const key of rollKeysForDef(def)) {
    const value = overrides[key];
    if (typeof value !== "number") continue;
    const bounds = numericRollBounds(def, key);
    if (!bounds) continue;
    if (value < bounds.min || value > bounds.max) {
      warnings.push(
        `${key}: ${value} вне диапазона каталога (${bounds.min}–${bounds.max})`,
      );
    }
  }
  return warnings;
}

export function resolveSeriesDayParams(
  contractDef: ContractDef,
  spec: { paramOverrides?: unknown },
  rng: () => number,
): Record<string, string | number> {
  const rolled = rollContractParams(contractDef, rng);
  const overrides = restrictOverridesToDef(
    contractDef,
    normalizeParamOverrides(spec.paramOverrides),
  );
  return { ...rolled, ...overrides };
}
