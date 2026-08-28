import { describe, expect, it } from "vitest";
import {
  assembleQueryTokens,
  assembleQuotas,
  createAssemblePicker,
  formatAssembleNote,
  formatAssembleQuery,
  formatTagPullNote,
  isThinAssembleBatch,
  spillOwnShortfall,
  withAssembleActs,
} from "./gelbooruAssemblePreset";
import {
  FURINA_PACK,
  HU_TAO_PACK,
  SPARKLE_PACK,
  SUNNA_PACK,
} from "./mistress/packs";

const BODY_TAGS = new Set([
  "foot_focus",
  "feet",
  "cum_on_feet",
  "soles",
  "footjob",
  "armpits",
  "breast_focus",
  "paizuri",
  "ass_focus",
  "from_behind",
  "cum_in_mouth",
  "oral",
  "fellatio",
]);

function rngFrom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function bodyTokens(query: string): string[] {
  return assembleQueryTokens(query).filter((t) => BODY_TAGS.has(t));
}

describe("assembleQuotas", () => {
  it("splits 100 posts by Hu Tao / Furina / Sunna / Sparkle weights", () => {
    expect(assembleQuotas(100, HU_TAO_PACK.media.assemble)).toEqual({
      liked: 40,
      disliked: 15,
      own: 45,
    });
    expect(assembleQuotas(100, FURINA_PACK.media.assemble)).toEqual({
      liked: 30,
      disliked: 25,
      own: 45,
    });
    expect(assembleQuotas(100, SUNNA_PACK.media.assemble)).toEqual({
      liked: 20,
      disliked: 30,
      own: 50,
    });
    expect(assembleQuotas(100, SPARKLE_PACK.media.assemble)).toEqual({
      liked: 10,
      disliked: 35,
      own: 55,
    });
  });
});

describe("spillOwnShortfall", () => {
  it("splits leftover between liked and disliked by their weights", () => {
    expect(spillOwnShortfall(20, HU_TAO_PACK.media.assemble)).toEqual({
      liked: 15,
      disliked: 5,
    });
    expect(spillOwnShortfall(20, FURINA_PACK.media.assemble)).toEqual({
      liked: 11,
      disliked: 9,
    });
  });
});

describe("formatAssembleQuery", () => {
  const who = "hu_tao_(genshin_impact)";

  it("anchors a body tag on the character and never AND two body tags", () => {
    const q = formatAssembleQuery("foot_focus", "body", who);
    expect(q).toBe("hu_tao_(genshin_impact) foot_focus rating:explicit");
    expect(bodyTokens(q)).toEqual(["foot_focus"]);
  });

  it("keeps act and shelf queries to one tag without the character", () => {
    expect(formatAssembleQuery("cbt", "act", who)).toBe("cbt rating:explicit");
    expect(formatAssembleQuery("bondage", "shelf", who)).toBe(
      "bondage rating:explicit",
    );
  });
});

describe("createAssemblePicker", () => {
  it("issues separate body queries, then cluster fallbacks still with the character", () => {
    const picker = createAssemblePicker({
      preset: HU_TAO_PACK.media.assemble,
      character: "hu_tao_(genshin_impact)",
      liked: ["bondage"],
      disliked: ["scat"],
      rng: rngFrom(3),
    });
    const first = picker.nextOwn();
    expect(first).not.toBeNull();
    expect(bodyTokens(first!.query)).toHaveLength(1);
    expect(first!.query.startsWith("hu_tao_(genshin_impact) ")).toBe(true);

    const second = picker.nextOwn();
    expect(second).not.toBeNull();
    const queries = [first!.query, second!.query];
    for (const query of queries) {
      expect(bodyTokens(query)).toHaveLength(1);
      expect(query.includes("foot_focus") && query.includes("armpits")).toBe(
        false,
      );
    }

    const pickerFb = createAssemblePicker({
      preset: withAssembleActs(
        { likedWeight: 40, dislikedWeight: 15, ownWeight: 45 },
        [],
      ),
      character: "hu_tao_(genshin_impact)",
      liked: [],
      disliked: [],
      rng: () => 0.999,
    });
    const slot = pickerFb.nextOwn();
    expect(slot?.key).toBe("foot_focus");
    const fb = pickerFb.fallbackOwn();
    expect(fb?.query).toBe(
      "hu_tao_(genshin_impact) feet rating:explicit",
    );
    expect(bodyTokens(fb!.query)).toEqual(["feet"]);
  });

  it("does not mix liked and disliked in one query", () => {
    const picker = createAssemblePicker({
      preset: HU_TAO_PACK.media.assemble,
      character: "hu_tao_(genshin_impact)",
      liked: ["bondage"],
      disliked: ["scat"],
      rng: rngFrom(1),
    });
    expect(picker.nextShelf("liked")?.query).toBe("bondage rating:explicit");
    expect(picker.nextShelf("disliked")?.query).toBe("scat rating:explicit");
  });
});

