import fs from "node:fs";
import path from "node:path";

function svg(label, sub = "") {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="768" viewBox="0 0 512 768">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0A1A33"/>
      <stop offset="55%" stop-color="#1A3A6E"/>
      <stop offset="100%" stop-color="#2B6CFF"/>
    </linearGradient>
  </defs>
  <rect width="512" height="768" fill="url(#g)"/>
  <circle cx="256" cy="220" r="90" fill="rgba(255,255,255,0.12)" stroke="#E8F0FF" stroke-width="3"/>
  <text x="256" y="420" text-anchor="middle" fill="#E8F0FF" font-family="Segoe UI, sans-serif" font-size="36" font-weight="600">Furina</text>
  <text x="256" y="470" text-anchor="middle" fill="#9EC1FF" font-family="Segoe UI, sans-serif" font-size="20">${label}</text>
  ${
    sub
      ? `<text x="256" y="510" text-anchor="middle" fill="#F0D78C" font-family="Segoe UI, sans-serif" font-size="16">${sub}</text>`
      : ""
  }
  <text x="256" y="720" text-anchor="middle" fill="rgba(255,255,255,0.45)" font-family="Segoe UI, sans-serif" font-size="14">placeholder — replace with PNG</text>
</svg>`;
}

const root = "public/furina";
fs.mkdirSync(path.join(root, "mood/full"), { recursive: true });
fs.mkdirSync(path.join(root, "emoji"), { recursive: true });
fs.writeFileSync(path.join(root, "avatar-full.svg"), svg("avatar-full"));
fs.writeFileSync(path.join(root, "shop-avatar.svg"), svg("shop-avatar"));
for (const m of ["sweet", "calm", "bored", "cruel", "chaotic", "horny"]) {
  fs.writeFileSync(path.join(root, "mood", `${m}.svg`), svg("mood", m));
  fs.writeFileSync(path.join(root, "mood/full", `${m}.svg`), svg("mood-full", m));
}
console.log("furina placeholders ok");
