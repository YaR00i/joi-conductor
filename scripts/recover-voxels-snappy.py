"""Recover Ember voxel models from LevelDB SST (snappy) Session Storage tables."""
from __future__ import annotations

import json
import re
import struct
from pathlib import Path

import cramjam

ROOT = Path(r"C:\Users\novos\Projects\joi-conductor")
SST = ROOT / "scripts" / ".tmp-session-storage" / "000933.ldb"
LOG = ROOT / "scripts" / ".tmp-session-storage" / "000931.log"
REG = ROOT / "content" / "ember" / "voxels" / "registry.json"
MAP = ROOT / "content" / "ember" / "maps" / "hu_tao_yard.json"
OUT = ROOT / "scripts" / ".tmp-voxel-recovery"
OUT.mkdir(parents=True, exist_ok=True)

recovered: dict[str, dict] = {}


def score(m: dict) -> int:
    voxels = m.get("voxels") or []
    return sum(1 for v in voxels if v and v > 0)


def keep(model: dict | None) -> None:
    if not model or not isinstance(model.get("id"), str):
        return
    if not isinstance(model.get("voxels"), list) or score(model) <= 0:
        return
    prev = recovered.get(model["id"])
    if prev is None or score(model) >= score(prev):
        recovered[model["id"]] = model


def try_model(obj: dict | None) -> dict | None:
    if not obj:
        return None
    if isinstance(obj.get("id"), str) and isinstance(obj.get("voxels"), list):
        return obj
    draft = obj.get("draft")
    if isinstance(draft, dict) and isinstance(draft.get("voxels"), list):
        return draft
    model = obj.get("model")
    if isinstance(model, dict) and isinstance(model.get("voxels"), list):
        return model
    undo = obj.get("undo")
    if isinstance(undo, list):
        for e in reversed(undo):
            if isinstance(e, dict) and isinstance(e.get("model"), dict):
                m = e["model"]
                if isinstance(m.get("voxels"), list):
                    return m
    return None


def harvest_bytes(blob: bytes, label: str) -> int:
    found = 0
    # UTF-16LE JSON starting with {\0"\0
    i = 0
    while True:
        i = blob.find(b"{\x00\"\x00", i)
        if i < 0:
            break
        # decode forward
        end = -1
        depth = 0
        in_str = False
        esc = False
        j = i
        while j + 1 < len(blob) and j - i < 3_000_000:
            code = blob[j] | (blob[j + 1] << 8)
            ch = chr(code)
            if in_str:
                if esc:
                    esc = False
                elif ch == "\\":
                    esc = True
                elif ch == '"':
                    in_str = False
                j += 2
                continue
            if ch == '"':
                in_str = True
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    end = j + 2
                    break
            j += 2
        if end > i:
            try:
                text = blob[i:end].decode("utf-16-le")
                if "voxels" in text or "undo" in text or "draft" in text:
                    obj = json.loads(text)
                    model = try_model(obj)
                    if model:
                        before = model["id"] in recovered
                        keep(model)
                        found += 1
                        if not before:
                            print(f"  + {model['id']} solid={score(model)} ({label})")
            except Exception:
                pass
        i += 2
    return found


def snappy_decompress_all(data: bytes) -> list[bytes]:
    """Best-effort: try snappy decompress at many offsets."""
    out: list[bytes] = []
    # LevelDB block trailer: type byte before 5-byte trailer at end of block
    # Also try decompressing slices that look like snappy streams
    n = len(data)
    for i in range(0, n - 10):
        # snappy uncompressed length is a varint at start; try small windows
        # Heuristic: only try every 16 bytes to keep runtime sane
        if i % 16 != 0:
            continue
        for length in (64, 256, 1024, 4096, 16384, 32768, 65536):
            if i + length > n:
                break
            chunk = data[i : i + length]
            try:
                dec = bytes(cramjam.snappy.decompress(chunk))
                if len(dec) > 40 and (b"voxel" in dec or b"{\x00\"\x00" in dec or b"vox_" in dec):
                    out.append(dec)
            except Exception:
                pass
    return out


def main() -> None:
    print("Scanning LOG (raw)...")
    log = LOG.read_bytes()
    harvest_bytes(log, "log")

    print("Scanning SST with snappy probes...")
    sst = SST.read_bytes()
    harvest_bytes(sst, "sst-raw")
    blobs = snappy_decompress_all(sst)
    print(f"snappy blobs interesting: {len(blobs)}")
    for bi, blob in enumerate(blobs):
        harvest_bytes(blob, f"snappy-{bi}")

    # Also try treating each 32k block's payload as snappy (skip 1 type byte variants)
    for off in range(0, len(sst) - 6, 32768):
        block = sst[off : off + 32768]
        if len(block) < 6:
            continue
        # trailer last 5 bytes: 1 type + 4 crc; data before that
        payload = block[:-5]
        typ = block[-5]
        for candidate in (payload, payload[1:], block):
            try:
                if typ == 1 or True:
                    dec = bytes(cramjam.snappy.decompress(candidate))
                    harvest_bytes(dec, f"block-{off:x}")
            except Exception:
                pass

    print("\nRecovered models:")
    for mid, m in sorted(recovered.items()):
        (OUT / f"{mid}.json").write_text(
            json.dumps(m, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(f"  {mid} solid={score(m)} {m.get('nameRu','')}")

    # merge registry
    try:
        reg = json.loads(REG.read_text(encoding="utf-8"))
    except Exception:
        reg = {"models": [], "scenes": []}
    if not isinstance(reg.get("models"), list):
        reg["models"] = []
    if not isinstance(reg.get("scenes"), list):
        reg["scenes"] = []
    by_id = {m["id"]: m for m in reg["models"] if isinstance(m, dict) and "id" in m}
    by_id.update(recovered)
    reg["models"] = sorted(by_id.values(), key=lambda m: m["id"])
    REG.write_text(json.dumps(reg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    map_ids = sorted(set(re.findall(r'"modelId"\s*:\s*"([^"]+)"', MAP.read_text(encoding="utf-8"))))
    missing = [i for i in map_ids if i not in by_id]
    print(f"\nregistry models: {len(reg['models'])}")
    print("missing:", ", ".join(missing) if missing else "(none)")


if __name__ == "__main__":
    main()
