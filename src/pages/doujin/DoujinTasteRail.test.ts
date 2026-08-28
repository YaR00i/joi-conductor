import { describe, expect, it } from "vitest";
import type { DoujinTag } from "../../lib/doujin/types";
import {
  buildRailGroups,
  filterRailGroups,
  suggestTasteRailTags,
} from "./DoujinTasteRail";

describe("buildRailGroups", () => {
  it("keeps every named tag, including types skipped by recs", () => {
    const tags: DoujinTag[] = Array.from({ length: 12 }, (_, i) => ({
      type: "tag",
      name: `mood ${i}`,
      count: 12 - i,
      id: i + 1,
    }));
    tags.push({ type: "group", name: "circle nine", count: 3, id: 90 });
    tags.push({ type: "language", name: "english", count: 8, id: 91 });
    const groups = buildRailGroups(tags, [
      { type: "tag", name: "mood 0", id: 1 },
    ]);
    const loved = groups.find((group) => group.id === "loved");
    const moods = groups.find((group) => group.id === "tag");
    const circles = groups.find((group) => group.id === "group");
    expect(loved?.rows).toHaveLength(1);
    expect(moods?.rows).toHaveLength(11);
    expect(circles?.rows[0]).toMatchObject({ tag: { name: "circle nine" } });
    expect(groups.some((group) => group.id === "language")).toBe(true);
  });

  it("lifts sort tags into a section above loved", () => {
    const groups = buildRailGroups(
      [
        { type: "parody", name: "genshin impact", count: 4 },
        { type: "tag", name: "glasses", count: 8 },
      ],
      [{ type: "tag", name: "glasses" }],
      [{ type: "parody", name: "genshin impact" }],
    );
    expect(groups.map((group) => group.id)).toEqual(["sort", "loved"]);
    expect(groups[0]?.rows[0]?.tag.name).toBe("genshin impact");
    expect(groups[1]?.rows[0]?.tag.name).toBe("glasses");
  });
});

describe("suggestTasteRailTags", () => {
  const rows = [
    { tag: { type: "parody" as const, name: "genshin impact" }, count: 9, loved: false },
    { tag: { type: "character" as const, name: "hu tao" }, count: 4, loved: true },
    { tag: { type: "tag" as const, name: "glasses" }, count: 12, loved: false },
  ];

  it("ranks prefix matches ahead of contains", () => {
    const hits = suggestTasteRailTags(rows, "hu");
    expect(hits.map((row) => row.tag.name)).toEqual(["hu tao"]);
  });

  it("matches a substring case-insensitively", () => {
    const hits = suggestTasteRailTags(rows, "IMPACT");
    expect(hits[0]?.tag.name).toBe("genshin impact");
  });

  it("returns nothing for an empty query", () => {
    expect(suggestTasteRailTags(rows, "  ")).toEqual([]);
  });
});

describe("filterRailGroups", () => {
  it("keeps matching rows in every section and an empty loved group", () => {
    const groups = buildRailGroups(
      [
        { type: "parody", name: "genshin impact", count: 4 },
        { type: "character", name: "hu tao", count: 3 },
        { type: "tag", name: "glasses", count: 8 },
      ],
      [{ type: "tag", name: "glasses" }],
    );
    const filtered = filterRailGroups(groups, "tao");
    expect(filtered.map((group) => group.id)).toEqual(["loved", "character"]);
    expect(filtered.find((group) => group.id === "character")?.rows).toHaveLength(
      1,
    );
    expect(filtered.find((group) => group.id === "loved")?.rows).toHaveLength(0);
  });
});
