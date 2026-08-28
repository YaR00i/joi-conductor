import { getActiveSaveSlot, type SaveSlotId } from "../saveSlots";

export const DOUJIN_BLACKLIST_SANDBOX_KEY = "joi-doujin-blacklist-sandbox-v1";

/** Hard default used in the live slot and as sandbox reset. */
export const DEFAULT_BLOCKLIST: readonly string[] = [
  "child",
  "underage",
];

export function normalizeTagName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\s+/g, " ");
}

export function parseBlacklistText(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[\n,;]+/)) {
    const name = normalizeTagName(part.replace(/^-+/, ""));
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

export function formatBlacklistText(tags: readonly string[]): string {
  return tags.map((t) => normalizeTagName(t)).filter(Boolean).join("\n");
}

export function loadSandboxBlacklist(): string[] | null {
  try {
    const raw = localStorage.getItem(DOUJIN_BLACKLIST_SANDBOX_KEY);
    if (raw == null || raw === "") return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const names = parseBlacklistText(
      parsed.filter((v): v is string => typeof v === "string").join("\n"),
    );
    return names;
  } catch {
    return null;
  }
}

export function saveSandboxBlacklist(tags: readonly string[]): void {
  localStorage.setItem(
    DOUJIN_BLACKLIST_SANDBOX_KEY,
    JSON.stringify(parseBlacklistText(tags.join("\n"))),
  );
}

export function resetSandboxBlacklist(): void {
  localStorage.removeItem(DOUJIN_BLACKLIST_SANDBOX_KEY);
}

export function effectiveBlacklist(opts?: {
  slot?: SaveSlotId;
  sandboxStored?: string[] | null;
}): string[] {
  const slot = opts?.slot ?? getActiveSaveSlot();
  if (slot !== "sandbox") {
    return [...DEFAULT_BLOCKLIST];
  }
  const stored =
    opts && "sandboxStored" in opts
      ? opts.sandboxStored
      : loadSandboxBlacklist();
  if (stored == null) return [...DEFAULT_BLOCKLIST];
  return parseBlacklistText(stored.join("\n"));
}

function tagTokens(name: string): string[] {
  return normalizeTagName(name)
    .split(/[\s/-]+/)
    .filter(Boolean);
}

/** True if a single tag name hits the blacklist. */
export function tagIsBlocked(
  name: string,
  blacklist: readonly string[] = DEFAULT_BLOCKLIST,
): boolean {
  const n = normalizeTagName(name);
  if (!n) return false;
  const blocked = blacklist.map(normalizeTagName).filter(Boolean);
  if (blocked.includes(n)) return true;
  const tokens = new Set(tagTokens(n));
  for (const b of blocked) {
    if (b.includes(" ")) {
      if (n.includes(b)) return true;
      continue;
    }
    if (tokens.has(b)) return true;
  }
  return false;
}

export function galleryIsBlocked(
  tags: ReadonlyArray<{ name: string }>,
  blacklist: readonly string[] = DEFAULT_BLOCKLIST,
): boolean {
  return tags.some((t) => tagIsBlocked(t.name, blacklist));
}

export function filterUnblocked<T extends { tags: ReadonlyArray<{ name: string }> }>(
  items: readonly T[],
  blacklist: readonly string[] = DEFAULT_BLOCKLIST,
): T[] {
  return items.filter((item) => {
    if (!item.tags.length) return true;
    return !galleryIsBlocked(item.tags, blacklist);
  });
}
