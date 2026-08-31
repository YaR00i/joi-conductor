import type { FavoriteMetadata } from "../mediaFavorites";
import { downloadMediaUrl, type MediaItem } from "../media";
import type { JoidbVideo } from "./parseCatalog";
import { isJoidbMediaId, joidbThumbnailUrl, parseJoidbMediaId } from "./origin";

export function joidbPosterUrl(video: JoidbVideo): string {
  const thumb = video.thumbnail.trim();
  if (thumb) return thumb;
  return joidbThumbnailUrl(video.id);
}

export function joidbVideoToFavItem(video: JoidbVideo): MediaItem {
  const thumb = joidbPosterUrl(video);
  return {
    id: video.mediaId,
    url: thumb,
    previewUrl: thumb,
    kind: "video",
    source: "gelbooru",
    tags: video.title,
  };
}

export async function fetchJoidbFavoritePoster(
  video: JoidbVideo,
): Promise<Blob> {
  const src = downloadMediaUrl(joidbVideoToFavItem(video));
  const res = await fetch(src, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) {
    throw new Error(`Не удалось скачать превью (${res.status})`);
  }
  const blob = await res.blob();
  if (blob.size <= 0) throw new Error("Пустое превью");
  return blob;
}

export function favoriteMetadataToJoidbVideo(
  row: FavoriteMetadata,
): JoidbVideo | null {
  if (!isJoidbMediaId(row.id)) return null;
  const hex = parseJoidbMediaId(row.id);
  if (!hex) return null;
  return {
    id: hex,
    mediaId: row.id,
    title: row.tags?.trim() || hex,
    duration: "",
    durationSec: 0,
    thumbnail: joidbThumbnailUrl(hex),
    exclusive: false,
  };
}
