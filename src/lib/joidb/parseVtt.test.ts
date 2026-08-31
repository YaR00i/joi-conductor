import { describe, expect, it } from "vitest";
import { mapJoidbHlsUrl } from "./hls";
import {
  cueAtTime,
  instructionCues,
  parseJoidbVtt,
} from "./parseVtt";

const SPRITE = `WEBVTT

1
00:00:00.000 --> 00:00:01.000
https://cdn-s.the-joi-database.com/videos/abc/abc_0000.webp?token=x#xywh=0,0,150,84

2
00:00:01.000 --> 00:00:02.000
https://cdn-s.the-joi-database.com/videos/abc/abc_0000.webp?token=x#xywh=150,0,150,84
`;

const INSTRUCTION = `WEBVTT

intro
00:00:00.000 --> 00:00:08.000
Смотри без рук

edge
00:00:08.000 --> 00:00:20.000
Edge. Don't cum.
`;

describe("joidb vtt", () => {
  it("marks plyr sprite cues so they do not become HUD tasks", () => {
    const cues = parseJoidbVtt(SPRITE);
    expect(cues).toHaveLength(2);
    expect(cues.every((c) => c.kind === "sprite")).toBe(true);
    expect(instructionCues(cues)).toEqual([]);
  });

  it("keeps instruction text cues for the HUD", () => {
    const cues = parseJoidbVtt(INSTRUCTION);
    expect(cues.map((c) => c.kind)).toEqual(["instruction", "instruction"]);
    expect(cueAtTime(instructionCues(cues), 10)?.text).toMatch(/Edge/i);
    expect(cueAtTime(instructionCues(cues), 0)?.id).toBe("intro");
  });
});

describe("mapJoidbHlsUrl", () => {
  it("keeps playlists on the joidb proxy and CDN segments on media-proxy", () => {
    expect(mapJoidbHlsUrl("/api/joidb/api/stream/abc")).toBe(
      "/api/joidb/api/stream/abc",
    );
    expect(mapJoidbHlsUrl("/api/stream/abc")).toBe("/api/joidb/api/stream/abc");
    expect(
      mapJoidbHlsUrl(
        "https://cdn-s.the-joi-database.com/videos/abc/seg_0000.ts?token=1",
      ),
    ).toContain("/api/media-proxy?url=");
  });
});
