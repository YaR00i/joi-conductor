import { describe, expect, it } from "vitest";
import {
  ollamaNameFromManifestRel,
  parseOllamaListOutput,
  uniqueOllamaNames,
} from "./ollamaManifest.mjs";

describe("ollamaNameFromManifestRel", () => {
  it("maps library manifests to short names", () => {
    expect(
      ollamaNameFromManifestRel("registry.ollama.ai/library/qwen2.5/7b"),
    ).toBe("qwen2.5:7b");
    expect(
      ollamaNameFromManifestRel(
        "registry.ollama.ai\\library\\llama3.2\\latest",
      ),
    ).toBe("llama3.2:latest");
  });

  it("keeps namespace for non-library and other hosts", () => {
    expect(
      ollamaNameFromManifestRel("registry.ollama.ai/myuser/mymodel/latest"),
    ).toBe("myuser/mymodel:latest");
    expect(
      ollamaNameFromManifestRel("hf.co/bartowski/Llama-3.2-1B-Instruct/Q4_K_M"),
    ).toBe("hf.co/bartowski/Llama-3.2-1B-Instruct:Q4_K_M");
  });
});

describe("parseOllamaListOutput", () => {
  it("reads the NAME column and skips the header", () => {
    const stdout = [
      "NAME                ID        SIZE    MODIFIED",
      "qwen2.5:7b          abc       4.7 GB  2 days ago",
      "llama3.2:latest     def       2.0 GB  4 weeks ago",
    ].join("\n");
    expect(parseOllamaListOutput(stdout)).toEqual([
      "qwen2.5:7b",
      "llama3.2:latest",
    ]);
  });
});

describe("uniqueOllamaNames", () => {
  it("drops empties and duplicates in order", () => {
    expect(uniqueOllamaNames(["a", "", "a", "b"])).toEqual(["a", "b"]);
  });
});
