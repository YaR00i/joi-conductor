"""Composite Hu Tao onto dark frame bg — clean opaque avatar."""
from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(r"C:\Users\novos\Projects\joi-conductor")
SRC = Path(
    r"C:\Users\novos\.cursor\projects\c-Users-novos-Projects-joi-conductor\assets"
    r"\c__Users_novos_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_"
    r"Genshin-Impact-Hu-Tao-_Genshin-Impact_-Bunnysuit-Raiya-Atelier-7651194-d60b06a4-11aa-48b8-8224-d7f3d95ba9dd.png"
)
OUT = ROOT / "public" / "hu-tao" / "avatar.png"

# Match roulette-avatar__frame background
BG = (14, 10, 9, 255)


def is_paper(r: int, g: int, b: int) -> bool:
    return r >= 248 and g >= 248 and b >= 248


def cut_mask(im: Image.Image) -> Image.Image:
    """Alpha mask: 0 = paper bg from edges, 255 = subject."""
    rgb = im.convert("RGB")
    w, h = rgb.size
    px = rgb.load()
    mask = Image.new("L", (w, h), 255)
    mp = mask.load()
    visited = bytearray(w * h)

    def idx(x: int, y: int) -> int:
        return y * w + x

    q: deque[tuple[int, int]] = deque()
    for x in range(0, w, 4):
        q.append((x, 0))
        q.append((x, h - 1))
    for y in range(0, h, 4):
        q.append((0, y))
        q.append((w - 1, y))

    while q:
        x, y = q.popleft()
        i = idx(x, y)
        if visited[i]:
            continue
        visited[i] = 1
        r, g, b = px[x, y]
        if not is_paper(r, g, b):
            continue
        mp[x, y] = 0
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not visited[idx(nx, ny)]:
                nr, ng, nb = px[nx, ny]
                if is_paper(nr, ng, nb):
                    q.append((nx, ny))
    return mask


def main() -> None:
    src = Image.open(SRC).convert("RGBA")
    mask = cut_mask(src)
    # Slight erode of bg (dilate subject) to kill white fringe
    # → expand subject by marking near-white border pixels as subject if neighbor is subject
    # Simpler: composite with hard mask onto BG
    subject = src.copy()
    subject.putalpha(mask)

    # Bounding box of subject
    bbox = mask.getbbox()
    if bbox:
        subject = subject.crop(bbox)
        # pad
        pad = 16
        canvas = Image.new(
            "RGBA",
            (subject.width + pad * 2, subject.height + pad * 2),
            (0, 0, 0, 0),
        )
        canvas.paste(subject, (pad, pad), subject)
        subject = canvas

    # Target display size
    target_h = 1200
    ratio = target_h / subject.height
    subject = subject.resize(
        (int(subject.width * ratio), target_h),
        Image.Resampling.LANCZOS,
    )

    # Opaque composite on dark bg
    out = Image.new("RGBA", subject.size, BG)
    out.paste(subject, (0, 0), subject)
    # flatten to RGB (no transparency artifacts in browser)
    final = Image.new("RGB", out.size, BG[:3])
    final.paste(out, mask=out.split()[3])

    OUT.parent.mkdir(parents=True, exist_ok=True)
    final.save(OUT, "PNG", optimize=True)
    print("saved", OUT, final.size)


if __name__ == "__main__":
    main()
