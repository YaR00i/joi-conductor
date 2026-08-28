import type { NavId } from "../components/SideNav";
import { recsShuffleIndex } from "./recsShuffle";
import {
  getTagType,
  loadTagTypeMap,
  type TagTypeId,
  type TagTypeMap,
} from "./tagTypes";

export const CONTENT_HUB_KEY = "joi-content-hub-v1";

export const CONTENT_SOURCES = ["nhentai", "gelbooru"] as const;
export type ContentSource = (typeof CONTENT_SOURCES)[number];

export const CONTENT_TABS = [
  "newest",
  "recs",
  "search",
  "library",
  "lists",
] as const;
export type ContentTab = (typeof CONTENT_TABS)[number];

export const CONTENT_TAB_LABELS: ReadonlyArray<{
  id: ContentTab;
  label: string;
}> = [
  { id: "newest", label: "Новинки" },
  { id: "recs", label: "Рекомендации" },
  { id: "search", label: "Поиск" },
  { id: "library", label: "Избранное" },
  { id: "lists", label: "Списки" },
];

export type ContentHubState = {
  source: ContentSource;
  tab: ContentTab;
  /** Search filter dock on Поиск (nhentai + Gelbooru). */
  searchDockOpen: boolean;
};

const DEFAULT_STATE: ContentHubState = {
  source: "nhentai",
  tab: "newest",
  searchDockOpen: true,
};

function isSource(v: unknown): v is ContentSource {
  return v === "nhentai" || v === "gelbooru";
}

function isTab(v: unknown): v is ContentTab {
  return (CONTENT_TABS as readonly string[]).includes(String(v));
}

export function isContentNav(id: NavId): boolean {
  return id === "doujin" || id === "favorites";
}

