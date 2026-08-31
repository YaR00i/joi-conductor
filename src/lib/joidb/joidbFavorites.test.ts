import { describe, expect, it } from "vitest";
import { resolveGelbooruId } from "../mediaFavorites";
import { downloadMediaUrl } from "../media";
import { joidbMediaId, joidbThumbnailUrl } from "./origin";
import { joidbPosterUrl, joidbVideoToFavItem } from "./joidbFavorites";
import type { JoidbVideo } from "./parseCatalog";

const hex = "aabbccddeeff00112233445566778899";

function sample(partial: Partial<JoidbVideo> = {}): JoidbVideo {
  return {
    id: hex,
    mediaId: joidbMediaId(hex),
    title: "Sakuya Izayoi",
    duration: "9:30",
    durationSec: 570,
    thumbnail: "https://cdn-s.the-joi-database.com/videos/x.webp",
    exclusive: false,
    ...partial,
  };
}

describe("joidbFavorites", () => {
  it("keeps the joidb- id so the shelf does not rewrite it as gelbooru", () => {
    const item = joidbVideoToFavItem(sample());
    expect(item.id).toBe(`joidb-${hex}`);
    expect(resolveGelbooruId(item)).toBeNull();
    expect(item.kind).toBe("video");
  });

  it("falls back to the CDN poster when the catalog left thumbnail empty", () => {
    const video = sample({ thumbnail: "  " });
    expect(joidbPosterUrl(video)).toBe(joidbThumbnailUrl(hex));
    expect(joidbVideoToFavItem(video).url).toBe(joidbThumbnailUrl(hex));
  });

  it("saves the poster through the media proxy, not the raw CDN", () => {
    const url = downloadMediaUrl(joidbVideoToFavItem(sample()));
    expect(url).toContain("/api/media-proxy?url=");
    expect(url).toContain(encodeURIComponent(sample().thumbnail));
  });
});
