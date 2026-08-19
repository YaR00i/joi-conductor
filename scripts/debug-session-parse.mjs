import fs from "node:fs";

const buf = fs.readFileSync(
  "C:/Users/novos/AppData/Roaming/joi-conductor/Session Storage/000931.log",
);
const ascii = buf.toString("latin1");
const marker = "ember-voxel-hist:";
let idx = 0;
let n = 0;
while (n < 5) {
  idx = ascii.indexOf(marker, idx);
  if (idx < 0) break;
  let brace = -1;
  for (let i = idx; i < idx + 120; i++) {
    if (buf[i] === 0x7b && buf[i + 1] === 0) {
      brace = i;
      break;
    }
  }
  console.log("hit", n, "idx", idx, "brace", brace);
  if (brace >= 0) {
    const text = buf.subarray(brace, brace + 400000).toString("utf16le");
    console.log("head", JSON.stringify(text.slice(0, 100)));
    let depth = 0;
    let inStr = false;
    let esc = false;
    let end = -1;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    console.log("end", end);
    if (end > 0) {
      try {
        const obj = JSON.parse(text.slice(0, end));
        const m =
          obj.draft ||
          (Array.isArray(obj.undo) && obj.undo.length
            ? obj.undo[obj.undo.length - 1].model
            : null);
        console.log(
          "ok",
          m?.id,
          "voxels",
          m?.voxels?.length,
          "solid",
          m?.voxels?.filter((v) => v > 0).length,
        );
      } catch (e) {
        console.log("parse fail", e.message);
      }
    }
  }
  idx += marker.length;
  n++;
}
