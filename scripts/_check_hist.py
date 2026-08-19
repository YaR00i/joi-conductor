from pathlib import Path

h = Path(r"C:\Users\novos\AppData\Roaming\Cursor\User\History\239458f9")
for p in sorted(h.glob("*.json")):
    if p.name == "entries.json":
        continue
    t = p.read_text(encoding="utf-8", errors="replace")
    print(p.name, p.stat().st_size, "vox_countish", t.count('"id": "vox_'))
