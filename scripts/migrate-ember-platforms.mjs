import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const target = resolve(
  process.argv.find((arg) => arg.endsWith(".json")) ??
    "content/ember/maps/hu_tao_yard.json",
);
const write = process.argv.includes("--write");
const map = JSON.parse(await readFile(target, "utf8"));
const layers = new Map(map.layers.map((layer) => [layer.name, layer.data]));
const z0 = layers.get("ground_z0");
const z1 = layers.get("ground_z1");
const z2 = layers.get("ground_z2");
const z3 = layers.get("ground_z3");
const collision = layers.get("collision") ?? [];
const height = layers.get("height") ?? [];

if (!z0 || !z1 || !z2 || !z3) {
  throw new Error("Map must contain ground_z0..ground_z3 layers");
}

let converted = 0;
for (let i = 0; i < z3.length; i++) {
  const top = z3[i] ?? 0;
  if (!top) continue;
  const legacyFilled =
    z0[i] === top &&
    z1[i] === top &&
    z2[i] === top &&
    (collision[i] ?? 0) === 0 &&
    (height[i] ?? 0) === 0;
  if (!legacyFilled) continue;
  z1[i] = 0;
  z2[i] = 0;
  converted++;
}

map.worldPhysicsVersion = 2;
const report = `${target}: ${converted} legacy Z3 columns -> floor + ceiling`;
if (write) {
  await writeFile(target, `${JSON.stringify(map, null, 2)}\n`, "utf8");
  console.log(`${report} (written)`);
} else {
  console.log(`${report} (dry run; pass --write)`);
}
