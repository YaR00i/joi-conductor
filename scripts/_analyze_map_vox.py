import json
from pathlib import Path
from collections import Counter

ROOT = Path(r"C:\Users\novos\Projects\joi-conductor")
reg = json.loads((ROOT / "content/ember/voxels/registry.json").read_text(encoding="utf-8"))
m = json.loads((ROOT / "content/ember/maps/hu_tao_yard.json").read_text(encoding="utf-8"))

ids = {x["id"] for x in reg.get("models", [])}
print("registry models", ids)
print("scenes", [s.get("id") for s in (reg.get("scenes") or [])])
for model in reg["models"]:
    solid = sum(1 for v in model.get("voxels") or [] if v and v > 0)
    print(f"  {model['id']} solid={solid} name={model.get('nameRu')} emissiveCasts={model.get('emissiveCastsLight')}")

props = m.get("voxelProps") or []
c = Counter(p.get("modelId") for p in props)
print("placements", len(props))
for mid, n in c.most_common():
    print(f"  {mid}: {n}  present={mid in ids}")

lights = m.get("lights") or []
print("map lights", len(lights))
if lights[:3]:
    print(" sample", lights[0])

# lantern file recovery
lantern = ROOT / "scripts/.tmp-voxel-recovery/vox_ms8um8df.json"
print("lantern dump exists", lantern.exists(), lantern.stat().st_size if lantern.exists() else 0)
