/** Gelbooru bias packs for Mistress MediaProfile — not a second host. */

export type SecondaryBooruId = "censored" | "blacked";

export type SecondaryBooruDef = {
  id: SecondaryBooruId;
  labelRu: string;
  /** Honest UX label — Gelbooru bias / доп. теги, not a fake host. */
  biasLabelRu: string;
  /** Soft Gelbooru tags appended when this bias pack is enabled. */
  gelbooruBiasTags: string[];
};

export const SECONDARY_BOORU_DEFS: Record<SecondaryBooruId, SecondaryBooruDef> =
  {
    censored: {
      id: "censored",
      labelRu: "Censored",
      biasLabelRu: "Gelbooru bias · доп. теги",
      gelbooruBiasTags: [
        "censored",
        "censored_penis",
        "mosaic_censorship",
        "bar_censor",
        "convenient_censorship",
      ],
    },
    blacked: {
      id: "blacked",
      labelRu: "Blacked",
      biasLabelRu: "Gelbooru bias · доп. теги",
      gelbooruBiasTags: [
        "dark-skinned_male",
        "dark_skin",
        "interracial",
        "dark-skinned_male_pale_skinned_female",
      ],
    },
  };

const STORAGE_KEY = "joi-secondary-cache-v1";

export type SecondaryCachePrefs = {
  /** Opt-in toggles per secondary id. */
  enabled: Partial<Record<SecondaryBooruId, boolean>>;
};

export function loadSecondaryCachePrefs(): SecondaryCachePrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { enabled: {} };
    const parsed = JSON.parse(raw) as SecondaryCachePrefs;
    return { enabled: parsed.enabled ?? {} };
  } catch {
    return { enabled: {} };
  }
}

export function saveSecondaryCachePrefs(prefs: SecondaryCachePrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

/** When Mask Circus unlocks — turn on censored+blacked secondary bias by default. */
export function enableSparkleSecondaryDefaults(): void {
  const prefs = loadSecondaryCachePrefs();
  saveSecondaryCachePrefs({
    enabled: {
      ...prefs.enabled,
      censored: true,
      blacked: true,
    },
  });
}

/** Merge primary query with focus tags and enabled Gelbooru bias packs. */
export function buildMistressMediaQuery(opts: {
  primaryDefaultTags: string;
  focusTags: string[];
  secondaryBooruIds: SecondaryBooruId[];
  /** Currently enabled secondary ids (opt-in). */
  enabledSecondary?: SecondaryBooruId[];
  /** Extra cumplay bias tags to append (optional). */
  cumplayBiasTags?: string[];
  includeFocus?: boolean;
  includeCumplayBias?: boolean;
}): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    for (const t of raw.split(/\s+/)) {
      const tag = t.trim();
      if (!tag) continue;
      const key = tag.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      parts.push(tag);
    }
  };

  push(opts.primaryDefaultTags);
  if (opts.includeFocus !== false) {
    for (const t of opts.focusTags) push(t);
  }
  const enabled = new Set(opts.enabledSecondary ?? []);
  for (const id of opts.secondaryBooruIds) {
    if (!enabled.has(id)) continue;
    const def = SECONDARY_BOORU_DEFS[id];
    if (!def) continue;
    for (const t of def.gelbooruBiasTags) push(t);
  }
  if (opts.includeCumplayBias && opts.cumplayBiasTags) {
    for (const t of opts.cumplayBiasTags) push(t);
  }
  return parts.join(" ");
}
