import { describe, expect, it } from "vitest";
import {
  collectMistressQueueCards,
  datedQueueName,
  mistressQueueName,
  pickMistressQueuePlans,
  tagPullQueueName,
} from "./readingRunBuild";
import type { DoujinCard, DoujinTag } from "./types";

const tags: DoujinTag[] = [
  { type: "parody", name: "genshin impact", count: 40 },
  { type: "character", name: "hu tao", count: 20 },
  { type: "tag", name: "sole female", count: 12 },
  { type: "artist", name: "foo", count: 8 },
];

function card(id: number): DoujinCard {
  return {
    id,
    mediaId: String(id),
    title: { english: `#${id}`, japanese: "", pretty: `#${id}` },
    numPages: 16,
    coverUrl: "",
    thumbnailUrl: "",
    tags: [],
  };
}

describe("pickMistressQueuePlans", () => {
  it("forces language:english and skips group/language types", () => {
    const plans = pickMistressQueuePlans(2, tags, [], [], () => 0);
    expect(plans.length).toBeGreaterThan(0);
    for (const plan of plans) {
      expect(plan.query).toContain("language:english");
      expect(plan.query).not.toMatch(/\bgroup:/);
    }
  });

  it("cruel mood prefers later (rarer) pairings than sweet", () => {
    const sweet = pickMistressQueuePlans(2, tags, [], [], () => 0).map(
      (p) => p.label,
    );
    const cruel = pickMistressQueuePlans(-2, tags, [], [], () => 0).map(
      (p) => p.label,
    );
    expect(sweet[0]).not.toBe(cruel[0]);
  });
});

describe("collectMistressQueueCards", () => {
  it("mixes unique ids up to the requested size", async () => {
    const cards = await collectMistressQueueCards({
      size: 10,
      plans: [
        { query: "a language:english", label: "a" },
        { query: "b language:english", label: "b" },
      ],
      exclude: new Set([1]),
      search: async (query) =>
        query.startsWith("a")
          ? [card(1), card(2), card(3)]
          : [card(3), card(4), card(5)],
    });
    expect(cards.map((c) => c.id)).toEqual([3, 2, 4, 5]);
  });
});

describe("datedQueueName", () => {
  it("labels evening and tag-pull queues the same way", () => {
    const now = Date.UTC(2026, 7, 28);
    expect(datedQueueName("Госпожа", now)).toMatch(/^Госпожа · /);
    expect(mistressQueueName(now)).toMatch(/^Госпожа · /);
    expect(tagPullQueueName("Фото", now)).toMatch(/^Фото · /);
  });
});
