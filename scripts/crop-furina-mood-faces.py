"""Crop Furina mood PNGs to face-only square portraits (bunny set)."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

MOOD_DIR = Path(__file__).resolve().parents[1] / "public" / "furina" / "mood"
AVATAR = Path(__file__).resolve().parents[1] / "public" / "furina" / "avatar.png"
NAMES = ("sweet", "calm", "bored", "cruel", "chaotic", "horny")
FACE_SIZE = 360
# Shift crop window right so the face sits better in the speech bubble.
X_SHIFT = 0.12


def face_crop(img: Image.Image) -> Image.Image:
    w, h = img.size
    size = int(w * 0.62)
    left = max(0, min(w - size, (w - size) // 2 + int(w * X_SHIFT)))
    top = max(0, int(h * 0.02))
    if top + size > h:
        top = max(0, h - size)
    return img.crop((left, top, left + size, top + size))


def main() -> None:
    src_dir = MOOD_DIR / "full"
    if not src_dir.is_dir():
        raise SystemExit(f"Missing full-body sources: {src_dir}")

    for name in NAMES:
        path = src_dir / f"{name}.png"
        img = Image.open(path).convert("RGBA")
        cropped = face_crop(img).resize(
            (FACE_SIZE, FACE_SIZE),
            Image.Resampling.LANCZOS,
        )
        out = MOOD_DIR / f"{name}.png"
        cropped.save(out, optimize=True)
        print(f"{name}: {img.size} -> {cropped.size} (x_shift={X_SHIFT})")

    horny = Image.open(MOOD_DIR / "horny.png")
    horny.save(AVATAR, optimize=True)
    print(f"avatar.png synced from horny ({horny.size})")


if __name__ == "__main__":
    main()
