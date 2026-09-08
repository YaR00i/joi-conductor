import { describe, expect, it } from "vitest";
import {
  buildMediaTypeStep,
  composeContentQuery,
  extractFetishContentTags,
} from "./contentRoulette";

describe("composeContentQuery", () => {
  it("does not default 1girl or -furry when character was not spun", () => {
    const q = composeContentQuery(
      {
        tags: {
          labelRu: "Складки стоп",
          payload: { tags: "soles" },
        },
      },
      "gelbooru",
      "explicit",
    );
    expect(q.tags.split(/\s+/)).toEqual(["rating:explicit", "soles"]);
    expect(q.tags).not.toContain("1girl");
    expect(q.tags).not.toContain("-furry");
  });

  it("keeps 1girl only from the character pick", () => {
    const q = composeContentQuery(
      {
        character: {
          labelRu: "Девочка",
          payload: { characterTags: "1girl" },
        },
      },
      "gelbooru",
      "sensitive",
    );
    expect(q.tags).toContain("1girl");
    expect(q.tags).toContain("rating:sensitive");
  });

  it("Media rating wins over fetish rating:questionable", () => {
    const q = composeContentQuery(
      {
        tags: {
          labelRu: "Одетая",
          payload: { tags: "rating:questionable fully_clothed" },
        },
      },
      "gelbooru",
      "explicit",
    );
    expect(q.tags).toContain("rating:explicit");
    expect(q.tags).not.toContain("rating:questionable");
    expect(q.tags).toContain("fully_clothed");
  });

  it("maps sensitive to rating:safe on realbooru and skips gelbooru meta", () => {
    const q = composeContentQuery(
      {
        media_type: {
          labelRu: "Фото",
          payload: {
            mediaTypeId: "photo",
            mediaQueryTags: "-animated -video",
            mediaKinds: ["image"],
          },
        },
        tags: { payload: { tags: "feet" } },
      },
      "realbooru",
      "sensitive",
    );
    expect(q.tags).toContain("rating:safe");
    expect(q.tags).not.toContain("rating:sensitive");
    expect(q.tags).not.toContain("-animated");
    expect(q.mediaKinds).toEqual(["image"]);
  });

  it("keeps fetish -furry and drops a positive furry token", () => {
    expect(extractFetishContentTags("-furry soles").content).toEqual([
      "-furry",
      "soles",
    ]);
    expect(extractFetishContentTags("furry soles").content).toEqual(["soles"]);
  });

  it("does not offer a saved-list session when no playable list exists", () => {
    const step = buildMediaTypeStep(undefined, undefined, {
      mediaListReady: false,
    });
    expect(step.options.some((option) => option.id === "list")).toBe(false);
    expect(step.options.some((option) => option.id === "photo")).toBe(true);
  });
});
