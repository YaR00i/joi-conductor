import Phaser from "phaser";
import type { FarmAnimalKind, FarmCropKind, FarmFactoryKind, FarmItemId } from "./farmItems";
import { FARM_FACTORIES } from "./farmItems";
import {
  CF,
  CREATURE_SHEET,
  FARM_SHEET,
  FF,
  ISO_BUILDING_IDS,
  ISO_GRASS_BY_HEIGHT,
  ISO_LAND_IDS,
  ISO_TRUCK,
  isoBuildingKey,
  isoBuildingUrl,
  isoCityKey,
  isoCityUrl,
  isoLandKey,
  isoLandUrl,
} from "./farmAtlas";
import {
  FARM_LAND_DIRT,
  FARM_LAND_GRASS,
  farmDecor,
  farmFactoryCell,
  farmGround,
  farmTruckCell,
  farmWarehouseCell,
  farmWellCell,
} from "./farmDecor";
import { bootFarmTextures } from "./farmIsoDraw";
import {
  FARM_CRITTER_SCALE,
  FARM_DROP_SCALE,
  FARM_FARMER_SCALE,
  farmerPatrol,
  isoFlipX,
  isMoving,
  stepPatrol,
  walkBobPx,
} from "./farmSprites";
import {
  FIELD_OX,
  FIELD_OY,
  farmMapSize,
  fieldToWorld,
  ISO_GROUND_ORIGIN_Y,
  isoActorDepth,
  isoDepth,
  isoFloorDepth,
  isoMapBounds,
  isoOrigin,
  isoToScreen,
  screenToIso,
  worldToField,
} from "./farmIso";
import {
  animalIsHungry,
  clickFactory,
  clickTile,
  clickTruck,
  clickWell,
  cropRipe,
  cropStage,
  type FarmFieldTool,
  type FarmWorld,
} from "./farmSim";

export type FarmSceneHandlers = {
  world: () => FarmWorld | null;
  paused: () => boolean;
  onHud: () => void;
  tool: () => FarmFieldTool;
};

const ZOOM_MIN = 0.48;
const ZOOM_MAX = 1.55;

export class FarmScene extends Phaser.Scene {
  private handlers!: FarmSceneHandlers;
  private origin = { x: 0, y: 0 };
  private plotTiles: Phaser.GameObjects.Image[] = [];
  private mobiles = new Map<number, Phaser.GameObjects.Image>();
  private well!: Phaser.GameObjects.Image;
  private truck!: Phaser.GameObjects.Image;
  private factories = new Map<FarmFactoryKind, Phaser.GameObjects.Image>();
  private dragPx = 0;
  private builtKey = "";
  private farmer?: Phaser.GameObjects.Image;
  private farmerPos = { x: -0.75, y: 0.45 };
  private farmerIndex = 1;
  private farmerVx = 0;
  private farmerVy = 0;

  constructor() {
    super("FarmScene");
  }

  init(data: Partial<FarmSceneHandlers>) {
    this.handlers = {
      world: data.world ?? (() => null),
      paused: data.paused ?? (() => true),
      onHud: data.onHud ?? (() => undefined),
      tool: data.tool ?? (() => "water"),
    };
  }

