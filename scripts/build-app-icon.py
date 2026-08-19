"""Export app icon from the provided JOI artwork."""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SRC = Path(
    r"C:\Users\novos\.cursor\projects\c-Users-novos-Projects-joi-conductor\assets"
    r"\c__Users_novos_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images"
    r"_grok-image-d5a1e945-3171-45c5-a0af-35aa9a72cc91______-c704a2d9-81e5-4215-b019-ecae78ef6637.png"
)
OUT_DIR = Path(r"C:\Users\novos\Projects\joi-conductor\public")
OUT_PNG = OUT_DIR / "icon.png"
OUT_ICO = OUT_DIR / "icon.ico"


def rounded_rect_mask(size: int, radius: float) -> Image.Image:
    scale = 4
    big = size * scale
    rad = max(1.0, radius * scale)
    mask = Image.new("L", (big, big), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, big - 1, big - 1), radius=rad, fill=255)
    return mask.resize((size, size), Image.Resampling.LANCZOS)


def main() -> None:
    im = Image.open(SRC).convert("RGBA")
    arr = np.array(im)
    # Drop near-invisible dust
    arr[arr[..., 3] < 8] = 0

    a = arr[..., 3]
    ys, xs = np.where(a > 12)
    if len(xs) == 0:
        raise SystemExit("empty icon")
    pad = 4
    x0 = max(0, int(xs.min()) - pad)
    y0 = max(0, int(ys.min()) - pad)
    x1 = min(im.width, int(xs.max()) + pad + 1)
    y1 = min(im.height, int(ys.max()) + pad + 1)
    cropped = Image.fromarray(arr, "RGBA").crop((x0, y0, x1, y1))

    side = max(cropped.size)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(
        cropped,
        ((side - cropped.width) // 2, (side - cropped.height) // 2),
        cropped,
    )

    # Clean squircle edge
    radius = side * 0.22
    mask = rounded_rect_mask(side, radius).filter(
        ImageFilter.GaussianBlur(radius=0.6)
    )
    rgba = np.array(canvas)
    m = np.array(mask).astype(np.float32) / 255.0
    rgba[..., 3] = (rgba[..., 3].astype(np.float32) * m).clip(0, 255).astype(
        np.uint8
    )
    rgba[rgba[..., 3] < 10] = 0
    final = Image.fromarray(rgba, "RGBA")

    def sized(n: int) -> Image.Image:
        img = final.resize((n, n), Image.Resampling.LANCZOS)
        a = np.array(img)
        a[a[..., 3] < 10] = 0
        return Image.fromarray(a, "RGBA")

    s512 = sized(512)
    s256 = sized(256)
    s128 = sized(128)
    s64 = sized(64)
    s32 = sized(32)
    s16 = sized(16)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    s512.save(OUT_PNG, "PNG")
    s256.save(
        OUT_ICO,
        format="ICO",
        sizes=[(256, 256), (128, 128), (64, 64), (32, 32), (16, 16)],
        append_images=[s128, s64, s32, s16],
    )
    print("wrote", OUT_PNG)
    print("wrote", OUT_ICO)
    print("corners", np.array(s512)[0, 0, 3], np.array(s512)[-1, -1, 3])


if __name__ == "__main__":
    main()
