/** Live origin uses the www cert; apex is not in SAN. */
export const JOIDB_ORIGIN = "https://www.the-joi-database.com";
export const JOIDB_PROXY = "/api/joidb";
export const JOIDB_ID_PREFIX = "joidb-";
export const JOIDB_LISTS_KEY = "joi-joidb-lists-v1";

const HEX_ID = /^[0-9a-f]{16,32}$/i;

export function isJoidbHexId(raw: string): boolean {
  return HEX_ID.test(raw.trim());
}

export function joidbMediaId(hexId: string): string {
  return `${JOIDB_ID_PREFIX}${hexId.trim().toLowerCase()}`;
}

export function parseJoidbMediaId(id: string): string | null {
  const trimmed = id.trim();
  if (!trimmed.toLowerCase().startsWith(JOIDB_ID_PREFIX)) return null;
  const hex = trimmed.slice(JOIDB_ID_PREFIX.length);
  return isJoidbHexId(hex) ? hex.toLowerCase() : null;
}

export function isJoidbMediaId(id: string): boolean {
  return parseJoidbMediaId(id) != null;
}

export function joidbProxyPath(sitePath: string): string {
  const path = sitePath.startsWith("/") ? sitePath : `/${sitePath}`;
  return `${JOIDB_PROXY}${path}`;
}

export function joidbStreamProxyUrl(hexId: string): string {
  return joidbProxyPath(`/api/stream/${encodeURIComponent(hexId)}`);
}

export function joidbVttProxyUrl(hexId: string): string {
  return joidbProxyPath(`/api/vtt/${encodeURIComponent(hexId)}`);
}

export function joidbWatchPath(hexId: string): string {
  return `/watch/${hexId}`;
}

export function joidbWatchUrl(hexId: string): string {
  return `${JOIDB_ORIGIN}${joidbWatchPath(hexId)}`;
}

export function joidbThumbnailUrl(hexId: string): string {
  const id = hexId.trim().toLowerCase();
  return `https://cdn-s.the-joi-database.com/videos/${id}/thumbnail_${id}.webp`;
}

export function parseJoidbDuration(raw: string): number {
  const parts = raw
    .trim()
    .split(":")
    .map((p) => Number(p));
  if (parts.length === 0 || parts.some((n) => !Number.isFinite(n) || n < 0)) {
    return 0;
  }
  if (parts.length === 3) {
    return Math.floor(parts[0]! * 3600 + parts[1]! * 60 + parts[2]!);
  }
  if (parts.length === 2) {
    return Math.floor(parts[0]! * 60 + parts[1]!);
  }
  return Math.floor(parts[0] ?? 0);
}

export function isJoidbCdnHost(host: string): boolean {
  const h = host.toLowerCase();
  return h === "the-joi-database.com" || h.endsWith(".the-joi-database.com");
}

export function joidbSiteReferer(): string {
  return `${JOIDB_ORIGIN}/`;
}