  preload() {
    this.load.spritesheet("farm", FARM_SHEET, { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet("creatures", CREATURE_SHEET, { frameWidth: 16, frameHeight: 16 });
    this.load.image("iso-truck", ISO_TRUCK);
    for (const id of ISO_LAND_IDS) this.load.image(isoLandKey(id), isoLandUrl(id));
    for (const id of ISO_BUILDING_IDS) this.load.image(isoBuildingKey(id), isoBuildingUrl(id));
    for (let i = 0; i < 11; i++) this.load.image(isoCityKey(i), isoCityUrl(i));
    this.load.svg("heel", "/farm/heel.svg", { width: 42, height: 42 });
  }

  create() {
    bootFarmTextures(this);
    this.textures.get("farm").setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.textures.get("creatures").setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.cameras.main.setBackgroundColor("#6ec8f0");
    this.input.on("pointerdown", () => {
      this.dragPx = 0;
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (!p.isDown) return;
      const cam = this.cameras.main;
      const dx = p.x - p.prevPosition.x;
      const dy = p.y - p.prevPosition.y;
      this.dragPx += Math.hypot(dx, dy);
      cam.scrollX -= dx / cam.zoom;
      cam.scrollY -= dy / cam.zoom;
    });
    this.input.on("pointerup", (p: Phaser.Input.Pointer) => {
      if (this.dragPx > 14) return;
      this.onTap(p);
    });
    this.input.on(
      "wheel",
      (
        p: Phaser.Input.Pointer,
        _over: unknown,
        _dx: number,
        dy: number,
      ) => {
        this.zoomAt(p, dy > 0 ? 0.9 : 1.1);
      },
    );
    const w = this.handlers.world();
    if (w) this.rebuild(w);
  }

  zoomBy(factor: number) {
    const cam = this.cameras.main;
    cam.setZoom(Phaser.Math.Clamp(cam.zoom * factor, ZOOM_MIN, ZOOM_MAX));
  }

  private zoomAt(p: Phaser.Input.Pointer, factor: number) {
    const cam = this.cameras.main;
    const before = cam.getWorldPoint(p.x, p.y);
    cam.setZoom(Phaser.Math.Clamp(cam.zoom * factor, ZOOM_MIN, ZOOM_MAX));
    const after = cam.getWorldPoint(p.x, p.y);
    cam.scrollX += before.x - after.x;
    cam.scrollY += before.y - after.y;
  }

  update() {
    const w = this.handlers.world();
    if (!w) return;
    const key = `${w.cols}x${w.rows}x${w.factories.map((f) => f.kind).join(",")}`;
    if (this.builtKey !== key) this.rebuild(w);
    this.drawPlots(w);
    this.syncMobiles(w);
    this.syncFarmer(w);
    if (this.well) this.well.setAlpha(w.water > 0 ? 1 : 0.45);
    if (this.truck) this.truck.setAlpha(w.truck.awayMs > 0 ? 0.4 : 1);
    for (const [kind, img] of this.factories) {
      const f = w.factories.find((x) => x.kind === kind);
      img.setAlpha(f && f.busyMs > 0 ? 0.55 : 1);
    }
  }

  private at(col: number, row: number): { x: number; y: number } {
    return isoToScreen(col, row, this.origin.x, this.origin.y);
  }

  private stamp(
    tex: string,
    col: number,
    row: number,
    extra = 0,
    scale = 1,
    originY = 1,
    band: "floor" | "actor" = "actor",
  ): Phaser.GameObjects.Image {
    const p = this.at(col, row);
    const img = this.add.image(p.x, p.y, tex);
    img.setOrigin(0.5, originY);
    img.setScale(scale);
    img.setDepth(band === "floor" ? isoFloorDepth(col, row) + extra : isoActorDepth(col, row, extra));
    return img;
  }

  private label(text: string, col: number, row: number) {
    const p = this.at(col, row);
    const title = this.add.text(0, 4, text, {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "12px",
      color: "#fff8ee",
    });
    title.setOrigin(0.5, 0);
    const padX = 8;
    const padY = 3;
    const bw = title.width + padX * 2;
    const bh = title.height + padY * 2;
    const bg = this.add.graphics();
    bg.fillStyle(0x1a100e, 0.82);
    bg.fillRoundedRect(-bw / 2, 0, bw, bh, 8);
    bg.lineStyle(1, 0xc4a574, 0.65);
    bg.strokeRoundedRect(-bw / 2, 0, bw, bh, 8);
    const plate = this.add.container(p.x, p.y + 8, [bg, title]);
    plate.setDepth(isoActorDepth(col, row, 20));
  }

  private rebuild(w: FarmWorld) {
    this.children.removeAll(true);
    this.plotTiles = [];
    this.mobiles.clear();
    this.factories.clear();
    this.builtKey = `${w.cols}x${w.rows}x${w.factories.map((f) => f.kind).join(",")}`;
    const { worldCols, worldRows } = farmMapSize(w.cols, w.rows);
    this.origin = isoOrigin(worldCols, worldRows);
    const bounds = isoMapBounds(worldCols, worldRows, this.origin.x, this.origin.y);
    this.cameras.main.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);
    this.cameras.main.setBackgroundColor("#6ec8f0");
    bootFarmTextures(this);

    const ground = [...farmGround(w.cols, w.rows)].sort(
      (a, b) => isoDepth(a.col, a.row) - isoDepth(b.col, b.row),
    );
    for (const cell of ground) {
      this.stamp(isoLandKey(cell.land), cell.col, cell.row, 0, 1, ISO_GROUND_ORIGIN_Y, "floor");
    }
    for (const prop of farmDecor(w.cols, w.rows)) {
      const img = this.stamp(prop.tex, prop.col, prop.row, 4, prop.scale ?? 1);
      if (prop.tint != null) img.setTint(prop.tint);
    }

    const need = w.cols * w.rows;
    for (let i = 0; i < need; i++) {
      const x = i % w.cols;
      const y = Math.floor(i / w.cols);
      const wr = fieldToWorld(x, y);
      this.plotTiles.push(this.stamp(isoLandKey(FARM_LAND_DIRT), wr.col, wr.row, 1, 1, ISO_GROUND_ORIGIN_Y, "floor"));
    }

    const well = farmWellCell();
    this.stamp(isoLandKey(FARM_LAND_GRASS), well.col, well.row, 1, 1, ISO_GROUND_ORIGIN_Y, "floor");
    this.well = this.stamp("farm", well.col, well.row, 6, 3.2);
    this.well.setFrame(FF.bucket);
    this.well.setOrigin(0.5, 0.85);
    this.label("Колодец", well.col, well.row);

    const barn = farmWarehouseCell(w.cols);
    this.stamp(isoBuildingKey(55), barn.col, barn.row, 6);
    this.label("Сарай", barn.col, barn.row);

    const truck = farmTruckCell(w.cols);
    this.truck = this.stamp("iso-truck", truck.col, truck.row, 7, 0.62);
    this.label("Грузовик", truck.col, truck.row);

    const factoryArt: Record<FarmFactoryKind, string> = {
      mill: isoBuildingKey(41),
      bakery: isoBuildingKey(12),
      dairy: isoBuildingKey(70),
    };
    w.factories.forEach((f, i) => {
      const cell = farmFactoryCell(w.cols, i);
      const img = this.stamp(factoryArt[f.kind], cell.col, cell.row, 6);
      this.factories.set(f.kind, img);
      this.label(FARM_FACTORIES[f.kind].nameRu, cell.col, cell.row);
    });

    this.farmerPos = { x: -0.75, y: 0.45 };
    this.farmerIndex = 1;
    this.farmerVx = 0;
    this.farmerVy = 0;
    const farmerStart = fieldToWorld(this.farmerPos.x, this.farmerPos.y);
    const fp = this.at(farmerStart.col, farmerStart.row);
    this.farmer = this.add.image(fp.x, fp.y, "farm", FF.farmer);
    this.farmer.setOrigin(0.5, 1);
    this.farmer.setScale(FARM_FARMER_SCALE);
    this.farmer.setDepth(isoActorDepth(farmerStart.col, farmerStart.row, 8));

    const mid = this.at(FIELD_OX + w.cols / 2, FIELD_OY + w.rows / 2);
    this.cameras.main.centerOn(mid.x, mid.y);
    this.cameras.main.setZoom(0.92);
  }

  private drawPlots(w: FarmWorld) {
    for (let y = 0; y < w.rows; y++) {
      for (let x = 0; x < w.cols; x++) {
        const g = w.grass[y * w.cols + x] ?? 0;
        const crop = w.crops[y * w.cols + x];
        const img = this.plotTiles[y * w.cols + x];
        const wr = fieldToWorld(x, y);
        const pos = this.at(wr.col, wr.row);
        img.setPosition(pos.x, pos.y);
        if (crop) {
          img.setTexture(isoLandKey(FARM_LAND_DIRT));
        } else {
          const land = ISO_GRASS_BY_HEIGHT[g] ?? ISO_GRASS_BY_HEIGHT[0];
          img.setTexture(isoLandKey(land));
        }
      }
    }
  }

  private syncFarmer(w: FarmWorld) {
    if (!this.farmer) return;
    if (!this.handlers.paused()) {
      const next = stepPatrol(
        this.farmerPos,
        farmerPatrol(w.cols, w.rows),
        this.farmerIndex,
        1.35,
        this.game.loop.delta > 80 ? 80 : this.game.loop.delta,
      );
      this.farmerPos = next.pos;
      this.farmerIndex = next.index;
      this.farmerVx = next.vx;
      this.farmerVy = next.vy;
    }
    const wr = fieldToWorld(this.farmerPos.x, this.farmerPos.y);
    const pos = this.at(wr.col, wr.row);
    const moving = isMoving(this.farmerVx, this.farmerVy);
    const bob = walkBobPx(this.time.now, moving, 4);
    this.farmer.setPosition(pos.x, pos.y - bob);
    this.farmer.setFlipX(isoFlipX(this.farmerVx, this.farmerVy));
    this.farmer.setDepth(isoActorDepth(wr.col, wr.row, 8));
  }

  private onTap(p: Phaser.Input.Pointer) {
    const world = this.handlers.world();
    if (!world || this.handlers.paused()) return;
    const hit = (img: Phaser.GameObjects.Image | undefined, r: number) =>
      !!img && Phaser.Math.Distance.Between(img.x, img.y, p.worldX, p.worldY) < r;
    if (hit(this.well, 56)) {
      clickWell(world);
      this.handlers.onHud();
      return;
    }
    if (hit(this.truck, 70)) {
      clickTruck(world);
      this.handlers.onHud();
      return;
    }
    for (const [kind, img] of this.factories) {
      if (hit(img, 64)) {
        clickFactory(world, kind, []);
        this.handlers.onHud();
        return;
      }
    }
    const iso = screenToIso(p.worldX, p.worldY, this.origin.x, this.origin.y);
    const field = worldToField(iso.col, iso.row);
    clickTile(world, field.tx, field.ty, [], this.handlers.tool());
    this.handlers.onHud();
  }

  private syncMobiles(w: FarmWorld) {
    const live = new Set<number>();
    const put = (
      id: number,
      sheet: "farm" | "creatures",
      frame: number,
      fx: number,
      fy: number,
      vx: number,
      vy: number,
      scale: number,
      alpha = 1,
      tint?: number,
      extra = 8,
    ) => {
      live.add(id);
      const wr = fieldToWorld(fx, fy);
      const pos = this.at(wr.col, wr.row);
      let spr = this.mobiles.get(id);
      if (!spr) {
        spr = this.add.image(pos.x, pos.y, sheet, frame);
        spr.setOrigin(0.5, 0.92);
        this.mobiles.set(id, spr);
      }
      const moving = isMoving(vx, vy);
      const bob = walkBobPx(this.time.now + id * 40, moving);
      spr.setTexture(sheet, frame);
      spr.setScale(scale);
      spr.setPosition(pos.x, pos.y - bob);
      spr.setFlipX(isoFlipX(vx, vy));
      spr.setAlpha(alpha);
      if (tint != null) spr.setTint(tint);
      else spr.clearTint();
      spr.setDepth(isoActorDepth(wr.col, wr.row, extra));
    };

    for (const a of w.animals) {
      put(
        a.id,
        "creatures",
        animalFrame(a.kind),
        a.x,
        a.y,
        a.vx,
        a.vy,
        FARM_CRITTER_SCALE,
        1,
        animalIsHungry(a) ? 0xffb0a0 : undefined,
      );
    }
    for (const d of w.drops) {
      const spr = dropSprite(d.item);
      const rotting = d.ageMs > w.spec.dropDespawnMs * 0.55;
      put(
        d.id,
        spr.sheet,
        spr.frame,
        d.x,
        d.y,
        0,
        0,
        FARM_DROP_SCALE,
        rotting ? 0.72 : 1,
        rotting ? 0xc4a080 : undefined,
        9,
      );
    }
    for (const p of w.pests) {
      put(p.id, "creatures", CF.bear, p.x, p.y, p.vx, p.vy, FARM_CRITTER_SCALE, p.caged ? 0.7 : 1);
    }
    if (w.cat) {
      put(-2, "creatures", CF.raccoon, w.cat.x, w.cat.y, w.cat.vx, w.cat.vy, FARM_CRITTER_SCALE);
    }
    if (w.dog) {
      put(-3, "creatures", CF.dog, w.dog.x, w.dog.y, w.dog.vx, w.dog.vy, FARM_CRITTER_SCALE);
    }
    for (let i = 0; i < w.crops.length; i++) {
      const crop = w.crops[i];
      if (!crop) continue;
      const x = (i % w.cols) + 0.5;
      const y = Math.floor(i / w.cols) + 0.5;
      put(
        -5000 - i,
        "farm",
        cropFrame(crop.kind, cropStage(crop)),
        x,
        y,
        0,
        0,
        FARM_DROP_SCALE,
        cropRipe(crop) ? 1 : 0.9,
        undefined,
        7,
      );
    }

    for (const [id, spr] of this.mobiles) {
      if (!live.has(id)) {
        spr.destroy();
        this.mobiles.delete(id);
      }
    }
  }
}

function animalFrame(kind: FarmAnimalKind): number {
  switch (kind) {
    case "chicken":
      return CF.chicken;
    case "cow":
      return CF.cow;
    case "sheep":
      return CF.sheep;
    default: {
      const _never: never = kind;
      return _never;
    }
  }
}

function dropSprite(item: FarmItemId): { sheet: "farm" | "creatures"; frame: number } {
  switch (item) {
    case "egg":
      return { sheet: "farm", frame: FF.egg };
    case "milk":
      return { sheet: "farm", frame: FF.milk };
    case "wool":
      return { sheet: "farm", frame: FF.sack };
    case "powder":
      return { sheet: "farm", frame: FF.crate };
    case "bun":
      return { sheet: "farm", frame: FF.crate };
    case "cheese":
      return { sheet: "farm", frame: FF.milkPail };
    case "bear":
      return { sheet: "creatures", frame: CF.bear };
    case "wheat":
      return { sheet: "farm", frame: FF.sack };
    case "corn":
      return { sheet: "farm", frame: FF.crate };
    default: {
      const _never: never = item;
      return _never;
    }
  }
}

function cropFrame(kind: FarmCropKind, stage: 1 | 2 | 3): number {
  switch (kind) {
    case "wheat":
      return stage === 1 ? FF.grass1 : stage === 2 ? FF.grass2 : FF.sack;
    case "corn":
      return stage === 1 ? FF.grass1 : stage === 2 ? FF.grass2 : FF.crate;
    default: {
      const _never: never = kind;
      return _never;
    }
  }
}
