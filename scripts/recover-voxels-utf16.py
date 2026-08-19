"""Scan UTF-16LE Session Storage for voxel model ids and JSON blobs."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(r"C:\Users\novos\Projects\joi-conductor")
DIR = ROOT / "scripts" / ".tmp-session-storage"
OUT = ROOT / "scripts" / ".tmp-voxel-recovery"
OUT.mkdir(parents=True, exist_ok=True)

TARGET = [
    "vox_crate_1",
    "vox_mrxeu3pe",
    "vox_mrxs0vmi",
    "vox_ms26wymg",
    "vox_ms7rrw9b",
    "vox_ms7uklhf",
    "vox_ms7uuoza",
    "vox_ms7uz99w",
    "vox_ms8um8df",
]


def u16(s: str) -> bytes:
    return s.encode("utf-16-le")


def score(m: dict) -> int:
    return sum(1 for v in (m.get("voxels") or []) if v and v > 0)


def try_model(obj: dict | None) -> dict | None:
    if not obj:
        return None
    if isinstance(obj.get("id"), str) and isinstance(obj.get("voxels"), list):
        return obj
    for key in ("draft", "model"):
        d = obj.get(key)
        if isinstance(d, dict) and isinstance(d.get("voxels"), list):
            return d
    undo = obj.get("undo")
    if isinstance(undo, list):
        for e in reversed(undo):
            if isinstance(e, dict) and isinstance(e.get("model"), dict):
                m = e["model"]
                if isinstance(m.get("voxels"), list):
                    return m
    return None


def extract_json_at(blob: bytes, start: int) -> dict | None:
    if start < 0 or start + 4 >= len(blob):
        return None
    if blob[start : start + 4] != b"{\x00\"\x00" and blob[start : start + 2] != b"{\x00":
        # allow { alone
        if blob[start : start + 2] != b"{\x00":
            return None
    depth = 0
    in_str = False
    esc = False
    j = start
    end = -1
    while j + 1 < len(blob) and j - start < 4_000_000:
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
    if end <= start:
        return None
    try:
        return json.loads(blob[start:end].decode("utf-16-le"))
    except Exception:
        return None


def scan_file(path: Path) -> dict[str, dict]:
    data = path.read_bytes()
    print(f"scan {path.name} size={len(data)}")
    found: dict[str, dict] = {}
    # Count id occurrences
    for tid in TARGET:
        needle = u16(tid)
        count = data.count(needle)
        print(f"  {tid}: {count}")
        if count == 0:
            continue
        # For each occurrence, walk back to nearest { and try parse
        start = 0
        while True:
            i = data.find(needle, start)
            if i < 0:
                break
            # walk back to '{'
            k = i
            while k >= 2:
                if data[k - 2 : k] == b"{\x00":
                    obj = extract_json_at(data, k - 2)
                    model = try_model(obj)
                    if model and model.get("id") == tid and score(model) > 0:
                        prev = found.get(tid)
                        if prev is None or score(model) >= score(prev):
                            found[tid] = model
                            print(f"    recovered {tid} solid={score(model)} from offset {k-2}")
                    break
                k -= 2
                if i - k > 200:  # id should be near start of object often; also search broader
                    # broader: look for draft wrapper further back
                    if i - k > 50000:
                        break
            start = i + 2
    return found


def main() -> None:
    all_found: dict[str, dict] = {}
    for p in sorted(DIR.iterdir()):
        if p.suffix.lower() not in {".log", ".ldb", ".sst"} and not p.name.endswith(".ldb"):
            if p.name in ("CURRENT", "LOCK", "LOG", "MANIFEST-000001") or p.suffix == "":
                # still try log-like
                pass
            else:
                continue
        found = scan_file(p)
        for k, v in found.items():
            prev = all_found.get(k)
            if prev is None or score(v) >= score(prev):
                all_found[k] = v

    print("\nTOTAL recovered", len(all_found))
    for mid, m in sorted(all_found.items()):
        (OUT / f"{mid}.json").write_text(json.dumps(m, ensure_ascii=False), encoding="utf-8")
        print(f"  {mid} solid={score(m)} name={m.get('nameRu')}")


if __name__ == "__main__":
    main()
