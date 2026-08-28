import { describe, expect, it } from "vitest";
import {
  lightboxLoadBarWidth,
  lightboxLoadLabel,
} from "./lightboxLoadBar";

describe("lightboxLoadBar", () => {
  it("keeps an indeterminate chunk visible when size is unknown", () => {
    expect(lightboxLoadBarWidth(null)).toBe(32);
    expect(lightboxLoadBarWidth(0)).toBe(4);
    expect(lightboxLoadBarWidth(100)).toBe(100);
  });

  it("names the asset in the loading line", () => {
    expect(lightboxLoadLabel("video", null, "loading")).toBe("Качаю видео…");
    expect(lightboxLoadLabel("image", 41, "loading")).toBe("Качаю фото · 41%");
    expect(lightboxLoadLabel("video", 100, "opening")).toBe(
      "Файл скачан · открываю видео…",
    );
    expect(lightboxLoadLabel("gif", 12, "error")).toBe("Не удалось загрузить");
  });

  it("unwraps preload errors so the lightbox can show the real reason", () => {
    expect(
      lightboxLoadLabel(
        "video",
        null,
        "error",
        "preload failed after 6 attempts (preload timeout). Включи VPN и повтори.",
      ),
    ).toBe("preload timeout");
    expect(
      lightboxLoadLabel(
        "video",
        null,
        "error",
        "файл скачан, но Chromium не смог декодировать видео (кодек/контейнер)",
      ),
    ).toBe("файл скачан, но Chromium не смог декодировать видео (кодек/контейнер)");
  });
});