describe("pack assemble pools", () => {
  it("gives Sparkle an own body pool and no act pack", () => {
    expect(SPARKLE_PACK.media.assemble.ownWeight).toBe(55);
    expect(
      SPARKLE_PACK.media.assemble.tags.every((row) => row.kind === "body"),
    ).toBe(true);
    expect(
      SPARKLE_PACK.media.assemble.tags.some((row) => row.tag === "armpits"),
    ).toBe(true);
  });

  it("uses trap as Sunna's base act and omits femboy and sissy", () => {
    const tags = SUNNA_PACK.media.assemble.tags.map((row) => row.tag);
    expect(tags).toContain("trap");
    expect(tags).not.toContain("femboy");
    expect(tags).not.toContain("sissy");
    expect(
      SUNNA_PACK.media.assemble.tags.some(
        (row) => row.tag === "interracial" && row.fallback?.includes("dark-skinned_male"),
      ),
    ).toBe(true);
  });
});

describe("isThinAssembleBatch", () => {
  it("treats fewer than 12 new uniques as thin", () => {
    expect(isThinAssembleBatch(11)).toBe(true);
    expect(isThinAssembleBatch(12)).toBe(false);
  });
});

describe("formatAssembleNote", () => {
  it("lists each pull so the queue note shows what was fetched", () => {
    const text = formatAssembleNote({
      mistressName: "Ху Тао",
      want: 80,
      got: 44,
      pulls: [
        {
          bucket: "own",
          query: "hu_tao_(genshin_impact) foot_focus rating:explicit",
          added: 24,
        },
        { bucket: "liked", query: "bondage rating:explicit", added: 20 },
        { bucket: "disliked", query: "scat rating:explicit", added: 0 },
      ],
    });
    expect(text).toContain("Автоочередь Ху Тао · 44 из 80");
    expect(text).toContain("её · hu_tao_(genshin_impact) foot_focus → 24");
    expect(text).toContain("любимое · bondage → 20");
    expect(text).toContain("нелюбимое · scat → пусто");
  });
});

describe("formatTagPullNote", () => {
  it("logs typed tags, the type query, and unused fallbacks", () => {
    const text = formatTagPullNote({
      mediaTypeLabel: "Фото",
      tags: "hu_tao soles",
      query: "hu_tao soles -animated -video rating:explicit",
      usedTags: "hu_tao rating:explicit",
      attempted: [
        "hu_tao soles -animated -video rating:explicit",
        "hu_tao soles rating:explicit",
        "hu_tao rating:explicit",
      ],
      got: 40,
      want: 40,
    });
    expect(text).toContain("Теги · Фото · 40 из 40");
    expect(text).toContain("ввод · hu_tao soles");
    expect(text).toContain("запрос · hu_tao soles -animated -video");
    expect(text).toContain("подошло · hu_tao");
    expect(text).toContain("не подошло:");
    expect(text).toContain("· hu_tao soles -animated -video");
  });

  it("skips fallbacks when the first query already hit", () => {
    const query = "hu_tao soles -animated -video";
    const text = formatTagPullNote({
      mediaTypeLabel: "Фото",
      tags: "hu_tao soles",
      query,
      usedTags: query,
      attempted: [query, "hu_tao"],
      got: 24,
      want: 40,
    });
    expect(text).toContain("Теги · Фото · 24 из 40");
    expect(text).not.toContain("подошло");
    expect(text).not.toContain("не подошло");
  });
});
