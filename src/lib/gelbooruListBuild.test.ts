import { beforeEach, describe, expect, it } from "vitest";
import {
  installLocalStorageMock,
  resetLocalStorage,
} from "../test/localStorageMock";
import { saveTagPullAsGelbooruList } from "./gelbooruListBuild";
import { listGelbooruLists } from "./gelbooruLists";
import type { MediaItem } from "./media";

installLocalStorageMock();

beforeEach(() => {
  resetLocalStorage();
});

function post(id: string): MediaItem {
  return {
    id: `gb-${id}`,
    url: `https://img.example/${id}.jpg`,
    previewUrl: `https://img.example/${id}-p.jpg`,
    sampleUrl: `https://img.example/${id}-s.jpg`,
    kind: "image",
    source: "gelbooru",
    tags: "hu_tao soles",
    gelbooruId: id,
  };
}

describe("saveTagPullAsGelbooruList", () => {
  it("stores a user list with the type name and pull note", async () => {
    const list = await saveTagPullAsGelbooruList({
      mediaTypeId: "photo",
      tags: "hu_tao soles",
      query: "hu_tao soles -animated -video",
      usedTags: "hu_tao soles -animated -video",
      items: [post("1"), post("2")],
      want: 40,
    });
    expect(list.origin).toBe("user");
    expect(list.name).toMatch(/^Фото · /);
    expect(list.note).toContain("Теги · Фото · 2 из 40");
    expect(list.note).toContain("ввод · hu_tao soles");
    expect(list.items.map((row) => row.gelbooruId)).toEqual(["1", "2"]);
    const stored = await listGelbooruLists();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.id).toBe(list.id);
  });
});
