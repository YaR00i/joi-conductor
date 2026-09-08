import { describe, expect, it } from "vitest";
import {
  planOptionalRuntimeBootstrapJobs,
  planRequiredRuntimeBootstrapJobs,
  runtimeBootstrapJobLabelRu,
  skipBootstrapJobAfterPythonFail,
  wantsPiperBootstrap,
  type RuntimeBootstrapSnapshot,
} from "./runtimeBootstrap";
import {
  optionalJobsFromSelection,
  planOptionalRuntimeOffers,
} from "./runtimeOptionalOffers";

const FRESH: RuntimeBootstrapSnapshot = {
  desktop: true,
  ttsEnabled: true,
  ttsProvider: "sovits",
  autoStartOllama: true,
  autoStartSovits: true,
  autoStartQwen: false,
  pullOllamaModel: true,
  ollamaModel: "llama3.2",
  pythonReady: false,
  ollamaInstalled: false,
  ollamaRunning: false,
  ollamaModelReady: false,
  piperReady: false,
  censorReady: false,
  autoTagOnImport: true,
  wd14Online: false,
  wd14Installed: false,
  sovitsOnline: false,
  sovitsInstalled: false,
  qwenOnline: false,
  qwenWeightsReady: false,
};

describe("runtimeBootstrap required vs optional", () => {
  it("skips everything outside Electron", () => {
    expect(
      planRequiredRuntimeBootstrapJobs({ ...FRESH, desktop: false }),
    ).toEqual([]);
    expect(
      planOptionalRuntimeBootstrapJobs({ ...FRESH, desktop: false }),
    ).toEqual([]);
  });

  it("queues required first-PC jobs without Ollama", () => {
    expect(planRequiredRuntimeBootstrapJobs(FRESH)).toEqual([
      "python",
      "piper",
      "censor",
      "wd14",
      "sovits",
    ]);
    expect(planOptionalRuntimeBootstrapJobs(FRESH)).toEqual([
      "ollama",
      "ollama-model",
    ]);
  });

  it("skips Python when the portable runtime is already on disk", () => {
    expect(
      planRequiredRuntimeBootstrapJobs({
        ...FRESH,
        pythonReady: true,
        piperReady: true,
        censorReady: true,
        autoTagOnImport: false,
        autoStartSovits: false,
      }),
    ).toEqual([]);
  });

  it("skips Python when nothing needs a venv", () => {
    expect(
      planRequiredRuntimeBootstrapJobs({
        ...FRESH,
        pythonReady: false,
        ttsProvider: "edge",
        autoStartSovits: false,
        autoStartQwen: false,
        piperReady: true,
        censorReady: true,
        autoTagOnImport: false,
      }),
    ).toEqual([]);
  });

  it("skips Piper for Edge / system TTS", () => {
    expect(
      wantsPiperBootstrap({ ttsEnabled: true, ttsProvider: "sovits" }),
    ).toBe(true);
    expect(
      wantsPiperBootstrap({ ttsEnabled: true, ttsProvider: "edge" }),
    ).toBe(false);
  });

  it("adds Qwen when that engine is selected", () => {
    expect(
      planRequiredRuntimeBootstrapJobs({
        ...FRESH,
        pythonReady: true,
        ttsProvider: "qwen",
        autoStartSovits: false,
        autoStartQwen: true,
        piperReady: true,
        censorReady: true,
        autoTagOnImport: false,
      }),
    ).toEqual(["qwen"]);
  });

  it("offers Ollama as optional checkboxes", () => {
    const offers = planOptionalRuntimeOffers(FRESH);
    expect(offers.map((o) => o.id)).toEqual(["ollama", "ollama-model"]);
    expect(optionalJobsFromSelection(["ollama-model"])).toEqual([
      "ollama",
      "ollama-model",
    ]);
    expect(optionalJobsFromSelection(["ollama"])).toEqual(["ollama"]);
    expect(optionalJobsFromSelection([])).toEqual([]);
    expect(
      planOptionalRuntimeOffers({
        ...FRESH,
        ollamaInstalled: true,
        ollamaRunning: true,
        ollamaModelReady: true,
      }),
    ).toEqual([]);
  });

  it("does not re-queue WD14 or SoVITS when files are on disk but servers are off", () => {
    expect(
      planRequiredRuntimeBootstrapJobs({
        ...FRESH,
        pythonReady: true,
        piperReady: true,
        censorReady: true,
        wd14Installed: true,
        sovitsInstalled: true,
        wd14Online: false,
        sovitsOnline: false,
      }),
    ).toEqual([]);
  });

  it("does not re-offer Ollama when the zip is already installed", () => {
    expect(
      planOptionalRuntimeBootstrapJobs({
        ...FRESH,
        ollamaInstalled: true,
        ollamaRunning: false,
        ollamaModelReady: true,
      }),
    ).toEqual([]);
  });

  it("labels Python in Russian", () => {
    expect(runtimeBootstrapJobLabelRu("python")).toBe("Python");
  });

  it("does not start WD14 after Python failed", () => {
    expect(skipBootstrapJobAfterPythonFail("wd14", true)).toBe(true);
    expect(skipBootstrapJobAfterPythonFail("sovits", true)).toBe(true);
    expect(skipBootstrapJobAfterPythonFail("piper", true)).toBe(false);
    expect(skipBootstrapJobAfterPythonFail("wd14", false)).toBe(false);
  });
});
