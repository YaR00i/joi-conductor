import { describe, expect, it } from "vitest";
import {
  ollamaRoleMarks,
  ollamaSelectOptions,
  recommendedOllamaNotInstalled,
  resolveInstalledOllamaName,
  sameOllamaModel,
  sortOllamaInstalled,
} from "./ollamaCatalog";

describe("ollama catalog matching", () => {
  it("treats short name and :tag as the same model", () => {
    expect(sameOllamaModel("llama3.2", "llama3.2:latest")).toBe(true);
    expect(sameOllamaModel("qwen2.5:14b", "qwen2.5:14b")).toBe(true);
  });

  it("does not collapse different tags of the same family", () => {
    expect(sameOllamaModel("qwen2.5:7b", "qwen2.5:14b")).toBe(false);
    expect(
      resolveInstalledOllamaName("qwen2.5:14b", ["qwen2.5:7b", "qwen2.5:14b"]),
    ).toBe("qwen2.5:14b");
  });

  it("resolves a typed short name to the installed tag", () => {
    expect(
      resolveInstalledOllamaName("llama3.2", ["qwen2.5:14b", "llama3.2:latest"]),
    ).toBe("llama3.2:latest");
  });

  it("keeps an unknown current value in the select list", () => {
    expect(ollamaSelectOptions("custom:local", ["qwen2.5:14b"])).toEqual([
      "custom:local",
      "qwen2.5:14b",
    ]);
    expect(ollamaSelectOptions("qwen2.5:14b", ["qwen2.5:14b"])).toEqual([
      "qwen2.5:14b",
    ]);
  });

  it("sorts installed names and lists missing recommended presets", () => {
    expect(sortOllamaInstalled(["zeta", "alpha:latest"])).toEqual([
      "alpha:latest",
      "zeta",
    ]);
    const missing = recommendedOllamaNotInstalled(["qwen2.5:14b"]);
    expect(missing.some((p) => p.id === "qwen2.5:14b")).toBe(false);
    expect(missing.some((p) => p.id === "qwen2.5:7b")).toBe(true);
  });

  it("marks assigned roles without treating empty overrides as implicit", () => {
    expect(
      ollamaRoleMarks({
        name: "qwen2.5:14b",
        chat: "qwen2.5:14b",
        router: "",
        extractor: "qwen2.5:7b",
        session: "llama3.2:latest",
      }),
    ).toEqual(["чат"]);
    expect(
      ollamaRoleMarks({
        name: "qwen2.5:7b",
        chat: "qwen2.5:14b",
        router: "qwen2.5:7b",
        extractor: "qwen2.5:7b",
        planner: "qwen2.5:7b",
      }),
    ).toEqual(["роутер", "разбор", "планер"]);
  });
});
