import Phaser from "phaser";

function diamond(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  hw: number,
  hh: number,
  color: number,
): void {
  g.fillStyle(color, 1);
  g.beginPath();
  g.moveTo(cx, cy - hh);
  g.lineTo(cx + hw, cy);
  g.lineTo(cx, cy + hh);
  g.lineTo(cx - hw, cy);
  g.closePath();
  g.fillPath();
}

/** Extra props in the same Kenney isometric language (cube canopy, heart bush). */
export function bootFarmTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists("iso-tree")) return;
  const g = scene.add.graphics();
  g.setVisible(false);

  diamond(g, 40, 96, 16, 9, 0x6b4423);
  diamond(g, 40, 84, 8, 5, 0x5d3a1a);
  diamond(g, 40, 74, 9, 6, 0x4a2e14);
  diamond(g, 40, 50, 30, 17, 0x2f7a38);
  diamond(g, 40, 38, 24, 14, 0x4caf50);
  diamond(g, 40, 28, 16, 10, 0x81c784);
  g.generateTexture("iso-tree", 80, 112);
  g.clear();

  diamond(g, 36, 58, 24, 14, 0xad1457);
  diamond(g, 36, 46, 18, 11, 0xe91e63);
  diamond(g, 36, 36, 12, 8, 0xf8bbd0);
  g.generateTexture("iso-heart", 72, 72);
  g.destroy();
}
