import { describe, expect, it } from "vitest";
import { pickSoulTopics, soulTextCosine } from "./rag";
import type { SoulTopicFile } from "./types";

describe("soul rag", () => {
  it("returns all topics when there are four or fewer", () => {
    const topics: SoulTopicFile[] = [
      { filename: "a.md", body: "cats" },
      { filename: "b.md", body: "dogs" },
    ];
    expect(pickSoulTopics(topics, "unrelated query")).toHaveLength(2);
  });

  it("ranks by lexical cosine and keeps top 3 when over the threshold", () => {
    const topics: SoulTopicFile[] = [
      { filename: "tea.md", body: "She poured funeral tea and laughed about coffins." },
      { filename: "work.md", body: "Director of the Wangsheng Funeral Parlor keeps ledgers." },
      { filename: "weather.md", body: "Rain over Liyue harbor, fog on the cliffs." },
      { filename: "food.md", body: "Chili and almond tofu at dinner." },
      { filename: "promise.md", body: "He promised to visit the parlor after dusk." },
    ];
    const picked = pickSoulTopics(topics, "funeral tea coffins parlor");
    expect(picked).toHaveLength(3);
    expect(picked.map((t) => t.filename)).toContain("tea.md");
  });

  it("scores overlapping Russian stems higher than unrelated text", () => {
    expect(
      soulTextCosine("он обещал прийти вечером", "он обещал прийти вечером в парлор"),
    ).toBeGreaterThan(soulTextCosine("он обещал прийти вечером", "погода в гавани"));
  });
});
