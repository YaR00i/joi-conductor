export const FALLBACK_IMAGE_SERVERS = [
  "https://i.nhentai.net",
  "https://i1.nhentai.net",
  "https://i2.nhentai.net",
  "https://i3.nhentai.net",
  "https://i4.nhentai.net",
] as const;

export const FALLBACK_THUMB_SERVERS = [
  "https://t.nhentai.net",
  "https://t1.nhentai.net",
  "https://t2.nhentai.net",
  "https://t3.nhentai.net",
  "https://t4.nhentai.net",
] as const;

export type DoujinCdnConfig = {
  imageServers: string[];
  thumbServers: string[];
};

export function defaultCdnConfig(): DoujinCdnConfig {
  return {
    imageServers: [...FALLBACK_IMAGE_SERVERS],
    thumbServers: [...FALLBACK_THUMB_SERVERS],
  };
}

function asStringList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((s) => s.replace(/\/+$/, ""));
}

export function parseCdnConfig(data: unknown): DoujinCdnConfig {
  const fallback = defaultCdnConfig();
  if (!data || typeof data !== "object") return fallback;
  const rec = data as Record<string, unknown>;
  const image =
    asStringList(rec.imageServers).length > 0
      ? asStringList(rec.imageServers)
      : asStringList(rec.image_servers).length > 0
        ? asStringList(rec.image_servers)
        : asStringList(rec.images);
  const thumb =
    asStringList(rec.thumbServers).length > 0
      ? asStringList(rec.thumbServers)
      : asStringList(rec.thumb_servers).length > 0
        ? asStringList(rec.thumb_servers)
        : asStringList(rec.thumbs);
  return {
    imageServers: image.length > 0 ? image : fallback.imageServers,
    thumbServers: thumb.length > 0 ? thumb : fallback.thumbServers,
  };
}

export function pickServer(servers: readonly string[]): string {
  return servers[0] ?? FALLBACK_IMAGE_SERVERS[0];
}

export function joinCdn(server: string, path: string): string {
  const p = path.trim();
  if (!p) return "";
  if (/^https?:\/\//i.test(p)) return p;
  const base = server.replace(/\/+$/, "");
  const rel = p.startsWith("/") ? p : `/${p}`;
  return `${base}${rel}`;
}

export function extFromType(t: string): string {
  switch (t) {
    case "j":
      return "jpg";
    case "p":
      return "png";
    case "g":
      return "gif";
    case "w":
      return "webp";
    default:
      return "jpg";
  }
}

export function proxiedImageUrl(url: string): string {
  const u = url.trim();
  if (!u) return "";
  if (u.startsWith("/") || u.startsWith("blob:") || u.startsWith("data:")) {
    return u;
  }
  return `/api/media-proxy?url=${encodeURIComponent(u)}`;
}
