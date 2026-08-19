"""Debug why UTF-16 hits for vox_ms8um8df don't parse as models."""
from pathlib import Path

p = Path(r"C:\Users\novos\Projects\joi-conductor\scripts\.tmp-session-storage\000931.log")
data = p.read_bytes()
needle = "vox_ms8um8df".encode("utf-16-le")
i = data.find(needle)
print("first at", i)
# show surrounding decoded utf16-ish
start = max(0, i - 200)
chunk = data[start : i + 400]
# decode even-aligned
if start % 2:
    start -= 1
    chunk = data[start : i + 400]
try:
    text = chunk.decode("utf-16-le", errors="replace")
    print(repr(text[:500]))
except Exception as e:
    print("decode fail", e)
    print(chunk[:100])

# also search ASCII
print("ascii count", data.count(b"vox_ms8um8df"))
print("hist key", data.count("ember-voxel".encode("utf-16-le")))
for key in ["ember-voxel-hist", "ember:voxel", "voxelHist", "draft"]:
    print(key, data.count(key.encode("utf-16-le")))
