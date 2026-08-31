export const GELBOORU01_SITE_IDS = ["censored", "blacked"] as const;
export type Gelbooru01SiteId = (typeof GELBOORU01_SITE_IDS)[number];

export const HTML02_SITE_IDS = ["realbooru"] as const;
export type Html02SiteId = (typeof HTML02_SITE_IDS)[number];

export const DAPI_SITE_IDS = ["gelbooru", "xbooru", "hypnohub"] as const;
export type DapiSiteId = (typeof DAPI_SITE_IDS)[number];

export const BOORU_SITE_IDS = [
  "gelbooru",
  ...GELBOORU01_SITE_IDS,
  ...HTML02_SITE_IDS,
  "xbooru",
  "hypnohub",
] as const;
export type BooruSiteId = (typeof BOORU_SITE_IDS)[number];

export type BooruSiteApi = "dapi" | "html01" | "html02";

export type BooruSiteDef = {
  id: BooruSiteId;
  /** Kicker / chrome label (lowercase, like gelbooru). */
  label: string;
  origin: string;
  api: BooruSiteApi;
  needsKey: boolean;
  idPrefix: string;
  /** Path slug on thumbs.booru.org / img.booru.org. */
  cdnSlug: string | null;
  defaultTags: string;
};

export const BOORU_SITES: Record<BooruSiteId, BooruSiteDef> = {
  gelbooru: {
    id: "gelbooru",
    label: "gelbooru",
    origin: "https://gelbooru.com",
    api: "dapi",
    needsKey: true,
    idPrefix: "gb",
    cdnSlug: null,
    defaultTags: "rating:explicit 1girl",
  },
  censored: {
    id: "censored",
    label: "censored",
    origin: "https://censored.booru.org",
    api: "html01",
    needsKey: false,
    idPrefix: "censored",
    cdnSlug: "censored",
    defaultTags: "rating:explicit",
  },
  blacked: {
    id: "blacked",
    label: "blacked",
    origin: "https://blacked.booru.org",
    api: "html01",
    needsKey: false,
    idPrefix: "blacked",
    cdnSlug: "blacked",
    defaultTags: "rating:explicit",
  },
  realbooru: {
    id: "realbooru",
    label: "realbooru",
    origin: "https://realbooru.com",
    api: "html02",
    needsKey: false,
    idPrefix: "rb",
    cdnSlug: null,
    defaultTags: "all",
  },
  xbooru: {
    id: "xbooru",
    label: "xbooru",
    origin: "https://xbooru.com",
    api: "dapi",
    needsKey: false,
    idPrefix: "xb",
    cdnSlug: null,
    defaultTags: "rating:explicit",
  },
  hypnohub: {
    id: "hypnohub",
    label: "hypnohub",
    origin: "https://hypnohub.net",
    api: "dapi",
    needsKey: false,
    idPrefix: "hh",
    cdnSlug: null,
    defaultTags: "rating:explicit",
  },
};

export function isBooruSiteId(v: unknown): v is BooruSiteId {
  return typeof v === "string" && (BOORU_SITE_IDS as readonly string[]).includes(v);
}

export function isGelbooru01SiteId(v: unknown): v is Gelbooru01SiteId {
  return v === "censored" || v === "blacked";
}

export function isHtml02SiteId(v: unknown): v is Html02SiteId {
  return v === "realbooru";
}

export function isDapiSiteId(v: unknown): v is DapiSiteId {
  return v === "gelbooru" || v === "xbooru" || v === "hypnohub";
}

export function booruSite(id: BooruSiteId): BooruSiteDef {
  return BOORU_SITES[id];
}

export function booruMediaId(site: BooruSiteId, postId: string): string {
  return `${BOORU_SITES[site].idPrefix}-${postId}`;
}

/** Vite proxy path for dapi JSON (`/index.php?page=dapi&…`). */
export function booruDapiProxyPath(site: BooruSiteId): string {
  switch (site) {
    case "gelbooru":
      return "/api/gelbooru";
    case "xbooru":
    case "hypnohub":
      return `/api/booru/${site}`;
    case "censored":
    case "blacked":
      throw new Error(`${site} uses html01, not dapi`);
    case "realbooru":
      throw new Error(`${site} uses html02, not dapi`);
    default: {
      const _never: never = site;
      return _never;
    }
  }
}

const PREFIX_BY_SITE: ReadonlyArray<{ site: BooruSiteId; re: RegExp }> = [
  { site: "censored", re: /^censored-(\d+)(?:-\d+)?$/ },
  { site: "blacked", re: /^blacked-(\d+)(?:-\d+)?$/ },
  { site: "realbooru", re: /^rb-(\d+)(?:-\d+)?$/ },
  { site: "xbooru", re: /^xb-(\d+)(?:-\d+)?$/ },
  { site: "hypnohub", re: /^hh-(\d+)(?:-\d+)?$/ },
  { site: "gelbooru", re: /^gb-(\d+)(?:-\d+)?$/ },
];

export function booruSiteFromMediaId(id: string): BooruSiteId | null {
  const trimmed = id.trim();
  for (const row of PREFIX_BY_SITE) {
    if (row.re.test(trimmed)) return row.site;
  }
  return null;
}

export function booruPostIdFromMediaId(id: string): string | null {
  const trimmed = id.trim();
  for (const row of PREFIX_BY_SITE) {
    const m = row.re.exec(trimmed);
    if (m?.[1]) return m[1];
  }
  return null;
}

export function inferBooruSite(item: {
  id: string;
  booruSite?: string | null;
}): BooruSiteId {
  if (isBooruSiteId(item.booruSite)) return item.booruSite;
  return booruSiteFromMediaId(item.id) ?? "gelbooru";
}

export function favoriteIdBelongsToBooruSite(
  id: string,
  site: BooruSiteId,
): boolean {
  if (/^joidb-/i.test(id.trim())) return false;
  const fromId = booruSiteFromMediaId(id);
  if (site === "gelbooru") {
    return fromId == null || fromId === "gelbooru";
  }
  return fromId === site;
}

export function booruPostViewUrl(site: BooruSiteId, postId: string): string {
  const origin = BOORU_SITES[site].origin.replace(/\/+$/, "");
  return `${origin}/index.php?page=post&s=view&id=${encodeURIComponent(postId)}`;
}

/** Referer for img.booru.org / thumbs.booru.org / xbooru / hypnohub CDNs. */
export function booruCdnReferer(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host === "thumbs.booru.org" || host === "img.booru.org") {
      const slug = parsed.pathname.split("/").filter(Boolean)[0]?.toLowerCase();
      if (slug === "censored" || slug === "blacked") {
        return `https://${slug}.booru.org/`;
      }
      return null;
    }
    if (host.endsWith(".booru.org") && host !== "booru.org") {
      return `https://${host}/`;
    }
    if (host === "xbooru.com" || host.endsWith(".xbooru.com")) {
      return "https://xbooru.com/";
    }
    if (host === "hypnohub.net" || host.endsWith(".hypnohub.net")) {
      return "https://hypnohub.net/";
    }
    if (host === "realbooru.com" || host.endsWith(".realbooru.com")) {
      return "https://realbooru.com/";
    }
  } catch {
    return null;
  }
  return null;
}
