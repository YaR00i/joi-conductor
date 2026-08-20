import { describe, expect, it } from "vitest";
import {
  contentCssToDipRect,
  nativeHandleToHwnd,
  releaseCursorClip,
} from "./cursorClip.mjs";

describe("cursor clip rect", () => {
  it("maps a CSS shell rect onto the window content bounds", () => {
    expect(
      contentCssToDipRect(
        { x: 100, y: 40, width: 1280, height: 800 },
        { left: 16, top: 48, width: 960, height: 640 },
      ),
    ).toEqual({ x: 116, y: 88, width: 960, height: 640 });
  });

  it("rejects a clip smaller than a usable play area", () => {
    expect(
      contentCssToDipRect(
        { x: 0, y: 0, width: 100, height: 100 },
        { left: 0, top: 0, width: 4, height: 4 },
      ),
    ).toBeNull();
  });

  it("reads an HWND from Electron's native handle buffer", () => {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(0x00000000_00abcdefn);
    expect(nativeHandleToHwnd(buf)).toBe(0xabcdefn);
  });

  it("can release the OS cursor clip", () => {
    expect(releaseCursorClip().ok).toBe(true);
  });
});
