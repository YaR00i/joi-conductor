"""Analyze emoji sheet layout and re-cut with better chroma key."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(r"C:\Users\novos\Projects\joi-conductor")
ASSETS = Path(
    r"C:\Users\novos\.cursor\projects\c-Users-novos-Projects-joi-conductor\assets"
)
OUT = ROOT / "public" / "hu-tao"
EMOJI_OUT = OUT / "emoji"

PORTRAIT = ASSETS / (
    "c__Users_novos_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_"
    "Genshin-Impact-Hu-Tao-_Genshin-Impact_-Bunnysuit-Raiya-Atelier-7651194-d60b06a4-11aa-48b8-8224-d7f3d95ba9dd.png"
)
SHEET = ASSETS / (
    "c__Users_novos_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_"
    "grok-image-36a0d31c-cb75-4ff0-986f-5f595fc41ac8-d414f1c8-71e7-4495-9c7f-7e0e65d49468.png"
)

EMOJI_KEYS = [
    "angry",
    "dizzy",
    "shy",
    "cheer",
    "smug",
    "shock",
    "yawn",
    "pout",
    "sleep",
]


def is_white(r: int, g: int, b: int, thr: int = 248) -> bool:
    return min(r, g, b) >= thr and (max(r, g, b) - min(r, g, b)) <= 12


def chroma_key_white(im: Image.Image, thr: int = 246, soft: int = 14) -> Image.Image:
    """Only punch out near-pure white; keep skin (lower min channel)."""
    rgba = im.convert("RGBA")
    pixels = list(rgba.getdata())
    out = []
    for r, g, b, a in pixels:
        mn = min(r, g, b)
        mx = max(r, g, b)
        sat = mx - mn
        if mn >= thr and sat <= 14:
            out.append((r, g, b, 0))
        elif mn >= thr - soft and sat <= 20:
            t = (thr - mn) / soft
            t = max(0.0, min(1.0, t))
            out.append((r, g, b, int(a * t)))
        else:
            out.append((r, g, b, a))
    rgba.putdata(out)
    return rgba


def trim(im: Image.Image, pad: int = 6) -> Image.Image:
    bbox = im.getbbox()
    if not bbox:
        return im
    l, t, r, b = bbox
    return im.crop(
        (
            max(0, l - pad),
            max(0, t - pad),
            min(im.width, r + pad),
            min(im.height, b + pad),
        )
    )


def find_content_rows(im: Image.Image, thr: int = 245) -> list[tuple[int, int]]:
    """Find vertical bands with non-white content."""
    rgba = im.convert("RGBA")
    w, h = rgba.size
    px = rgba.load()
    row_has = []
    for y in range(h):
        has = False
        for x in range(0, w, 3):
            r, g, b, _ = px[x, y]
            if not is_white(r, g, b, thr):
                has = True
                break
        row_has.append(has)

    bands: list[tuple[int, int]] = []
    start = None
    for y, has in enumerate(row_has):
        if has and start is None:
            start = y
        elif not has and start is not None:
            if y - start > 20:
                bands.append((start, y))
            start = None
    if start is not None and h - start > 20:
        bands.append((start, h))
    return bands


def find_content_cols(im: Image.Image, thr: int = 245) -> list[tuple[int, int]]:
    rgba = im.convert("RGBA")
    w, h = rgba.size
    px = rgba.load()
    col_has = []
    for x in range(w):
        has = False
        for y in range(0, h, 3):
            r, g, b, _ = px[x, y]
            if not is_white(r, g, b, thr):
                has = True
                break
        col_has.append(has)

    bands: list[tuple[int, int]] = []
    start = None
    for x, has in enumerate(col_has):
        if has and start is None:
            start = x
        elif not has and start is not None:
            if x - start > 20:
                bands.append((start, x))
            start = None
    if start is not None and w - start > 20:
        bands.append((start, w))
    return bands


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    EMOJI_OUT.mkdir(parents=True, exist_ok=True)

    # Portrait — soft white key only
    port = Image.open(PORTRAIT)
    port = chroma_key_white(port, thr=247, soft=16)
    # light despeckle of remaining white fringe via min filter on alpha
    r, g, b, a = port.split()
    a = a.filter(ImageFilter.MinFilter(3))
    port = Image.merge("RGBA", (r, g, b, a))
    port = trim(port, 10)
    w, h = port.size
    if h / max(1, w) > 1.4:
        port = port.crop((0, 0, w, int(w * 1.32)))
    if port.width > 720:
        ratio = 720 / port.width
        port = port.resize((720, int(port.height * ratio)), Image.Resampling.LANCZOS)
    port.save(OUT / "avatar.png", "PNG", optimize=True)
    print("avatar", (OUT / "avatar.png").stat().st_size, port.size)

    # Analyze sheet
    sheet = Image.open(SHEET).convert("RGBA")
    rows = find_content_rows(sheet)
    cols = find_content_cols(sheet)
    print("row bands", rows)
    print("col bands", cols)

    # Prefer equal 3x3 grid if bands unclear
    sw, sh = sheet.size
    if len(rows) >= 3 and len(cols) >= 3:
        # merge to 3 largest-ish bands
        def top3(bands: list[tuple[int, int]]) -> list[tuple[int, int]]:
            ranked = sorted(bands, key=lambda b: b[1] - b[0], reverse=True)[:3]
            return sorted(ranked, key=lambda b: b[0])

        rows = top3(rows)
        cols = top3(cols)
    else:
        cols = [(i * sw // 3, (i + 1) * sw // 3) for i in range(3)]
        rows = [(i * sh // 3, (i + 1) * sh // 3) for i in range(3)]

    print("using rows", rows)
    print("using cols", cols)

    for i, key in enumerate(EMOJI_KEYS):
        rr = i // 3
        cc = i % 3
        x0, x1 = cols[cc]
        y0, y1 = rows[rr]
        inset_x = max(2, (x1 - x0) // 50)
        inset_y = max(2, (y1 - y0) // 50)
        cell = sheet.crop((x0 + inset_x, y0 + inset_y, x1 - inset_x, y1 - inset_y))
        cell = chroma_key_white(cell, thr=247, soft=12)
        r, g, b, a = cell.split()
        a = a.filter(ImageFilter.MinFilter(3))
        cell = Image.merge("RGBA", (r, g, b, a))
        cell = trim(cell, 4)
        side = 280
        cell.thumbnail((side, side), Image.Resampling.LANCZOS)
        canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        canvas.paste(cell, ((side - cell.width) // 2, (side - cell.height) // 2), cell)
        canvas.save(EMOJI_OUT / f"{key}.png", "PNG", optimize=True)
        print("emoji", key, canvas.size, "bbox ok")

    # alpha check
    av = Image.open(OUT / "avatar.png")
    alphas = [p[3] for p in av.getdata()]
    print(
        "avatar alpha: zero=",
        sum(1 for a in alphas if a == 0),
        "partial=",
        sum(1 for a in alphas if 0 < a < 255),
        "solid=",
        sum(1 for a in alphas if a == 255),
    )


if __name__ == "__main__":
    main()
