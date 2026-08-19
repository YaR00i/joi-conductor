import json
import re
from pathlib import Path

ROOT = Path(r"C:\Users\novos\Projects\joi-conductor")
reg = json.loads((ROOT / "content/ember/voxels/registry.json").read_text(encoding="utf-8"))
ids = sorted(m["id"] for m in reg.get("models", []))
print("models", len(ids))
for i in ids:
    print(" ", i)
print("scenes", len(reg.get("scenes") or []))
map_text = (ROOT / "content/ember/maps/hu_tao_yard.json").read_text(encoding="utf-8")
map_ids = sorted(set(re.findall(r'"modelId"\s*:\s*"([^"]+)"', map_text)))
print("map ids", map_ids)
print("missing", [i for i in map_ids if i not in set(ids)])
