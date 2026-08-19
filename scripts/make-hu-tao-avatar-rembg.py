from pathlib import Path

from PIL import Image
from rembg import remove

SRC = Path(
    r"C:\Users\novos\.cursor\projects\c-Users-novos-Projects-joi-conductor\assets"
    r"\c__Users_novos_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_"
    r"Genshin-Impact-Hu-Tao-_Genshin-Impact_-Bunnysuit-Raiya-Atelier-7651194-d60b06a4-11aa-48b8-8224-d7f3d95ba9dd.png"
)
OUT = Path(r"C:\Users\novos\Projects\joi-conductor\public\hu-tao\avatar.png")
BG = (14, 10, 9)

im = Image.open(SRC).convert("RGBA")
cut = remove(im)
bbox = cut.getbbox()
if bbox:
    cut = cut.crop(bbox)
pad = 24
canvas = Image.new("RGBA", (cut.width + pad * 2, cut.height + pad * 2), (0, 0, 0, 0))
canvas.paste(cut, (pad, pad), cut)
th = 1200
ratio = th / canvas.height
canvas = canvas.resize((max(1, int(canvas.width * ratio)), th), Image.Resampling.LANCZOS)
final = Image.new("RGB", canvas.size, BG)
final.paste(canvas, mask=canvas.split()[3])
OUT.parent.mkdir(parents=True, exist_ok=True)
final.save(OUT, "PNG", optimize=True)
print("ok", final.size, OUT.stat().st_size)
