import { describe, expect, it } from "vitest";
import { DEFAULT_MEDIA_CENSOR, penisRevealHoles } from "./mediaCensor";
import {
  CENSOR_DETECT_ANIME_INPUT,
  CENSOR_DETECT_ANIME_NUM_CLASSES,
  CENSOR_DETECT_INPUT,
  CENSOR_DETECT_NUM_CLASSES,
  PP_YOLO_CLASSES,
  animeClassToPart,
  booruClassToPart,
  censorDetectRuntimeFromRun,
  decodeYoloV8Output,
  decodeYoloxOutput,
  detectionsToNormBoxes,
  formatCensorDetectLogLine,
  handClassToPart,
  hotscreenClassToPart,
  letterboxRatio,
  mapDetectionsToSrc,
  nmsDetections,
  ppClassToPart,
  resolveCensorBoxes,
  rgbaToYoloV8Input,
  rgbaToYoloxInput,
  srcDetectionsToNormBoxes,
  yoloxAnchorCount,
} from "./mediaCensorDetect";

describe("mediaCensorDetect", () => {
  it("maps Hotscreen class ids onto overlay parts", () => {
    expect(hotscreenClassToPart(0)).toBe("face");
    expect(hotscreenClassToPart(1)).toBe("face");
    expect(hotscreenClassToPart(6)).toBe("breasts");
    expect(hotscreenClassToPart(7)).toBe("breasts");
    expect(hotscreenClassToPart(8)).toBe("breasts");
    expect(hotscreenClassToPart(2)).toBe("genitals");
    expect(hotscreenClassToPart(3)).toBe("genitals");
    expect(hotscreenClassToPart(11)).toBe("penis");
    expect(hotscreenClassToPart(12)).toBe("genitals");
    expect(hotscreenClassToPart(4)).toBe("ass");
    expect(hotscreenClassToPart(5)).toBe("ass");
    expect(hotscreenClassToPart(9)).toBe("armpits");
    expect(hotscreenClassToPart(10)).toBe("belly");
    expect(hotscreenClassToPart(13)).toBe("feet");
    expect(hotscreenClassToPart(14)).toBe("feet");
    expect(hotscreenClassToPart(99)).toBeNull();
  });

  it("uses 2100 YOLOX anchors at 320 and top-left letterbox scale", () => {
    expect(yoloxAnchorCount(320)).toBe(2100);
    expect(letterboxRatio(640, 320)).toBeCloseTo(0.5);
    expect(letterboxRatio(160, 320)).toBeCloseTo(1);
  });

  it("decodes a high-score breast box at grid (0,0) stride 8", () => {
    const anchors = yoloxAnchorCount();
    const last = 4 + 1 + CENSOR_DETECT_NUM_CLASSES;
    const data = new Float32Array(anchors * last);
    data[0] = 0.5;
    data[1] = 0.5;
    data[2] = 0;
    data[3] = 0;
    data[4] = 1;
    data[5 + 7] = 1;
    const dets = decodeYoloxOutput(data, [1, anchors, last], {
      scoreMin: 0.2,
    });
    expect(dets).toHaveLength(1);
    expect(dets[0]?.part).toBe("breasts");
    expect(dets[0]?.classId).toBe(7);
    expect(dets[0]?.x1).toBeCloseTo(0);
    expect(dets[0]?.y1).toBeCloseTo(0);
    expect(dets[0]?.x2).toBeCloseTo(8);
    expect(dets[0]?.y2).toBeCloseTo(8);

    const boxes = detectionsToNormBoxes(dets, CENSOR_DETECT_INPUT, CENSOR_DETECT_INPUT);
    expect(boxes[0]?.w).toBeCloseTo(8 / 320);
    expect(boxes[0]?.part).toBe("breasts");
  });

  it("drops ignored classes and filtered parts", () => {
    const anchors = yoloxAnchorCount();
    const last = 4 + 1 + CENSOR_DETECT_NUM_CLASSES;
    const data = new Float32Array(anchors * last);
    data[4] = 1;
    data[5 + 9] = 1;
    expect(
      decodeYoloxOutput(data, [1, anchors, last], {
        scoreMin: 0.2,
        parts: { ...DEFAULT_MEDIA_CENSOR.parts, armpits: false },
      }),
    ).toEqual([]);

    data[5 + 9] = 0;
    data[5 + 7] = 1;
    expect(
      decodeYoloxOutput(data, [1, anchors, last], {
        scoreMin: 0.2,
        parts: {
          ...DEFAULT_MEDIA_CENSOR.parts,
          breasts: false,
        },
      }),
    ).toEqual([]);
  });

  it("keeps YOLOX armpits when that zone is on", () => {
    const anchors = yoloxAnchorCount();
    const last = 4 + 1 + CENSOR_DETECT_NUM_CLASSES;
    const data = new Float32Array(anchors * last);
    data[4] = 1;
    data[5 + 9] = 1;
    const dets = decodeYoloxOutput(data, [1, anchors, last], {
      scoreMin: 0.2,
      parts: { ...DEFAULT_MEDIA_CENSOR.parts, armpits: true },
    });
    expect(dets).toHaveLength(1);
    expect(dets[0]?.part).toBe("armpits");
    expect(dets[0]?.classId).toBe(9);
  });

  it("keeps penis detections as reveal holes when that zone is off", () => {
    const anchors = yoloxAnchorCount();
    const last = 4 + 1 + CENSOR_DETECT_NUM_CLASSES;
    const data = new Float32Array(anchors * last);
    data[4] = 1;
    data[5 + 11] = 1;
    const droppedCover = decodeYoloxOutput(data, [1, anchors, last], {
      scoreMin: 0.2,
      parts: { ...DEFAULT_MEDIA_CENSOR.parts, penis: false },
    });
    expect(droppedCover).toHaveLength(1);
    expect(droppedCover[0]?.part).toBe("penis");
    const kept = decodeYoloxOutput(data, [1, anchors, last], {
      scoreMin: 0.2,
      parts: { ...DEFAULT_MEDIA_CENSOR.parts, penis: true },
    });
    expect(kept).toHaveLength(1);
    expect(kept[0]?.part).toBe("penis");
    expect(kept[0]?.classId).toBe(11);

    const count = 2;
    const channels = 4 + CENSOR_DETECT_ANIME_NUM_CLASSES;
    const v8 = new Float32Array(channels * count);
    v8[0] = 80;
    v8[count] = 80;
    v8[2 * count] = 16;
    v8[3 * count] = 16;
    v8[5 * count] = 0.9;
    const hole = decodeYoloV8Output(v8, [1, channels, count], {
      scoreMin: 0.2,
      parts: { ...DEFAULT_MEDIA_CENSOR.parts, penis: false },
    });
    expect(hole[0]?.part).toBe("penis");
    expect(hole[0]?.classId).toBe(1);
  });

  it("nms keeps the higher score of two overlapping same-part boxes", () => {
    const kept = nmsDetections(
      [
        {
          x1: 0,
          y1: 0,
          x2: 10,
          y2: 10,
          score: 0.4,
          classId: 7,
          part: "breasts",
          source: "real",
        },
        {
          x1: 1,
          y1: 1,
          x2: 11,
          y2: 11,
          score: 0.9,
          classId: 6,
          part: "breasts",
          source: "real",
        },
      ],
      0.3,
    );
    expect(kept).toHaveLength(1);
    expect(kept[0]?.score).toBe(0.9);
  });

  it("packs canvas RGBA into CHW float RGB", () => {
    const rgba = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255]);
    const chw = rgbaToYoloxInput(rgba, 2, 1);
    expect(Array.from(chw)).toEqual([10, 40, 20, 50, 30, 60]);
  });

  it("falls back to authored bands when detect is empty or coverage is full", () => {
    const bands = resolveCensorBoxes(
      { ...DEFAULT_MEDIA_CENSOR, detect: true },
      null,
    );
    expect(bands.length).toBeGreaterThan(0);
    expect(bands.some((b) => b.part === "breasts")).toBe(true);

    const neural = resolveCensorBoxes(
      { ...DEFAULT_MEDIA_CENSOR, detect: true, strength: 1 },
      [{ x: 0.2, y: 0.3, w: 0.1, h: 0.1, part: "breasts" }],
    );
    expect(neural.filter((b) => b.part === "breasts")).toHaveLength(1);
    expect(neural.find((b) => b.part === "breasts")?.x).toBeCloseTo(0.2);
    expect(neural.some((b) => b.part === "ass")).toBe(true);
    expect(neural.some((b) => b.part === "genitals")).toBe(true);

    const allNeural = resolveCensorBoxes(
      {
        ...DEFAULT_MEDIA_CENSOR,
        detect: true,
        strength: 1,
        parts: { ...DEFAULT_MEDIA_CENSOR.parts, breasts: true, genitals: true, penis: false, ass: false, face: false },
      },
      [
        { x: 0.2, y: 0.3, w: 0.1, h: 0.1, part: "breasts" },
        { x: 0.4, y: 0.6, w: 0.1, h: 0.1, part: "genitals" },
      ],
    );
    expect(allNeural).toHaveLength(2);

    const full = resolveCensorBoxes(
      { ...DEFAULT_MEDIA_CENSOR, detect: true, coverage: "full" },
      [{ x: 0.2, y: 0.3, w: 0.1, h: 0.1, part: "breasts" }],
    );
    expect(full[0]?.part).toBe("frame");
  });

  it("does not paint penis cover when the zone is off, even if detected", () => {
    const cover = resolveCensorBoxes(
      {
        ...DEFAULT_MEDIA_CENSOR,
        detect: true,
        bandsFallback: false,
        strength: 1,
      },
      [
        { x: 0.2, y: 0.3, w: 0.1, h: 0.1, part: "breasts" },
        { x: 0.45, y: 0.55, w: 0.08, h: 0.18, part: "penis" },
        { x: 0.4, y: 0.6, w: 0.12, h: 0.12, part: "genitals" },
      ],
    );
    expect(cover.some((b) => b.part === "penis")).toBe(false);
    expect(cover.some((b) => b.part === "genitals")).toBe(true);
    expect(cover.some((b) => b.part === "breasts")).toBe(true);
  });

  it("skips typical-frame bands when bandsFallback is off", () => {
    const empty = resolveCensorBoxes(
      { ...DEFAULT_MEDIA_CENSOR, detect: true, bandsFallback: false },
      null,
    );
    expect(empty).toEqual([]);

    const neural = resolveCensorBoxes(
      {
        ...DEFAULT_MEDIA_CENSOR,
        detect: true,
        bandsFallback: false,
        strength: 1,
      },
      [{ x: 0.2, y: 0.3, w: 0.1, h: 0.1, part: "breasts" }],
    );
    expect(neural).toHaveLength(1);
    expect(neural[0]?.part).toBe("breasts");
  });

  it("maps anime YOLO classes onto breasts / penis / pussy", () => {
    expect(animeClassToPart(0)).toBe("breasts");
    expect(animeClassToPart(1)).toBe("penis");
    expect(animeClassToPart(2)).toBe("genitals");
    expect(animeClassToPart(9)).toBeNull();
  });

  it("maps booru YOLO classes onto face / breasts / ass / genitals", () => {
    expect(booruClassToPart(0)).toBe("face");
    expect(booruClassToPart(1)).toBe("breasts");
    expect(booruClassToPart(2)).toBe("breasts");
    expect(booruClassToPart(4)).toBe("breasts");
    expect(booruClassToPart(7)).toBe("ass");
    expect(booruClassToPart(8)).toBe("ass");
    expect(booruClassToPart(6)).toBe("genitals");
    expect(booruClassToPart(10)).toBe("genitals");
    expect(booruClassToPart(3)).toBeNull();
    expect(booruClassToPart(5)).toBe("belly");
  });

  it("maps pose and hand YOLO classes onto overlay parts", () => {
    expect(ppClassToPart(0)).toBe("penis");
    expect(ppClassToPart(1)).toBe("genitals");
    expect(ppClassToPart(5)).toBe("breasts");
    expect(ppClassToPart(6)).toBe("hands");
    expect(ppClassToPart(7)).toBe("face");
    expect(ppClassToPart(8)).toBe("genitals");
    expect(ppClassToPart(99)).toBeNull();
    expect(handClassToPart(0)).toBe("hands");
    expect(handClassToPart(1)).toBeNull();
  });

  it("does not treat oral pose boxes as penis reveal holes", () => {
    expect(PP_YOLO_CLASSES[7]).toBe("orl");
    expect(ppClassToPart(7)).not.toBe("penis");
    const holes = penisRevealHoles(DEFAULT_MEDIA_CENSOR, [
      { x: 0.05, y: 0.1, w: 0.22, h: 0.28, part: "face" },
      { x: 0.62, y: 0.12, w: 0.2, h: 0.26, part: "face" },
      { x: 0.38, y: 0.28, w: 0.18, h: 0.42, part: "penis" },
    ]);
    expect(holes).toHaveLength(1);
    expect(holes[0]?.part).toBe("penis");
    expect(holes[0]!.x).toBeGreaterThan(0.3);
  });

  it("nms area prefer keeps the larger overlapping box", () => {
    const kept = nmsDetections(
      [
        {
          x1: 10,
          y1: 10,
          x2: 20,
          y2: 20,
          score: 0.95,
          classId: 0,
          part: "breasts",
          source: "anime",
        },
        {
          x1: 0,
          y1: 0,
          x2: 40,
          y2: 40,
          score: 0.4,
          classId: 2,
          part: "breasts",
          source: "booru",
        },
      ],
      0.3,
      "area",
    );
    expect(kept).toHaveLength(1);
    expect(kept[0]?.source).toBe("booru");
    expect(kept[0]?.x2).toBe(40);
  });

  it("decodes YOLOv8 [1, 7, N] cxcywh in input pixels", () => {
    const count = 4;
    const channels = 4 + CENSOR_DETECT_ANIME_NUM_CLASSES;
    const data = new Float32Array(channels * count);
    data[0] = 320;
    data[count] = 320;
    data[2 * count] = 64;
    data[3 * count] = 64;
    data[6 * count] = 0.91;
    const dets = decodeYoloV8Output(data, [1, channels, count], {
      scoreMin: 0.2,
    });
    expect(dets).toHaveLength(1);
    expect(dets[0]?.part).toBe("genitals");
    expect(dets[0]?.classId).toBe(2);
    expect(dets[0]?.source).toBe("anime");
    expect(dets[0]?.x1).toBeCloseTo(288);
    expect(dets[0]?.y1).toBeCloseTo(288);
    expect(dets[0]?.x2).toBeCloseTo(352);
    expect(dets[0]?.y2).toBeCloseTo(352);

    const src = mapDetectionsToSrc(
      dets,
      800,
      400,
      CENSOR_DETECT_ANIME_INPUT,
      "stretch",
    );
    expect(src[0]?.x1).toBeCloseTo(288 * (800 / 640));
    const boxes = srcDetectionsToNormBoxes(src, 800, 400);
    expect(boxes[0]?.part).toBe("genitals");
    expect(boxes[0]?.w).toBeCloseTo(64 / 640);
  });

  it("also reads YOLOv8 [1, N, 7] layout", () => {
    const count = 2;
    const channels = 4 + CENSOR_DETECT_ANIME_NUM_CLASSES;
    const data = new Float32Array(count * channels);
    data[0] = 100;
    data[1] = 80;
    data[2] = 40;
    data[3] = 20;
    data[4] = 0.88;
    const dets = decodeYoloV8Output(data, [1, count, channels], {
      scoreMin: 0.2,
    });
    expect(dets).toHaveLength(1);
    expect(dets[0]?.part).toBe("breasts");
    expect(dets[0]?.x1).toBeCloseTo(80);
    expect(dets[0]?.y2).toBeCloseTo(90);
  });

  it("packs canvas RGBA into CHW 0–1 for anime YOLO", () => {
    const rgba = new Uint8ClampedArray([255, 0, 128, 255]);
    const chw = rgbaToYoloV8Input(rgba, 1, 1);
    expect(chw[0]).toBeCloseTo(1);
    expect(chw[1]).toBeCloseTo(0);
    expect(chw[2]).toBeCloseTo(128 / 255);
  });

  it("writes a miss log with max score so empty is not 'engine dead'", () => {
    const runtime = censorDetectRuntimeFromRun({
      boxes: [],
      ms: 41,
      hits: [],
      maxScore: 0.12,
      sources: ["booru", "anime"],
    });
    expect(runtime.ok).toBe(true);
    expect(runtime.boxCount).toBe(0);
    expect(runtime.detail).toContain("пусто");
    expect(runtime.detail).toContain("макс 0.12");
    expect(runtime.detail).toContain("аниме");
    const line = formatCensorDetectLogLine(
      runtime,
      new Date("2026-09-01T08:03:04"),
    );
    expect(line).toMatch(/пусто/);
    expect(line).toContain(runtime.detail);
  });

  it("writes a hit log with part scores", () => {
    const runtime = censorDetectRuntimeFromRun({
      boxes: [{ x: 0.2, y: 0.3, w: 0.1, h: 0.1, part: "breasts" }],
      ms: 48,
      hits: [
        {
          part: "breasts",
          score: 0.71,
          className: "nipple_f",
          source: "anime",
        },
      ],
      maxScore: 0.71,
      sources: ["booru", "anime"],
    });
    expect(runtime.detail).toContain("аниме");
    expect(runtime.detail).toContain("грудь 0.71");
    expect(runtime.boxCount).toBe(1);
  });
});
