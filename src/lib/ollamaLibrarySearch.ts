export type OllamaLibraryHit = {
  id: string;
  hint: string;
  source: "catalog" | "hub";
};

const SKIP_ROOT = new Set([
  "search",
  "blog",
  "signin",
  "login",
  "download",
  "library",
  "cloud",
  "customer",
  "docs",
  "models",
  "static",
  "assets",
  "cdn-cgi",
  "public",
  "pricing",
  "vendor",
  "news",
  "about",
  "terms",
  "privacy",
]);

const ASSET_EXT = /\.(png|jpe?g|gif|svg|ico|webp|css|js|map|woff2?|ttf|json)$/i;

function slugFromHref(raw: string): string | null {
  const path = raw.replace(/^\/+/, "").replace(/[?#].*$/, "");
  if (!path || path.includes("..")) return null;
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0 || parts.length > 2) return null;
  const last = parts[parts.length - 1] ?? "";
  if (ASSET_EXT.test(last)) return null;
  const root = parts[0]!.toLowerCase();
  if (SKIP_ROOT.has(root)) {
    if (root === "library" && parts[1]) return parts[1];
    return null;
  }
  if (parts.length === 1) return parts[0] ?? null;
  return `${parts[0]}/${parts[1]}`;
}

export function parseOllamaSearchHtml(html: string): OllamaLibraryHit[] {
  const hits: OllamaLibraryHit[] = [];
  const seen = new Set<string>();
  const re = /href="\/([^"?#]+)"/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const id = slugFromHref(match[1] ?? "");
    if (!id || seen.has(id.toLowerCase())) continue;
    seen.add(id.toLowerCase());
    hits.push({ id, hint: "библиотека Ollama", source: "hub" });
    if (hits.length >= 24) break;
  }
  return hits;
}

export function mergeOllamaSearchHits(
  catalog: readonly { id: string; hint: string }[],
  hub: readonly OllamaLibraryHit[],
): OllamaLibraryHit[] {
  const out: OllamaLibraryHit[] = [];
  const seen = new Set<string>();
  for (const row of catalog) {
    const key = row.id.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: row.id, hint: row.hint, source: "catalog" });
  }
  for (const row of hub) {
    const key = row.id.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out.slice(0, 32);
}
