import {
  isJoidbCdnHost,
  JOIDB_ORIGIN,
  JOIDB_PROXY,
  joidbProxyPath,
} from "./origin";
import { proxiedRemoteMediaUrl } from "../media";

/** Map an HLS request so playlists stay on /api/joidb and CDN segments use media-proxy. */
export function mapJoidbHlsUrl(url: string): string {
  const raw = url.trim();
  if (!raw) return raw;
  if (raw.startsWith("/api/joidb") || raw.startsWith("/api/media-proxy")) {
    return raw;
  }
  if (raw.startsWith("/api/stream/") || raw.startsWith("/api/vtt/")) {
    return `${JOIDB_PROXY}${raw}`;
  }
  try {
    const parsed = new URL(raw, "http://127.0.0.1");
    if (isJoidbCdnHost(parsed.hostname)) {
      return proxiedRemoteMediaUrl(parsed.toString());
    }
    if (
      parsed.hostname === "www.the-joi-database.com" ||
      parsed.hostname === "the-joi-database.com" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "localhost"
    ) {
      const path = parsed.pathname + parsed.search;
      if (path.startsWith("/api/joidb") || path.startsWith("/api/media-proxy")) {
        return path;
      }
      if (path.startsWith("/api/stream/") || path.startsWith("/api/vtt/")) {
        return joidbProxyPath(path);
      }
      if (parsed.origin === JOIDB_ORIGIN || parsed.hostname.endsWith("the-joi-database.com")) {
        return joidbProxyPath(path);
      }
    }
  } catch {
    /* fall through */
  }
  return raw;
}
