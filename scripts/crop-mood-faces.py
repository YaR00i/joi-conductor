"""Crop Hu Tao mood PNGs to face-only square portraits."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

MOOD_DIR = Path(__file__).resolve().parents[1] / "public" / "hu-tao" / "mood"
AVATAR = Path(__file__).resolve().parents[1] / "public" / "hu-tao" / "avatar.png"
NAMES = ("sweet", "calm", "bored", "cruel", "chaotic", "horny")


def face_crop(img: Image.Image) -> Image.Image:
    w, h = img.size
    # Tight face square from full-body mood art (same pose set).
    size = int(w * 0.58)
    left = max(0, (w - size) // 2)
    top = max(0, int(h * 0.03))
    if top + size > h:
        top = max(0, h - size)
    if left + size > w:
        left = max(0, w - size)
    return img.crop((left, top, left + size, top + size))


def main() -> None:
    src_dir = MOOD_DIR / "full"
    if not src_dir.is_dir():
        raise SystemExit(f"Missing full-body sources: {src_dir}")

    for name in NAMES:
        path = src_dir / f"{name}.png"
        img = Image.open(path).convert("RGBA")
        cropped = face_crop(img)
        out = MOOD_DIR / f"{name}.png"
        cropped.save(out, optimize=True)
        print(f"{name}: {img.size} -> {cropped.size}")

    # Keep default avatar in sync with horny mood face crop.
    horny = Image.open(MOOD_DIR / "horny.png")
    horny.save(AVATAR, optimize=True)
    print(f"avatar.png synced from horny ({horny.size})")


if __name__ == "__main__":
    main()
