import { describe, expect, it } from "vitest";
import {
  applyHfProgressEvent,
  emptyHfProgressState,
  formatBytes,
  formatDuration,
  formatHfProgressDetail,
  parseHfProgressLine,
  stripAnsi,
} from "./hfProgress.mjs";

describe("parseHfProgressLine", () => {
  it("reads tqdm file-count bars", () => {
    const ev = parseHfProgressLine(
      "Fetching 13 files:  38%|###8 | 5/13 [00:29<01:02, 3.64it/s]",
    );
    expect(ev?.kind).toBe("files");
    expect(ev?.n).toBe(5);
    expect(ev?.total).toBe(13);
    expect(ev?.pct).toBe(38);
    expect(ev?.remaining).toBe(62);
  });

  it("reads byte bars and JOI json", () => {
    const bytes = parseHfProgressLine(
      "model.safetensors:  45%|████ | 180MB/400MB [00:12<00:15, 14.2MB/s]",
    );
    expect(bytes?.kind).toBe("bytes");
    expect(bytes?.n).toBeGreaterThan(100_000_000);
    const json = parseHfProgressLine(
      'JOI:{"desc":"Fetching 13 files","n":5,"total":13,"unit":"it","rate":3.64,"elapsed":29,"remaining":62}',
    );
    expect(json?.kind).toBe("files");
    expect(json?.n).toBe(5);
    expect(json?.total).toBe(13);
  });

  it("strips ansi before parse", () => {
    expect(stripAnsi("\x1b[32mhello\x1b[0m")).toBe("hello");
  });
});

describe("applyHfProgressEvent", () => {
  it("blends files + current-file bytes into overall pct", () => {
    let st = emptyHfProgressState();
    st = applyHfProgressEvent(
      st,
      parseHfProgressLine("Fetching 13 files: 38%| | 5/13 [00:29<01:02, 3.64it/s]")!,
    );
    st = applyHfProgressEvent(
      st,
      parseHfProgressLine(
        "weights.safetensors: 50%| | 200MB/400MB [00:10<00:10, 20MB/s]",
      )!,
    );
    expect(st.filesDone).toBe(5);
    expect(st.filesTotal).toBe(13);
    expect(st.pct).toBeGreaterThanOrEqual(42);
    expect(st.pct).toBeLessThan(50);
    expect(formatHfProgressDetail(st, "Qwen/x")).toMatch(/файлы 5\/13/);
  });
});

describe("format helpers", () => {
  it("formats durations and bytes", () => {
    expect(formatDuration(45)).toBe("45 с");
    expect(formatDuration(180)).toBe("~3 мин");
    expect(formatBytes(1536)).toBe("1.5 KB");
  });
});
