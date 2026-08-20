import { describe, expect, it } from "vitest";
import { filterOllamaPresets, OLLAMA_CHAT_PRESETS } from "./ollamaCatalog";
import {
  mergeOllamaSearchHits,
  parseOllamaSearchHtml,
} from "./ollamaLibrarySearch";

describe("ollama library search", () => {
  it("pulls official and community slugs out of search HTML", () => {
    const html = `
      <link href="/public/tailwind.css" rel="stylesheet" />
      <a href="/pricing">Pricing</a>
      <a href="/library/qwen2.5">qwen2.5</a>
      <a href="/search?q=x">no</a>
      <a href="/huihui_ai/qwen3-abliterated">abliterated</a>
      <a href="/blog/hello">blog</a>
    `;
    const hits = parseOllamaSearchHtml(html);
    expect(hits.map((h) => h.id)).toEqual([
      "qwen2.5",
      "huihui_ai/qwen3-abliterated",
    ]);
  });

  it("filters recommended catalog locally", () => {
    const found = filterOllamaPresets("14b", OLLAMA_CHAT_PRESETS);
    expect(found.some((p) => p.id === "qwen2.5:14b")).toBe(true);
  });

  it("keeps catalog hits first", () => {
    const merged = mergeOllamaSearchHits(
      [{ id: "qwen2.5:14b", hint: "рекомендуем" }],
      [{ id: "qwen2.5", hint: "hub", source: "hub" }],
    );
    expect(merged[0]?.id).toBe("qwen2.5:14b");
    expect(merged[0]?.source).toBe("catalog");
  });
});
