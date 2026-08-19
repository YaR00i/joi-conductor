import { describe, expect, it } from "vitest";
import {
  buildMediaDrillSessionBridgeFlash,
  mediaDrillAllowsSessionBridge,
  mediaDrillSessionTagHint,
  type ActiveMediaDrill,
} from "./mediaDrill";

function makeDrill(
  partial: Partial<ActiveMediaDrill> = {},
): ActiveMediaDrill {
  const now = Date.now();
  return {
    instanceId: "drill-1",
    dayKey: "2026-07-22",
    defId: "media_cache_triggers",
    limit: 40,
    tag: "nipples",
    triggerRu: "сиськи",
    actionRu: "удар по яйцам",
    timerMin: 25,
    startedAtMs: now,
    deadlineMs: now + 25 * 60_000,
    status: "browsing",
    ...partial,
  };
}

describe("mediaDrill soft session bridge", () => {
  it("allows bridge while browsing/report and builds flash + tag hint", () => {
    const drill = makeDrill();
    expect(mediaDrillAllowsSessionBridge(drill)).toBe(true);
    expect(mediaDrillAllowsSessionBridge({ ...drill, status: "done" })).toBe(
      false,
    );

    const flash = buildMediaDrillSessionBridgeFlash(drill, 16);
    expect(flash.ruleRu).toMatch(/nipples/);
    expect(flash.ruleRu).toMatch(/сиськи/);
    expect(flash.metaRu).toMatch(/медиа/i);
    expect(flash.reward).toBe(16);

    expect(mediaDrillSessionTagHint(drill)).toBe("nipples rating:explicit");
    expect(
      mediaDrillSessionTagHint({
        ...drill,
        tag: "rating:explicit feet",
      }),
    ).toBe("rating:explicit feet");
  });
});
