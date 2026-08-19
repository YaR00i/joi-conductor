import fs from "node:fs";
import path from "node:path";

function make(folder, name, c0, c1, c2, accent) {
  const svg = (label, sub = "") => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="768" viewBox="0 0 512 768">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${c0}"/>
      <stop offset="55%" stop-color="${c1}"/>
      <stop offset="100%" stop-color="${c2}"/>
    </linearGradient>
  </defs>
  <rect width="512" height="768" fill="url(#g)"/>
  <circle cx="256" cy="220" r="90" fill="rgba(255,255,255,0.12)" stroke="${accent}" stroke-width="3"/>
  <text x="256" y="420" text-anchor="middle" fill="${accent}" font-family="Segoe UI, sans-serif" font-size="36" font-weight="600">${name}</text>
  <text x="256" y="470" text-anchor="middle" fill="rgba(255,255,255,0.75)" font-family="Segoe UI, sans-serif" font-size="20">${label}</text>
  ${
    sub
      ? `<text x="256" y="510" text-anchor="middle" fill="rgba(255,255,255,0.55)" font-family="Segoe UI, sans-serif" font-size="16">${sub}</text>`
      : ""
  }
  <text x="256" y="720" text-anchor="middle" fill="rgba(255,255,255,0.45)" font-family="Segoe UI, sans-serif" font-size="14">placeholder — replace with PNG</text>
</svg>`;

  const root = path.join("public", folder);
  fs.mkdirSync(path.join(root, "mood/full"), { recursive: true });
  fs.writeFileSync(path.join(root, "avatar-full.svg"), svg("avatar-full"));
  fs.writeFileSync(path.join(root, "shop-avatar.svg"), svg("shop-avatar"));
  for (const m of ["sweet", "calm", "bored", "cruel", "chaotic", "horny"]) {
    fs.writeFileSync(path.join(root, "mood", `${m}.svg`), svg("mood", m));
    fs.writeFileSync(path.join(root, "mood/full", `${m}.svg`), svg("mood-full", m));
  }
  fs.writeFileSync(
    path.join(root, "PLACEHOLDER.md"),
    `# ${name} assets\n\nDrop PNG with the same basenames to replace SVG. \`MistressImg\` prefers PNG when present.\n`,
  );
  console.log(folder, "ok");
}

make("sunna", "Sunna", "#1a1018", "#3a2438", "#f5a6c8", "#ffd0e0");
make("sparkle", "Sparkle", "#0a0608", "#2a0a12", "#c41e3a", "#f5f5f5");