export function loadContentHub(): ContentHubState {
  try {
    const raw = localStorage.getItem(CONTENT_HUB_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw) as Partial<ContentHubState>;
    return {
      source: isSource(parsed.source) ? parsed.source : DEFAULT_STATE.source,
      tab: isTab(parsed.tab) ? parsed.tab : DEFAULT_STATE.tab,
      searchDockOpen:
        typeof parsed.searchDockOpen === "boolean"
          ? parsed.searchDockOpen
          : DEFAULT_STATE.searchDockOpen,
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function saveContentHub(patch: Partial<ContentHubState>): ContentHubState {
  const next = { ...loadContentHub(), ...patch };
  if (!isSource(next.source)) next.source = DEFAULT_STATE.source;
  if (!isTab(next.tab)) next.tab = DEFAULT_STATE.tab;
  try {
    localStorage.setItem(CONTENT_HUB_KEY, JSON.stringify(next));
  } catch {
    /* quota */
  }
  return next;
}

/** Old «Избранное» sidebar/CTA → Gelbooru shelf inside Content. */
export function rememberFavoritesRedirect(): void {
  saveContentHub({ source: "gelbooru", tab: "library" });
}

/** Shelf chips + free-text tokens → Gelbooru search query (space-separated). */
export function gelbooruQueryFromFavoriteFilters(opts: {
  selectedTags: readonly string[];
  search: string;
}): string {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (raw: string) => {
    const tag = raw.trim();
    if (!tag) return;
    const key = tag.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(tag);
  };
  for (const tag of opts.selectedTags) push(tag);
  for (const token of opts.search.trim().split(/\s+/)) push(token);
  return out.join(" ");
}

/** Recs / mistress assemble: skip Мета, внешность, место/сцена, Другое. */
export const GELBOORU_RECS_EXCLUDED_TYPES: ReadonlySet<TagTypeId> = new Set([
  "meta",
  "appearance",
  "setting",
  "other",
]);

export function isGelbooruRecsTasteTag(
  tag: string,
  map: TagTypeMap = loadTagTypeMap(),
): boolean {
  const trimmed = tag.trim();
  if (!trimmed) return false;
  return !GELBOORU_RECS_EXCLUDED_TYPES.has(getTagType(trimmed, map));
}

const GELBOORU_RECS_MOOD_TYPES: ReadonlySet<TagTypeId> = new Set([
  "fetish",
  "action",
  "clothing",
  "body",
]);

const GELBOORU_RECS_PLAN_CAP = 24;

function at<T>(rows: readonly T[], i: number): T | undefined {
  if (rows.length === 0) return undefined;
  const n = rows.length;
  return rows[((i % n) + n) % n];
}

function tagsOfTypes(
  tags: readonly string[],
  map: TagTypeMap,
  types: ReadonlySet<TagTypeId>,
): string[] {
  return tags.filter((tag) => types.has(getTagType(tag, map)));
}

function uniqueRecsTags(
  liked: ReadonlyArray<{ tag: string }>,
  map: TagTypeMap,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of liked) {
    const tag = row.tag.trim();
    if (!isGelbooruRecsTasteTag(tag, map)) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

/** AND-plans for Gelbooru recs / mistress assemble (no rating:explicit). */
export function buildGelbooruRecsPlans(
  liked: ReadonlyArray<{ tag: string }>,
  tagTypes?: TagTypeMap,
): string[] {
  const map = tagTypes ?? loadTagTypeMap();
  const tags = uniqueRecsTags(liked, map);
  if (tags.length === 0) return [];

  const characters = tagsOfTypes(tags, map, new Set(["character"]));
  const lores = tagsOfTypes(tags, map, new Set(["lore"]));
  const artists = tagsOfTypes(tags, map, new Set(["artist"]));
  const fetishes = tagsOfTypes(tags, map, new Set(["fetish"]));
  const actions = tagsOfTypes(tags, map, new Set(["action"]));
  const clothes = tagsOfTypes(tags, map, new Set(["clothing"]));
  const bodies = tagsOfTypes(tags, map, new Set(["body"]));
  const moods = tagsOfTypes(tags, map, GELBOORU_RECS_MOOD_TYPES);

  const plans: string[] = [];
  const seen = new Set<string>();
  const addPlan = (parts: Array<string | undefined>) => {
    if (plans.length >= GELBOORU_RECS_PLAN_CAP) return;
    const uniq: string[] = [];
    const local = new Set<string>();
    for (const part of parts) {
      const tag = part?.trim();
      if (!tag) continue;
      const key = tag.toLowerCase();
      if (local.has(key)) continue;
      local.add(key);
      uniq.push(tag);
    }
    if (uniq.length === 0) return;
    const key = [...local].sort().join("\0");
    if (seen.has(key)) return;
    seen.add(key);
    plans.push(uniq.join(" "));
  };

  const rounds = Math.max(
    characters.length,
    lores.length,
    artists.length,
    moods.length,
    1,
  );
  for (let i = 0; i < rounds; i++) {
    const mood = at(moods, i);
    const moodAlt = at(moods, i + 1);
    const character = at(characters, i);
    const lore = at(lores, i);
    const artist = at(artists, i);
    addPlan([character, mood]);
    addPlan([character, moodAlt]);
    addPlan([lore, mood]);
    addPlan([lore, moodAlt]);
    addPlan([artist, mood]);
    addPlan([character, lore]);
    addPlan([artist, character ?? lore]);
    addPlan([at(fetishes, i), at(actions, i) ?? moodAlt]);
    addPlan([at(clothes, i), mood ?? at(actions, i)]);
    addPlan([at(bodies, i), moodAlt ?? mood]);
    addPlan([character, at(fetishes, i), at(actions, i + 1) ?? moodAlt]);
  }

  if (plans.length < 8 && tags.length >= 2) {
    for (let offset = 2; offset < tags.length; offset++) {
      for (let i = 0; i < tags.length; i++) {
        addPlan([tags[i], tags[(i + offset) % tags.length]]);
      }
    }
  }

  addPlan([characters[0]]);
  addPlan([lores[0]]);
  addPlan([fetishes[0] ?? moods[0]]);

  if (plans.length === 0) addPlan([tags[0]]);
  return plans;
}

export function gelbooruRecsQuery(
  liked: ReadonlyArray<{ tag: string }>,
  tick: number,
  fallback = "rating:explicit",
  tagTypes?: TagTypeMap,
): string {
  const plans = buildGelbooruRecsPlans(liked, tagTypes);
  if (plans.length === 0) return fallback;
  const i = recsShuffleIndex(plans.length, tick);
  const body = plans[i] ?? plans[0]!;
  return `${body} rating:explicit`;
}
