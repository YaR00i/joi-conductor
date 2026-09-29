/**
 * Two progress save slots, switchable from Settings.
 * Slot «live» = real progress. Slot «sandbox» = everything unlocked for testing.
 *
 * Working keys stay unprefixed; the inactive slot is parked in meta storage.
 * Shared settings (Gelbooru keys, voice, roulette prefs) are never swapped.
 */

import { toys } from "./catalog";
import {
  emptyAchievements,
  emptyCounters,
  type AchievementsState,
} from "./achievements";
import { allFetishCatalog } from "./contentUnlocks";
import {
  CHARACTER_CATALOG,
  MEDIA_TYPE_CATALOG,
} from "./contentCatalog";
import { enableSparkleSecondaryDefaults } from "./mistress/secondaryCache";
import { SESSION_MOODS } from "./mistress/types";
import { TAG_PACKS } from "./tagPackCatalog";
import {
  GATED_FUNCTION_IDS,
  GATED_PATTERN_IDS,
  emptyWallet,
  syncMistressModeGrants,
  type WalletState,
} from "./wallet";

const META_KEY = "joi-save-slots-v1";

export type SaveSlotId = "live" | "sandbox";

/** Progress keys that move with the active slot. */
export const PROGRESS_STORAGE_KEYS = [
  "joi-cinders-v1",
  "joi-achievements-v1",
  "joi-diary-v1",
  "joi-active-mistress",
  "joi-secondary-cache-v1",
  "joi-toys-owned-v1",
  "joi-conductor.denialQuest",
  "joi-conductor.cageLock",
  "joi-contracts-v1",
  "joi-contract-journal-v1",
  "joi-contract-media-drill-v1",
  "joi-contract-session-seed-v1",
  "joi-contract-series-v1",
  "joi-soul-v1",
  "joi-soul-control-v1",
] as const;

export type ProgressSnapshot = Partial<
  Record<(typeof PROGRESS_STORAGE_KEYS)[number], string | null>
>;

export type SaveSlotsMeta = {
  version: 1;
  active: SaveSlotId;
  parked: Partial<Record<SaveSlotId, ProgressSnapshot>>;
};

export const SAVE_SLOT_LABELS: Record<
  SaveSlotId,
  { titleRu: string; blurbRu: string }
> = {
  live: {
    titleRu: "1 · Живой",
    blurbRu: "Текущий прогресс: покупки, ачивки, дневник",
  },
  sandbox: {
    titleRu: "2 · Песочница",
    blurbRu: "Всё открыто — для тестов и проверки функционала",
  },
};

function emptyMeta(): SaveSlotsMeta {
  return { version: 1, active: "live", parked: {} };
}

export function loadSaveSlotsMeta(): SaveSlotsMeta {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return emptyMeta();
    const parsed = JSON.parse(raw) as Partial<SaveSlotsMeta>;
    const active =
      parsed.active === "sandbox" || parsed.active === "live"
        ? parsed.active
        : "live";
    return {
      version: 1,
      active,
      parked:
        parsed.parked && typeof parsed.parked === "object"
          ? parsed.parked
          : {},
    };
  } catch {
    return emptyMeta();
  }
}

export function saveSaveSlotsMeta(meta: SaveSlotsMeta): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    /* ignore quota */
  }
}

function loadMeta(): SaveSlotsMeta {
  return loadSaveSlotsMeta();
}

function saveMeta(meta: SaveSlotsMeta): void {
  saveSaveSlotsMeta(meta);
}

export function getActiveSaveSlot(): SaveSlotId {
  return loadMeta().active;
}

export function captureProgress(): ProgressSnapshot {
  const snap: ProgressSnapshot = {};
  for (const key of PROGRESS_STORAGE_KEYS) {
    snap[key] = localStorage.getItem(key);
  }
  return snap;
}

