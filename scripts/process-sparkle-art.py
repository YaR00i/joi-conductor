"""Cut Sparkle dual-persona mood art into Hu Tao-shaped PNG slots.

Large Roulette art: two girls. Right = dark Искорка (sparkle),
left = white Искра (sparxie). Mini thumbs follow that naming.
Calm squares from the user are the crop template.
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(r"C:\Users\novos\Projects\joi-conductor")
ASSETS = Path(
    r"C:\Users\novos\.cursor\projects\c-Users-novos-Projects-joi-conductor\assets"
)
OUT = ROOT / "public" / "sparkle"
MOOD_OUT = OUT / "mood"
FULL_OUT = MOOD_OUT / "full"
SPARKLE_OUT = MOOD_OUT / "sparkle"
SPARXIE_OUT = MOOD_OUT / "sparxie"

PREFIX = (
    "c__Users_novos_AppData_Roaming_Cursor_User_workspaceStorage_"
    "70660b7309aeafe0825aa47ccfba894d_images_"
)

# Dual-girl verticals for Roulette mood/full.
SOURCES: dict[str, str] = {
    "sweet": f"{PREFIX}happy_sp2-67868785-d682-4bbc-96ba-21369d580d76.jpg",
    "calm": f"{PREFIX}calm_sp2-5f9adad5-a378-432e-9ad3-15cbbca83715.jpg",
    "bored": f"{PREFIX}bored_sp2-238c9081-5f61-49cd-a5e5-4893cb452bb7.jpg",
    "cruel": f"{PREFIX}angry_sp2-e0cd1012-c15e-41e0-8c2c-2a3e719df2e2.jpg",
    "chaotic": f"{PREFIX}chaos_sp2-99bfc43b-3008-4488-94ee-f96dd7f0d7c0.jpg",
    "horny": f"{PREFIX}naughty_sp2-646ef232-df2d-4de1-8bec-f34d3c1c4d77.jpg",
}
SHOP = ASSETS / f"{PREFIX}shop-cd8888f8-d7d2-42e2-a47e-102ad2e3c205.jpg"

# User-cut calm squares — gold standard framing.
CALM_SPARKLE = ASSETS / (
    f"{PREFIX}calm_sp2_sparkle-d353825e-5faa-4f6e-afe6-d8f74df7fd5b.jpg"
)
CALM_SPARXIE = ASSETS / (
    f"{PREFIX}calm_sp2_sparxie-ddd69b4a-95d2-4277-8f07-3c52863de566.jpg"
)

# Matched on calm full 689x1024 against the user squares.
# sparxie (left/white), sparkle (right/dark): (x, y, size) in pixels.
CROP_BOX = {
    "sparxie": (108, 54, 276),
    "sparkle": (346, 126, 252),
}

# Speech thumb: Искорка (sparkle, dark, right) vs Искра (sparxie, white, left).
PORTRAIT_PERSONA: dict[str, str] = {
    "sweet": "sparkle",
    "calm": "sparkle",
    "bored": "sparkle",
    "cruel": "sparxie",
    "chaotic": "sparxie",
    "horny": "sparxie",
}

PORTRAIT_PX = 478
SHOP_SIZE = (512, 1024)


def save_png(im: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    rgb = im.convert("RGB")
    rgb.save(path, format="PNG", optimize=True)


def cover(im: Image.Image, size: tuple[int, int], top_bias: bool = False) -> Image.Image:
    tw, th = size
    scale = max(tw / im.width, th / im.height)
    nw = max(tw, int(round(im.width * scale)))
    nh = max(th, int(round(im.height * scale)))
    resized = im.resize((nw, nh), Image.Resampling.LANCZOS)
    left = (nw - tw) // 2
    top = 0 if top_bias else (nh - th) // 2
    return resized.crop((left, top, left + tw, top + th))


def crop_persona(im: Image.Image, persona: str) -> Image.Image:
    w, h = im.size
    x0, y0, s0 = CROP_BOX[persona]
    sx = w / 689
    sy = h / 1024
    x = int(round(x0 * sx))
    y = int(round(y0 * sy))
    s = int(round(s0 * min(sx, sy)))
    x = max(0, min(x, w - s))
    y = max(0, min(y, h - s))
    square = im.crop((x, y, x + s, y + s))
    return square.resize((PORTRAIT_PX, PORTRAIT_PX), Image.Resampling.LANCZOS)


def main() -> None:
    MOOD_OUT.mkdir(parents=True, exist_ok=True)
    FULL_OUT.mkdir(parents=True, exist_ok=True)
    SPARKLE_OUT.mkdir(parents=True, exist_ok=True)
    SPARXIE_OUT.mkdir(parents=True, exist_ok=True)

    for mood, filename in SOURCES.items():
        src = ASSETS / filename
        if not src.exists():
            raise FileNotFoundError(src)
        im = Image.open(src)
        save_png(im, FULL_OUT / f"{mood}.png")
        sparkle = crop_persona(im, "sparkle")
        sparxie = crop_persona(im, "sparxie")
        if mood == "calm":
            sparkle = Image.open(CALM_SPARKLE).convert("RGB").resize(
                (PORTRAIT_PX, PORTRAIT_PX), Image.Resampling.LANCZOS
            )
            sparxie = Image.open(CALM_SPARXIE).convert("RGB").resize(
                (PORTRAIT_PX, PORTRAIT_PX), Image.Resampling.LANCZOS
            )
        save_png(sparkle, SPARKLE_OUT / f"{mood}.png")
        save_png(sparxie, SPARXIE_OUT / f"{mood}.png")
        used = PORTRAIT_PERSONA[mood]
        save_png(sparkle if used == "sparkle" else sparxie, MOOD_OUT / f"{mood}.png")
        print(f"{mood}: wired {used}")

    shop = Image.open(SHOP)
    save_png(cover(shop, SHOP_SIZE, top_bias=True), OUT / "shop-avatar.png")
    idle = Image.open(ASSETS / SOURCES["sweet"])
    save_png(idle, OUT / "avatar-full.png")
    print(f"shop {shop.size} -> shop-avatar {SHOP_SIZE}, avatar-full {idle.size}")


if __name__ == "__main__":
    main()