export function restoreProgress(snap: ProgressSnapshot): void {
  for (const key of PROGRESS_STORAGE_KEYS) {
    const value = snap[key];
    if (value == null || value === "") {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  }
}

function buildSandboxWallet(): WalletState {
  const unlocks = syncMistressModeGrants(
    {
      functionIds: [...GATED_FUNCTION_IDS],
      patternIds: [...GATED_PATTERN_IDS],
      tagPacks: Object.keys(TAG_PACKS),
      fetishIds: allFetishCatalog().map((f) => f.id),
      characterIds: CHARACTER_CATALOG.map((c) => c.id),
      mediaTypeIds: MEDIA_TYPE_CATALOG.map((m) => m.id),
      modeIds: [
        "stroke",
        "anal",
        "chastity",
        "onahole",
        "cbt",
        "oral",
        "prone",
      ],
      moodIds: [...SESSION_MOODS],
      unlockedTags: [],
      featureIds: [
        "breath_hold",
        "sparkle_mask",
        "iskra_fang",
        "sparkle_phantom",
        "sparkle_session_fx",
      ],
    },
    { chastitySessionsCompleted: 10 },
  );

  return {
    ...emptyWallet(),
    balance: 99_999,
    unlocks,
  };
}

function buildSandboxAchievements(): AchievementsState {
  return {
    ...emptyAchievements(),
    migratedFromDiary: true,
    migratedGirlCounters: true,
    counters: {
      ...emptyCounters(),
      chastitySessionsCompleted: 10,
      mistressesUnlocked: 4,
      sessionsCompleted: 1,
    },
  };
}

function buildSandboxToysJson(): string {
  const map: Record<string, boolean> = {};
  for (const t of toys) map[t.id] = true;
  return JSON.stringify(map);
}

/** Fresh all-unlocked snapshot (does not touch localStorage). */
export function buildSandboxSnapshot(): ProgressSnapshot {
  return {
    "joi-cinders-v1": JSON.stringify(buildSandboxWallet()),
    "joi-achievements-v1": JSON.stringify(buildSandboxAchievements()),
    "joi-diary-v1": null,
    "joi-active-mistress": "hu_tao",
    "joi-secondary-cache-v1": null,
    "joi-toys-owned-v1": buildSandboxToysJson(),
    "joi-conductor.denialQuest": null,
    "joi-conductor.cageLock": null,
    "joi-contracts-v1": null,
    "joi-contract-journal-v1": null,
    "joi-contract-media-drill-v1": null,
    "joi-contract-session-seed-v1": null,
    "joi-contract-series-v1": null,
    "joi-soul-v1": null,
  };
}

/**
 * Switch active progress slot. Parks the current working keys, restores the
 * target (seeding sandbox once), then reloads so App remounts cleanly.
 */
export function switchSaveSlot(to: SaveSlotId): void {
  const meta = loadMeta();
  if (meta.active === to) return;

  meta.parked[meta.active] = captureProgress();

  if (to === "sandbox" && !meta.parked.sandbox) {
    meta.parked.sandbox = buildSandboxSnapshot();
  }
  const target = meta.parked[to] ?? (to === "sandbox" ? buildSandboxSnapshot() : {});
  restoreProgress(target);

  if (to === "sandbox") {
    try {
      enableSparkleSecondaryDefaults();
    } catch {
      /* optional */
    }
  }

  meta.active = to;
  saveMeta(meta);
  window.location.reload();
}

/** Rebuild sandbox from scratch (keeps live parked). Reloads if sandbox active. */
export function resetSandboxSlot(): void {
  const meta = loadMeta();
  meta.parked.sandbox = buildSandboxSnapshot();
  if (meta.active === "sandbox") {
    restoreProgress(meta.parked.sandbox);
    try {
      enableSparkleSecondaryDefaults();
    } catch {
      /* optional */
    }
  }
  saveMeta(meta);
  if (meta.active === "sandbox") {
    window.location.reload();
  }
}
