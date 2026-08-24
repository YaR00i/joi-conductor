import Phaser from "phaser";
import type { EmberBridgeHandler, EmberGameApi } from "../bridge/events";
import {
  enemyBodyRadius,
  PLAYER_BODY_R,
  PLAYER_HURT_R,
} from "../combat/radii";
import { rollLootOptions } from "../content/pools";
import type {
  EmberEmissiveAnim,
  EmberEnemyDef,
  EmberMap,
  EmberPack,
  EmberStage,
  EmberWeaponDef,
} from "../content/types";
import { WALL_HEIGHT } from "../tile/extruded";
import {
  circleHitsSolid,
  computeLitSurfaces,
  elevNearlyEqual,
  elevVisualOffset,
  ensureMapLayers,
  findRegions,
  hexToPhaser,
  litSurfacesToFloorGlow,
  getViewPadInfo,
  groundTileAt,
  mapViewBounds,
  mapViewModeFromArrow,
  cameraMoveToWorld,
  mapVerticalPad,
  nextMapViewMode,
  buildLanternBloomCanvas,
  bakeLanternLitSpriteCanvas,
  paintLanternBloomField,
  paintMapEmissiveField,
  paintMapGeometryToCanvas,
  paintSurfaceLightOverlay,
  withProtectedUnlitElevatedTops,
  pickSpriteLampCell,
  rgbaFromHex,
  paintMapToCanvas,
  pointInRegion,
  projectWorldPoint,
  randomWalkablePointInRegion,
  regionCenter,
  regionVolumeElev,
  resolveMapLight,
  stepTeleport,
  tileSurfaceElev,
  tryJumpLedge,
  tryMoveWithElevation,
  worldToTile,
  buildColorGradeMatrix,
  isNeutralMapGrade,
  type MapViewMode,
} from "../tile/mapUtils";
import type { EmberEmissiveTriggerWhen } from "../content/types";
import {
  EMISSIVE_TRIGGER_IDLE,
  createEmissiveFlickerState,
  emissiveAnimMul,
  emissivePlacementSeed,
  emissiveProximityAmount,
  emissiveSmoothToward,
  emissiveTriggerAmount,
  hasEmissiveInk,
  paintEmissivePixels,
  resolveEmissiveAnim,
  resolveEmissiveFlickerPeriodRange,
  resolveEmissiveGlowStrength,
  resolveEmissiveTriggerRadius,
  stepEmissiveFlicker,
  type EmissiveFlickerState,
} from "../tile/emissivePaint";
import {
  normalizePixelSprite,
  spriteTotalHeight,
  spriteWallHeight,
} from "../content/pixelSprite";
import {
  generatePhaserSpriteTexture,
  spriteHasVisual,
} from "../tile/tileTextures";

export type ArenaSceneInit = {
  pack: EmberPack;
  stageId: string;
  onBridge: EmberBridgeHandler;
  shortMode?: boolean;
};

type WeaponSlot = {
  def: EmberWeaponDef;
  level: number;
  cooldown: number;
};

type EnemySprite = Phaser.Physics.Arcade.Sprite & {
  enemyId?: string;
  hp?: number;
  maxHp?: number;
  def?: EmberEnemyDef;
  touchCd?: number;
  elev?: number;
};

const STRIP_COLORS = ["#e8a878", "#e09070", "#d07090", "#c050a0"];

export class ArenaScene extends Phaser.Scene {
  /**
   * Night overlay — above map art, below lantern washes + props
   * (editor: ambient → floor/face glow → occluding props with tint after ambient).
   */
  private static readonly AMBIENT_DEPTH = 900;
  /** Lantern / prop layer sits above ambient so lights punch through night. */
  private static readonly LAMP_DEPTH_BASE = 1_000;
  /** Soft global bloom overlay (above lamp washes). */
  private static readonly LAMP_BLOOM_DEPTH = 1_400;

  private pack!: EmberPack;
  private stage!: EmberStage;
  private map!: EmberMap;
  private onBridge!: EmberBridgeHandler;
  private shortMode = false;

  private player!: Phaser.Physics.Arcade.Sprite;
  private wasd!: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
  };
  private jumpKey!: Phaser.Input.Keyboard.Key;
  /** Capture-phase fallback — Phaser skips events with defaultPrevented (focused UI buttons). */
  private rawMove = { left: false, right: false, up: false, down: false };
  private rawJumpQueued = false;
  private readonly onRawKeyDown = (e: KeyboardEvent) => {
    if (this.setRawMoveKey(e.code, true) && e.code === "Space" && !e.repeat) {
      this.rawJumpQueued = true;
    }
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    const cam = mapViewModeFromArrow(e.code);
    if (cam) {
      e.preventDefault();
      this.setViewMode(cam);
      return;
    }
    if (e.code === "KeyV") {
      this.cycleViewMode();
    }
  };
  private readonly onRawKeyUp = (e: KeyboardEvent) => {
    this.setRawMoveKey(e.code, false);
  };

  private playerElev = 0;
  private jumpCd = 0;
  private teleportCd = 0;
  private teleportOccupyId: string | null = null;
  private triggerCd = 0;
  private lastFacingX = 0;
  private lastFacingY = 1;

  private enemies!: Phaser.Physics.Arcade.Group;
  private gems!: Phaser.Physics.Arcade.Group;
  private bullets!: Phaser.Physics.Arcade.Group;
  private enemyBullets!: Phaser.Physics.Arcade.Group;
  /** Persistent orbit hitboxes tied to orbit weapons. */
  private orbitals: Array<{
    spr: Phaser.Physics.Arcade.Sprite;
    slotIndex: number;
    index: number;
    count: number;
    range: number;
    dmg: number;
    hitCd: Map<number, number>;
  }> = [];

  private hp = 100;
  private lastAim = 0;
  private maxHp = 100;
  private stripMeter = 0;
  private stripTier = 0;
  private filthUntil = 0;
  private filthResist = 0;
  private tileHazardNextAt = 0;
  private moveMul = 1;
  private level = 1;
  private xp = 0;
  private xpToLevel = 12;
  private killed = 0;
  private elapsed = 0;
  private duration = 300;
  private pausedLogic = false;
  private awaitingLoot = false;
  private finished = false;
  private weapons: WeaponSlot[] = [];
  private spawnAcc: Record<number, number> = {};
  private onceFired = new Set<number>();
  private chestTaken = new Set<string>();
  private hudAcc = 0;
  private orbitAngle = 0;
  /** Orthographic view — arrows set facing; V cycles. */
  private viewMode: MapViewMode = "top";
  /** Cached vertical pad for projections (invalidated with map art rebuild). */
  private viewPad = 0;
  /** Prop emissive ADD overlays — alpha updated each frame for anim/trigger. */
  private emissiveOverlays: Array<{
    img: Phaser.GameObjects.Image;
    placeX: number;
    placeY: number;
    anim: EmberEmissiveAnim | undefined;
    strength: number;
    periodSec?: number;
    periodMinSec?: number;
    periodMaxSec?: number;
    triggerRadius: number;
    triggerWhen?: EmberEmissiveTriggerWhen;
    triggerEventId?: string;
    seed: number;
    /** Soft temporal ease of current alpha mul. */
    smoothMul?: number;
    /** Per-prop random-cycle flicker timer. */
    flicker?: EmissiveFlickerState;
  }> = [];
  private emissiveLastMs = 0;
  private activeEmissiveEvents = new Set<string>();

  constructor() {
    super("ArenaScene");
  }

  /**
   * Map art depth (floors/cliffs/walls). Row-major so south occludes north.
   * Actors sit between floor tops (~+2.55) and wall tops (~+3.5).
   */
  private mapDepth(tileY: number, elev: number, layer = 0): number {
    return tileY * 4 + elev + layer;
  }

  /** Lantern washes + prop tints — always above ambient. */
  private lampDepth(tileY: number, elev: number, layer = 0): number {
    return ArenaScene.LAMP_DEPTH_BASE + this.mapDepth(tileY, elev, layer);
  }

  /** Place sprite in display space; `x,y` are logical map coords. */
  private place(
    spr: Phaser.GameObjects.Sprite,
    x: number,
    y: number,
    depthBase = 10,
    elev = 0,
  ) {
    spr.setData("lx", x);
    spr.setData("ly", y);
    spr.setData("elev", elev);
    spr.setData("depthBase", depthBase);
    const p = projectWorldPoint(
      this.viewMode,
      this.map,
      x,
      y,
      elev,
      1,
      this.viewPad,
    );
    spr.setPosition(p.x, p.y);
    // Above floor tops (~+2.55), below wall tops (~+3.5). North of a wall /
    // raised block → lower row depth → occluded (hide behind).
    spr.setDepth(p.depth + 2.8 + depthBase * 0.001);
    const body = spr.body;
    if (!body) return;
    // Body matches display so same-elev overlaps work
    if (body instanceof Phaser.Physics.Arcade.StaticBody) {
      body.updateFromGameObject();
    } else {
      (body as Phaser.Physics.Arcade.Body).reset(p.x, p.y);
    }
  }

  private applyViewBounds() {
    const b = mapViewBounds(this.viewMode, this.map);
    this.physics.world.setBounds(b.x, b.y, b.width, b.height);
    this.cameras.main.setBounds(b.x, b.y, b.width, b.height);
  }

  /** Global tone / brightness / saturation after ambient + lanterns. */
  private applyCameraColorGrade() {
    const cam = this.cameras.main;
    const fx = cam.postFX;
    if (!fx) return;
    fx.clear();
    const grade = resolveMapLight(this.map).grade;
    if (isNeutralMapGrade(grade)) return;
    const cm = fx.addColorMatrix();
    cm.set(buildColorGradeMatrix(grade));
  }

  /** Drop baked map art (images/rects/graphics without logical coords). */
  private clearMapArt() {
    for (const child of [...this.children.list]) {
      if (child.getData("lx") != null) continue;
      if (
        child instanceof Phaser.GameObjects.Image ||
        child instanceof Phaser.GameObjects.Rectangle ||
        child instanceof Phaser.GameObjects.Graphics
      ) {
        child.destroy();
      }
    }
  }

  private refreshPlacedEntities() {
    for (const child of this.children.list) {
      if (!(child instanceof Phaser.GameObjects.Sprite)) continue;
      if (child.getData("lx") == null) continue;
      const lx = Number(child.getData("lx"));
      const ly = Number(child.getData("ly"));
      const elev = Number(child.getData("elev") ?? 0);
      const depthBase = Number(child.getData("depthBase") ?? 10);
      this.place(child, lx, ly, depthBase, elev);
    }
  }

  private rebuildMapView() {
    this.viewPad = getViewPadInfo(this.map).pad;
    this.clearMapArt();
    this.drawMap();
    this.applyViewBounds();
    this.refreshPlacedEntities();
  }

  private cycleViewMode() {
    if (this.finished || this.awaitingLoot) return;
    this.setViewMode(nextMapViewMode(this.viewMode));
  }

  private setViewMode(mode: MapViewMode) {
    if (this.finished || this.awaitingLoot) return;
    if (mode === this.viewMode) return;
    this.viewMode = mode;
    this.rebuildMapView();
  }

  private logicPos(spr: Phaser.GameObjects.Sprite): { x: number; y: number } {
    const elev = Number(spr.getData("elev") ?? 0);
    return {
      x: Number(spr.getData("lx") ?? spr.x),
      y: Number(spr.getData("ly") ?? spr.y + elevVisualOffset(elev)),
    };
  }

  init(data: ArenaSceneInit) {
    this.pack = data.pack;
    this.onBridge = data.onBridge;
    this.shortMode = Boolean(data.shortMode);
    const stage = data.pack.stages[data.stageId];
    if (!stage) throw new Error(`stage ${data.stageId}`);
    this.stage = stage;
    const map = data.pack.maps[stage.mapId];
    if (!map) throw new Error(`map ${stage.mapId}`);
    this.map = ensureMapLayers(map);
    this.maxHp = stage.playerHp;
    this.hp = stage.playerHp;
    this.duration = this.shortMode
      ? Math.min(90, stage.durationSec)
      : stage.durationSec;
    this.xpToLevel = stage.baseXpToLevel;
  }

  create() {
    this.viewPad = getViewPadInfo(this.map).pad;
    // Height layer may be injected at load; keep map reference current
    this.drawMap();
    const start =
      findRegions(this.map, "player_start")[0] ??
      ({
        id: "fallback",
        kind: "player_start" as const,
        x: 2,
        y: 2,
        w: 1,
        h: 1,
      });
    const pos = regionCenter(this.map, start);
    this.playerElev = regionVolumeElev(this.map, start);
    this.teleportOccupyId = findRegions(this.map, "teleport").find((r) =>
      pointInRegion(this.map, r, pos.x, pos.y, this.playerElev),
    )?.id ?? null;

    this.ensureTextures();

    this.player = this.physics.add.sprite(pos.x, pos.y, "player_0");
    // Manual place()+elevation; world-bounds clamp fights raised display Y
    this.player.setCollideWorldBounds(false);
    this.player.setCircle(PLAYER_BODY_R, 8 - PLAYER_BODY_R, 8 - PLAYER_BODY_R);
    this.place(this.player, pos.x, pos.y, 20, this.playerElev);

    this.applyViewBounds();
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.setZoom(2);
    this.applyCameraColorGrade();

    this.enemies = this.physics.add.group();
    this.gems = this.physics.add.group();
    this.bullets = this.physics.add.group({
      allowGravity: false,
      immovable: false,
    });
    this.enemyBullets = this.physics.add.group({
      allowGravity: false,
    });

    this.physics.add.overlap(
      this.player,
      this.gems,
      (_p, g) => this.collectGem(g as Phaser.Physics.Arcade.Sprite),
      undefined,
      this,
    );
    this.physics.add.overlap(
      this.bullets,
      this.enemies,
      (b, e) =>
        this.hitEnemy(
          b as Phaser.Physics.Arcade.Sprite,
          e as EnemySprite,
        ),
      undefined,
      this,
    );
    // Enemy bullet hits checked in tickBullets (distance in world space)

    if (this.input.keyboard) {
      this.input.keyboard.enabled = true;
      this.wasd = this.input.keyboard.addKeys({
        W: Phaser.Input.Keyboard.KeyCodes.W,
        A: Phaser.Input.Keyboard.KeyCodes.A,
        S: Phaser.Input.Keyboard.KeyCodes.S,
        D: Phaser.Input.Keyboard.KeyCodes.D,
      }) as typeof this.wasd;
      this.jumpKey = this.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.SPACE,
      );
      this.input.keyboard.addCapture([
        Phaser.Input.Keyboard.KeyCodes.W,
        Phaser.Input.Keyboard.KeyCodes.A,
        Phaser.Input.Keyboard.KeyCodes.S,
        Phaser.Input.Keyboard.KeyCodes.D,
        Phaser.Input.Keyboard.KeyCodes.LEFT,
        Phaser.Input.Keyboard.KeyCodes.RIGHT,
        Phaser.Input.Keyboard.KeyCodes.UP,
        Phaser.Input.Keyboard.KeyCodes.DOWN,
        Phaser.Input.Keyboard.KeyCodes.SPACE,
        Phaser.Input.Keyboard.KeyCodes.V,
      ]);
    }

    window.addEventListener("keydown", this.onRawKeyDown, true);
    window.addEventListener("keyup", this.onRawKeyUp, true);
    const detachRawKeys = () => {
      window.removeEventListener("keydown", this.onRawKeyDown, true);
      window.removeEventListener("keyup", this.onRawKeyUp, true);
      this.rawMove = { left: false, right: false, up: false, down: false };
      this.rawJumpQueued = false;
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, detachRawKeys);
    this.events.once(Phaser.Scenes.Events.DESTROY, detachRawKeys);

    const canvas = this.game.canvas;
    if (canvas) {
      canvas.setAttribute("tabindex", "0");
      canvas.style.outline = "none";
      canvas.addEventListener("pointerdown", () => canvas.focus());
      // Drop focus from nav/lobby buttons so Space/arrows aren't eaten by the UI
      if (
        document.activeElement instanceof HTMLElement &&
        document.activeElement !== canvas
      ) {
        document.activeElement.blur();
      }
      canvas.focus();
    }

    const starter = this.pack.weapons[this.stage.starterWeaponId];
    if (starter) {
      this.weapons.push({ def: starter, level: 1, cooldown: 0 });
    }
    // Always also give a clear projectile so shots are visible from second 0
    const bolt = this.pack.weapons.spirit_bolt;
    if (bolt && starter?.id !== bolt.id) {
      this.weapons.push({ def: bolt, level: 1, cooldown: 0 });
    }

    this.rebuildOrbitals();
    this.placeChests();
    this.emitHud();
  }

  private ensureTextures() {
    const g = this.make.graphics({ x: 0, y: 0 });
    for (let tier = 0; tier < 4; tier++) {
      const key = `player_${tier}`;
      if (this.textures.exists(key)) continue;
      g.clear();
      g.fillStyle(Phaser.Display.Color.HexStringToColor(STRIP_COLORS[tier]!).color);
      g.fillCircle(8, 8, 7);
      g.lineStyle(1, 0x1a1010, 1);
      g.strokeCircle(8, 8, 7);
      if (tier === 0) {
        g.fillStyle(0x2a1810);
        g.fillRect(3, 2, 10, 4);
      }
      g.generateTexture(key, 16, 16);
    }
    if (!this.textures.exists("gem")) {
      g.clear();
      g.fillStyle(0x60e0ff);
      g.fillCircle(4, 4, 4);
      g.generateTexture("gem", 8, 8);
    }
    if (!this.textures.exists("bullet")) {
      g.clear();
      g.fillStyle(0xffc040);
      g.fillCircle(5, 5, 5);
      g.lineStyle(1, 0xfff0a0, 1);
      g.strokeCircle(5, 5, 5);
      g.generateTexture("bullet", 10, 10);
    }
    if (!this.textures.exists("orbit")) {
      g.clear();
      g.fillStyle(0xff8840);
      g.fillCircle(6, 6, 6);
      g.fillStyle(0xffe0a0);
      g.fillCircle(6, 6, 2);
      g.generateTexture("orbit", 12, 12);
    }
    if (!this.textures.exists("ebullet")) {
      g.clear();
      g.fillStyle(0x60ffb0);
      g.fillCircle(3, 3, 3);
      g.generateTexture("ebullet", 6, 6);
    }
    if (!this.textures.exists("chest_3d")) {
      // Small extruded chest (top + front face)
      g.clear();
      g.fillStyle(0x000000, 0.25);
      g.fillEllipse(8, 14, 12, 4);
      g.fillStyle(0xd4b030);
      g.fillRect(2, 2, 12, 8);
      g.fillStyle(0x8a6a18);
      g.fillRect(2, 10, 12, 4);
      g.fillStyle(0xffe080);
      g.fillRect(6, 5, 4, 3);
      g.lineStyle(1, 0x000000, 0.35);
      g.strokeRect(2, 2, 12, 8);
      g.generateTexture("chest_3d", 16, 16);
    }
    for (const def of Object.values(this.pack.enemies)) {
      const key = `enemy_${def.id}`;
      if (this.textures.exists(key)) continue;
      const spr = def.spriteId ? this.pack.sprites[def.spriteId] : undefined;
      if (spr && spriteHasVisual(spr)) {
        const n = normalizePixelSprite(spr);
        const spriteKey = generatePhaserSpriteTexture(this, n);
        if (this.textures.exists(spriteKey) && !this.textures.exists(key)) {
          const src = this.textures.get(spriteKey).getSourceImage() as
            | HTMLCanvasElement
            | HTMLImageElement;
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, n.width);
          canvas.height = Math.max(1, spriteTotalHeight(n));
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
            this.textures.addCanvas(key, canvas);
            continue;
          }
        }
      }
      g.clear();
      const c = Phaser.Display.Color.HexStringToColor(def.color);
      g.fillStyle(c.color);
      g.fillCircle(def.radius, def.radius, def.radius);
      if (def.boss) {
        g.lineStyle(2, 0xffffff, 0.8);
        g.strokeCircle(def.radius, def.radius, def.radius);
      }
      g.generateTexture(key, def.radius * 2, def.radius * 2);
    }

    for (const spr of Object.values(this.pack.sprites ?? {})) {
      generatePhaserSpriteTexture(this, spr);
    }
    g.destroy();
  }

  private drawMap() {
    if (
      this.viewMode === "sideEast" ||
      this.viewMode === "sideWest" ||
      this.viewMode === "sideNorth"
    ) {
      this.drawMapSide(this.viewMode);
      return;
    }
    this.drawMapTop();
  }

  /** Yawed views: bake the same paint graph as the editor into one texture. */
  private drawMapSide(mode: "sideEast" | "sideWest" | "sideNorth") {
    const tileset = this.pack.tilesets[this.map.tilesetId];
    if (!tileset) return;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    paintMapToCanvas(ctx, this.map, tileset, {
      viewMode: mode,
      sprites: this.pack.sprites,
    });
    const key = `__arena_side_${this.map.id}_${mode}`;
    if (this.textures.exists(key)) this.textures.remove(key);
    this.textures.addCanvas(key, canvas);
    this.add.image(0, 0, key).setOrigin(0, 0).setDepth(0);
  }

  private drawMapTop() {
    this.emissiveOverlays = [];
    const tileset = this.pack.tilesets[this.map.tilesetId];
    const ts = this.map.tileSize;
    const wallH = WALL_HEIGHT;
    const worldW = this.map.width * ts;
    const worldH = this.map.height * ts;
    const vPad = mapVerticalPad(this.map);

    // Shared unlit geometry bake (same painter as the editor; pad=0 for entities).
    if (tileset) {
      const geom = document.createElement("canvas");
      const gctx = geom.getContext("2d");
      if (gctx) {
        gctx.imageSmoothingEnabled = false;
        paintMapGeometryToCanvas(gctx, this.map, tileset, {
          sprites: this.pack.sprites,
          padOverride: 0,
        });
        const geomKey = `__arena_geom_${this.map.id}`;
        if (this.textures.exists(geomKey)) this.textures.remove(geomKey);
        this.textures.addCanvas(geomKey, geom);
        this.add.image(0, 0, geomKey).setOrigin(0, 0).setDepth(0);
      }
    }

    // Ambient over ALL map art (incl. elev>0 tops/cliffs/walls), below lamps.
    const light = resolveMapLight(this.map);
    const ambient = this.add.rectangle(
      worldW / 2,
      (worldH - vPad) / 2,
      worldW + 4,
      worldH + vPad + 4,
      hexToPhaser(light.ambientColor, 0x080614),
      light.ambientAlpha,
    );
    ambient.setDepth(ArenaScene.AMBIENT_DEPTH);

    if (tileset) {
      const mapLight = light;
      const { lit } = computeLitSurfaces(
        this.map,
        tileset,
        this.pack.sprites,
      );
      const glow = litSurfacesToFloorGlow(lit);
      const ambientCss = rgbaFromHex(
        mapLight.ambientColor,
        mapLight.ambientAlpha,
        { r: 8, g: 6, b: 20 },
      );

      // Same surface light pass as the editor (floors / faces / treads).
      {
        const overlay = document.createElement("canvas");
        overlay.width = Math.max(1, Math.ceil(worldW));
        overlay.height = Math.max(1, Math.ceil(worldH + vPad));
        const octx = overlay.getContext("2d");
        if (octx) {
          octx.imageSmoothingEnabled = false;
          // Phaser top tiles use originY=0 (pad is camera slack, not paint offset).
          // Protect unlit elevated tops from z0 wash screen-space overlap.
          withProtectedUnlitElevatedTops(
            octx,
            this.map,
            tileset,
            { scale: 1, originY: 0, floorGlow: glow },
            () => {
              paintSurfaceLightOverlay(
                octx,
                this.map,
                tileset,
                lit,
                1,
                0,
                wallH,
                ambientCss,
              );
            },
          );
          const lightKey = `__arena_surface_light_${this.map.id}`;
          if (this.textures.exists(lightKey)) this.textures.remove(lightKey);
          this.textures.addCanvas(lightKey, overlay);
          this.add
            .image(0, 0, lightKey)
            .setOrigin(0, 0)
            .setDepth(ArenaScene.LAMP_DEPTH_BASE);
        }
      }

      // Props: bake ambient + lamp tint into one texture (same as editor).
      for (const place of this.map.sprites ?? []) {
        const spr = this.pack.sprites[place.spriteId];
        if (!spr || !spriteHasVisual(spr)) continue;
        const n = normalizePixelSprite(spr);
        const elev = tileSurfaceElev(this.map, place.x, place.y);
        const elevOff = elevVisualOffset(elev);
        const stackW = n.width;
        const stackH = spriteTotalHeight(n);
        const wallPx = spriteWallHeight(n);
        const floorY = place.y * ts - elevOff;
        const cx = place.x * ts + ts / 2;
        const cy =
          wallPx > 0 ? floorY + ts - stackH / 2 : floorY + ts / 2;
        const tintOpts = {
          cell: pickSpriteLampCell(
            glow,
            place.x,
            place.y,
            elev,
          ),
          glow,
          placeX: place.x,
          placeY: place.y,
          placeElev: elev,
          tileArtSize: this.map.tileSize,
        };
        const baked = bakeLanternLitSpriteCanvas(
          spr,
          mapLight,
          ambientCss,
          tintOpts,
          1,
          this.map.tileSize,
        );
        const litKey = `ember_sprite_lit_${place.id}`;
        if (this.textures.exists(litKey)) this.textures.remove(litKey);
        if (baked) {
          this.textures.addCanvas(litKey, baked);
          this.add
            .image(cx, cy, litKey)
            .setDisplaySize(stackW, stackH)
            .setDepth(this.lampDepth(place.y, elev, 3.35));
        } else {
          const key = generatePhaserSpriteTexture(this, n);
          if (!this.textures.exists(key)) continue;
          this.add
            .image(cx, cy, key)
            .setDisplaySize(stackW, stackH)
            .setDepth(this.lampDepth(place.y, elev, 3.35));
        }
        if (n.emissivePixels && hasEmissiveInk(n.emissivePixels)) {
          const emKey = `ember_sprite_em_${place.id}`;
          if (this.textures.exists(emKey)) this.textures.remove(emKey);
          const emCanvas = document.createElement("canvas");
          emCanvas.width = stackW;
          emCanvas.height = stackH;
          const emCtx = emCanvas.getContext("2d");
          if (emCtx) {
            paintEmissivePixels(
              emCtx,
              n.emissivePixels,
              n.width,
              stackH,
              0,
              0,
              stackW,
              stackH,
              1,
            );
            this.textures.addCanvas(emKey, emCanvas);
            const strength = resolveEmissiveGlowStrength(n.emissiveStrength);
            // All modes start extinguished, then ease up.
            const startMul = strength * EMISSIVE_TRIGGER_IDLE;
            const img = this.add
              .image(cx, cy, emKey)
              .setDisplaySize(stackW, stackH)
              .setDepth(this.lampDepth(place.y, elev, 3.37))
              .setBlendMode(Phaser.BlendModes.ADD)
              .setAlpha(startMul);
            this.emissiveOverlays.push({
              img,
              placeX: place.x,
              placeY: place.y,
              anim: n.emissiveAnim,
              strength,
              periodSec: n.emissiveAnimPeriod,
              periodMinSec: n.emissiveAnimPeriodMin,
              periodMaxSec: n.emissiveAnimPeriodMax,
              triggerRadius: n.emissiveTriggerRadius ?? 3,
              triggerWhen: n.emissiveTriggerWhen,
              triggerEventId: n.emissiveTriggerEventId,
              seed: emissivePlacementSeed(place.spriteId, place.x, place.y),
              smoothMul: startMul,
            });
          }
        }
      }

      // Global lamp + emissive bloom
      {
        const bloomPad = Math.ceil(wallH * 4);
        const emissive = document.createElement("canvas");
        emissive.width = Math.max(1, Math.ceil(worldW));
        emissive.height = Math.max(1, Math.ceil(worldH + bloomPad));
        const ectx = emissive.getContext("2d");
        if (ectx) {
          ectx.imageSmoothingEnabled = true;
          ectx.clearRect(0, 0, emissive.width, emissive.height);
          if (mapLight.bloomStrength > 0) {
            paintLanternBloomField(
              ectx,
              this.map,
              tileset,
              1,
              bloomPad,
              glow,
              this.pack.sprites,
            );
          }
          paintMapEmissiveField(ectx, this.map, tileset, {
            sprites: this.pack.sprites,
            scale: 1,
            originY: bloomPad,
            timeSec: 0,
            mode: "bloom",
          });
          const bloom = buildLanternBloomCanvas(emissive, {
            occlude: {
              map: this.map,
              tileset,
              scale: 1,
              originY: bloomPad,
              floorGlow: glow,
            },
          });
          const bloomStrength = Math.max(mapLight.bloomStrength, 0.28);
          if (bloom && bloomStrength > 0) {
            const bloomKey = `__arena_lamp_bloom_${this.map.id}`;
            if (this.textures.exists(bloomKey)) this.textures.remove(bloomKey);
            this.textures.addCanvas(bloomKey, bloom);
            this.add
              .image(0, -bloomPad, bloomKey)
              .setOrigin(0, 0)
              .setDepth(ArenaScene.LAMP_BLOOM_DEPTH)
              .setAlpha(bloomStrength)
              .setBlendMode(Phaser.BlendModes.ADD);
          }
        }
      }
    }
  }

  private tilesetOrThrow() {
    const tileset = this.pack.tilesets[this.map.tilesetId];
    if (!tileset) throw new Error(`tileset ${this.map.tilesetId}`);
    return tileset;
  }

  private currentGroundTile() {
    const pl = this.logicPos(this.player);
    const { tx, ty } = worldToTile(this.map, pl.x, pl.y);
    return groundTileAt(this.map, this.tilesetOrThrow(), tx, ty);
  }

  private tryCircleMove(
    x: number,
    y: number,
    nextX: number,
    nextY: number,
    radius: number,
    elev: number,
  ): { x: number; y: number; elev: number } {
    return tryMoveWithElevation(
      this.map,
      this.tilesetOrThrow(),
      x,
      y,
      nextX,
      nextY,
      radius,
      elev,
      this.pack.sprites,
      this.viewMode,
      this.pack.voxelModels,
      this.pack.voxelScenes,
      this.stage.playerBody,
    );
  }

  private placeChests() {
    for (const r of findRegions(this.map, "chest")) {
      const p = regionCenter(this.map, r);
      const { tx, ty } = worldToTile(this.map, p.x, p.y);
      const elev = tileSurfaceElev(this.map, tx, ty);
      const spr = this.physics.add.staticSprite(0, 0, "chest_3d");
      spr.setData("regionId", r.id);
      this.place(spr, p.x, p.y, 8, elev);
    }
  }

  private tickChestPickup() {
    const pl = this.logicPos(this.player);
    for (const r of findRegions(this.map, "chest")) {
      if (this.chestTaken.has(r.id) || this.awaitingLoot || this.finished) {
        continue;
      }
      const p = regionCenter(this.map, r);
      if (Phaser.Math.Distance.Between(pl.x, pl.y, p.x, p.y) > 14) continue;
      if (!elevNearlyEqual(regionVolumeElev(this.map, r), this.playerElev)) {
        continue;
      }
      this.chestTaken.add(r.id);
      for (const child of this.children.list) {
        if (
          child instanceof Phaser.Physics.Arcade.Sprite &&
          child.getData("regionId") === r.id
        ) {
          child.destroy();
          break;
        }
      }
      this.openChest();
      return;
    }
  }

  update(_t: number, delta: number) {
    if (this.finished) return;
    const dt = delta / 1000;
    if (!this.pausedLogic && !this.awaitingLoot) {
      this.elapsed += dt;
      this.handleMove(dt);
      this.tickTeleport(dt);
      this.tickTriggerRegions(dt);
      this.tickWeapons(dt);
      this.tickBullets(dt);
      this.tickOrbitals(dt);
      this.tickSpawns(dt);
      this.tickEnemies(dt);
      this.tickChestPickup();
      this.tickTileSemantics();
      this.tickFilth();
      if (this.elapsed >= this.duration) {
        this.finish("clear");
      }
    } else {
      // Keep orbitals visually glued to the player while paused/loot
      this.tickOrbitals(0);
    }
    this.hudAcc += delta;
    if (this.hudAcc > 100) {
      this.hudAcc = 0;
      this.emitHud();
    }
    this.tickEmissiveOverlays();
  }

  private tickEmissiveOverlays() {
    if (!this.emissiveOverlays.length || !this.player) return;
    const ts = this.map.tileSize;
    const pl = this.logicPos(this.player);
    const playerTiles = [{ x: pl.x / ts, y: pl.y / ts }];
    const enemyTiles: Array<{ x: number; y: number }> = [];
    for (const e of this.enemies.getChildren() as EnemySprite[]) {
      if (!e.active) continue;
      const ep = this.logicPos(e);
      enemyTiles.push({ x: ep.x / ts, y: ep.y / ts });
    }
    const now = this.time.now;
    const dt =
      this.emissiveLastMs > 0
        ? Math.min(0.05, (now - this.emissiveLastMs) / 1000)
        : 1 / 60;
    this.emissiveLastMs = now;
    const t = now / 1000;
    for (const o of this.emissiveOverlays) {
      const radius = resolveEmissiveTriggerRadius(o.triggerRadius);
      const playerAmount = emissiveProximityAmount(
        o.placeX,
        o.placeY,
        radius,
        playerTiles,
      );
      const enemyAmount = emissiveProximityAmount(
        o.placeX,
        o.placeY,
        radius,
        enemyTiles,
      );
      const eventActive = !!(
        o.triggerEventId && this.activeEmissiveEvents.has(o.triggerEventId)
      );
      const triggerAmount = emissiveTriggerAmount(o.triggerWhen, {
        playerAmount,
        enemyAmount,
        eventActive,
      });
      let flickerMul: number | undefined;
      if (resolveEmissiveAnim(o.anim) === "flicker") {
        const range = resolveEmissiveFlickerPeriodRange(
          o.periodMinSec,
          o.periodMaxSec,
          o.periodSec,
        );
        if (!o.flicker) {
          o.flicker = createEmissiveFlickerState(
            o.seed,
            range.min,
            range.max,
          );
        }
        flickerMul = stepEmissiveFlicker(
          o.flicker,
          dt,
          o.seed,
          range.min,
          range.max,
        );
      }
      const target =
        o.strength *
        emissiveAnimMul(o.anim, {
          timeSec: t,
          seed: o.seed,
          periodSec: o.periodSec,
          periodMinSec: o.periodMinSec,
          periodMaxSec: o.periodMaxSec,
          flickerMul,
          triggerAmount,
        });
      const prev = o.smoothMul ?? o.strength * EMISSIVE_TRIGGER_IDLE;
      const mul = emissiveSmoothToward(prev, target, dt);
      o.smoothMul = mul;
      o.img.setAlpha(Math.max(0, Math.min(1, mul)));
    }
  }

  private setRawMoveKey(code: string, down: boolean): boolean {
    // Arrows switch camera — movement is WASD only.
    switch (code) {
      case "KeyA":
        this.rawMove.left = down;
        return true;
      case "KeyD":
        this.rawMove.right = down;
        return true;
      case "KeyW":
        this.rawMove.up = down;
        return true;
      case "KeyS":
        this.rawMove.down = down;
        return true;
      case "Space":
        return true;
      default:
        return false;
    }
  }

  private handleMove(dt: number) {
    let camVx = 0;
    let camVy = 0;
    if (this.rawMove.left || this.wasd?.A.isDown) {
      camVx -= 1;
    }
    if (this.rawMove.right || this.wasd?.D.isDown) {
      camVx += 1;
    }
    if (this.rawMove.up || this.wasd?.W.isDown) {
      camVy -= 1;
    }
    if (this.rawMove.down || this.wasd?.S.isDown) {
      camVy += 1;
    }
    let vx = 0;
    let vy = 0;
    if (camVx !== 0 || camVy !== 0) {
      const len = Math.hypot(camVx, camVy);
      camVx /= len;
      camVy /= len;
      const world = cameraMoveToWorld(this.viewMode, camVx, camVy);
      vx = world.vx;
      vy = world.vy;
      this.lastFacingX = vx;
      this.lastFacingY = vy;
      this.lastAim = Math.atan2(vy, vx);
    }

    this.jumpCd = Math.max(0, this.jumpCd - dt);
    const jumpPressed =
      this.rawJumpQueued ||
      (this.jumpKey && Phaser.Input.Keyboard.JustDown(this.jumpKey));
    this.rawJumpQueued = false;
    if (jumpPressed && this.jumpCd <= 0) {
      const pl = this.logicPos(this.player);
      const jumped = tryJumpLedge(
        this.map,
        this.tilesetOrThrow(),
        pl.x,
        pl.y,
        this.playerElev,
        this.lastFacingX,
        this.lastFacingY,
        PLAYER_BODY_R,
        this.pack.sprites,
        this.viewMode,
        this.pack.voxelModels,
        this.pack.voxelScenes,
      );
      if (jumped) {
        this.playerElev = jumped.elev;
        this.place(this.player, jumped.x, jumped.y, 20, this.playerElev);
        this.jumpCd = 0.35;
        this.player.setVelocity(0, 0);
        return;
      }
    }

    const pl = this.logicPos(this.player);
    const { tx, ty } = worldToTile(this.map, pl.x, pl.y);
    const tile = groundTileAt(this.map, this.tilesetOrThrow(), tx, ty);
    const tileSlow =
      typeof tile?.slow === "object"
        ? (tile.slow.multiplier ?? 0.7)
        : tile?.slow
          ? 0.7
          : 1;
    const filthSlow = this.time.now < this.filthUntil ? 0.7 : 1;
    const speed = this.stage.moveSpeed * this.moveMul * filthSlow * tileSlow;
    const nextX = pl.x + vx * speed * dt;
    const nextY = pl.y + vy * speed * dt;
    const pos = this.tryCircleMove(
      pl.x,
      pl.y,
      nextX,
      nextY,
      PLAYER_BODY_R,
      this.playerElev,
    );
    this.playerElev = pos.elev;
    this.place(this.player, pos.x, pos.y, 20, this.playerElev);
    this.player.setVelocity(0, 0);
  }

  private tickTeleport(dt: number) {
    this.teleportCd = Math.max(0, this.teleportCd - dt);
    if (this.awaitingLoot || this.finished) return;
    const pl = this.logicPos(this.player);
    const stepped = stepTeleport(
      this.map,
      pl.x,
      pl.y,
      this.teleportOccupyId,
      this.teleportCd <= 0,
      this.playerElev,
    );
    this.teleportOccupyId = stepped.occupyingId;
    const dest = stepped.warp;
    if (!dest) return;
    this.playerElev = dest.elev;
    this.place(this.player, dest.x, dest.y, 20, this.playerElev);
    this.teleportCd = 0.45;
  }

  /** Fire narrative events when the player enters a `trigger` region. */
  private tickTriggerRegions(dt: number) {
    this.triggerCd = Math.max(0, this.triggerCd - dt);
    if (this.triggerCd > 0 || this.awaitingLoot || this.finished) return;
    const pl = this.logicPos(this.player);
    for (const r of findRegions(this.map, "trigger")) {
      if (!pointInRegion(this.map, r, pl.x, pl.y, this.playerElev)) continue;
      const event = Object.values(this.pack.events).find(
        (ev) =>
          ev.trigger === "on_region_enter" &&
          ev.regionId === r.id &&
          (!ev.mapId || ev.mapId === this.map.id),
      );
      if (!event) continue;
      this.triggerCd = 1.2;
      this.activeEmissiveEvents.add(event.id);
      this.finished = true;
      this.physics.pause();
      this.onBridge({ type: "pending_event", eventId: event.id });
      return;
    }
  }

  private tickWeapons(dt: number) {
    this.orbitAngle += dt * 2.8;
    for (const slot of this.weapons) {
      if (
        slot.def.kind === "passive" ||
        slot.def.kind === "instant_heal" ||
        slot.def.kind === "orbit"
      ) {
        continue;
      }
      slot.cooldown -= dt * 1000;
      if (slot.cooldown > 0) continue;
      const cd = Math.max(
        200,
        slot.def.cooldownMs - (slot.level - 1) * 40,
      );
      slot.cooldown = cd;
      this.fireWeapon(slot);
    }
  }

  private fireWeapon(slot: WeaponSlot) {
    const dmg =
      slot.def.damage +
      (slot.level - 1) * (slot.def.levelBonus?.damage ?? 0);
    const count = Math.max(
      1,
      Math.floor(
        slot.def.count + (slot.level - 1) * (slot.def.levelBonus?.count ?? 0),
      ),
    );
    const range =
      slot.def.range +
      (slot.level - 1) * (slot.def.levelBonus?.range ?? 0);
    const speed = Math.max(80, slot.def.speed || 200);

    const playerL = this.logicPos(this.player);
    switch (slot.def.kind) {
      case "projectile": {
        const target = this.nearestEnemy();
        const tpos = target ? this.logicPos(target) : null;
        const base = tpos
          ? Phaser.Math.Angle.Between(playerL.x, playerL.y, tpos.x, tpos.y)
          : this.lastAim;
        const spread = count > 1 ? 0.22 : 0;
        for (let i = 0; i < count; i++) {
          const angle = base + (i - (count - 1) / 2) * spread;
          this.spawnBullet(
            playerL.x,
            playerL.y,
            Math.cos(angle) * speed,
            Math.sin(angle) * speed,
            dmg,
            Math.max(0.6, range / speed),
            this.playerElev,
          );
        }
        break;
      }
      case "orbit":
        // handled by persistent orbitals
        break;
      case "nova": {
        this.damageEnemiesInRadius(playerL.x, playerL.y, range, dmg);
        const ring = this.add.circle(
          this.player.x,
          this.player.y,
          8,
          0xff6020,
          0.35,
        );
        ring.setDepth(this.player.depth + 1);
        this.tweens.add({
          targets: ring,
          scale: range / 8,
          alpha: 0,
          duration: 280,
          onComplete: () => ring.destroy(),
        });
        break;
      }
      case "passive":
      case "instant_heal":
        break;
      default: {
        const _n: never = slot.def.kind;
        void _n;
      }
    }
  }

  private spawnBullet(
    lx: number,
    ly: number,
    vx: number,
    vy: number,
    dmg: number,
    life: number,
    elev = 0,
  ) {
    const b = this.physics.add.sprite(0, 0, "bullet");
    b.setData("dmg", dmg);
    b.setData("vx", vx);
    b.setData("vy", vy);
    b.setCircle(4, 1, 1);
    this.place(b, lx, ly, 16, elev);
    this.bullets.add(b);
    const body = b.body as Phaser.Physics.Arcade.Body | null;
    if (body) {
      body.enable = true;
      body.setAllowGravity(false);
      body.setVelocity(0, 0);
    }
    const lifeMs = Math.max(400, life * 1000);
    this.time.delayedCall(lifeMs, () => {
      if (b.active) b.destroy();
    });
  }

  /** Move bullets + destroy on wall hit (logical space). */
  private tickBullets(dt: number) {
    const tileset = this.tilesetOrThrow();
    const pl = this.logicPos(this.player);
    const stepGroup = (
      group: Phaser.Physics.Arcade.Group,
      radius: number,
      enemyShot: boolean,
    ) => {
      for (const child of group.getChildren()) {
        const b = child as Phaser.Physics.Arcade.Sprite;
        if (!b.active) continue;
        const body = b.body as Phaser.Physics.Arcade.Body | null;
        const vx = Number(b.getData("vx") ?? 0);
        const vy = Number(b.getData("vy") ?? 0);
        const elev = Number(b.getData("elev") ?? 0);
        const cur = this.logicPos(b);
        const nx = cur.x + vx * dt;
        const ny = cur.y + vy * dt;
        if (
          circleHitsSolid(
            this.map,
            tileset,
            nx,
            ny,
            radius,
            elev,
            this.pack.sprites,
            this.viewMode,
          )
        ) {
          b.destroy();
          continue;
        }
        this.place(b, nx, ny, 16, elev);
        body?.setVelocity(0, 0);
        if (enemyShot) {
          const hitR = PLAYER_HURT_R + radius;
          if (
            elevNearlyEqual(elev, this.playerElev) &&
            Phaser.Math.Distance.Between(pl.x, pl.y, nx, ny) <= hitR
          ) {
            this.hitPlayerBullet(b);
          }
        }
      }
    };
    stepGroup(this.bullets, 3, false);
    stepGroup(this.enemyBullets, 3, true);
  }

  private rebuildOrbitals() {
    for (const o of this.orbitals) {
      o.spr.destroy();
    }
    this.orbitals = [];
    this.weapons.forEach((slot, slotIndex) => {
      if (slot.def.kind !== "orbit") return;
      const count = Math.max(
        1,
        Math.floor(
          slot.def.count +
            (slot.level - 1) * (slot.def.levelBonus?.count ?? 0),
        ),
      );
      const range =
        slot.def.range +
        (slot.level - 1) * (slot.def.levelBonus?.range ?? 0);
      const dmg =
        slot.def.damage +
        (slot.level - 1) * (slot.def.levelBonus?.damage ?? 0);
      for (let i = 0; i < count; i++) {
        const spr = this.physics.add.sprite(0, 0, "orbit");
        const pl = this.logicPos(this.player);
        this.place(spr, pl.x, pl.y, 18, this.playerElev);
        spr.setCircle(5, 1, 1);
        if (spr.body) {
          (spr.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
          spr.body.enable = true;
        }
        this.physics.add.overlap(spr, this.enemies, (_s, e) => {
          const enemy = e as EnemySprite;
          const key = enemy.getData("uid") as number | undefined;
          const uid =
            typeof key === "number"
              ? key
              : (() => {
                  const id = Math.random();
                  enemy.setData("uid", id);
                  return id;
                })();
          const entry = this.orbitals.find((o) => o.spr === spr);
          if (!entry) return;
          const now = this.time.now;
          if ((entry.hitCd.get(uid) ?? 0) > now) return;
          entry.hitCd.set(uid, now + 280);
          this.applyDamageToEnemy(enemy, entry.dmg);
        });
        this.orbitals.push({
          spr,
          slotIndex,
          index: i,
          count,
          range,
          dmg,
          hitCd: new Map(),
        });
      }
    });
  }

  private tickOrbitals(_dt: number) {
    const pl = this.logicPos(this.player);
    for (const o of this.orbitals) {
      if (!o.spr.active) continue;
      const a =
        this.orbitAngle + (Math.PI * 2 * o.index) / Math.max(1, o.count);
      const lx = pl.x + Math.cos(a) * o.range;
      const ly = pl.y + Math.sin(a) * o.range;
      this.place(o.spr, lx, ly, 18, this.playerElev);
    }
  }

  private nearestEnemy(): EnemySprite | null {
    let best: EnemySprite | null = null;
    let bestD = Infinity;
    const pl = this.logicPos(this.player);
    for (const e of this.enemies.getChildren() as EnemySprite[]) {
      if (!e.active) continue;
      const el = this.logicPos(e);
      const d = Phaser.Math.Distance.Between(pl.x, pl.y, el.x, el.y);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  private damageEnemiesInRadius(
    x: number,
    y: number,
    r: number,
    dmg: number,
  ) {
    for (const e of this.enemies.getChildren() as EnemySprite[]) {
      if (!e.active) continue;
      const el = this.logicPos(e);
      if (Phaser.Math.Distance.Between(x, y, el.x, el.y) <= r) {
        this.applyDamageToEnemy(e, dmg);
      }
    }
  }

  private hitEnemy(
    bullet: Phaser.Physics.Arcade.Sprite,
    enemy: EnemySprite,
  ) {
    const dmg = Number(bullet.getData("dmg") ?? 0);
    bullet.destroy();
    this.applyDamageToEnemy(enemy, dmg);
  }

  private applyDamageToEnemy(enemy: EnemySprite, dmg: number) {
    if (!enemy.active) return;
    enemy.hp = (enemy.hp ?? 1) - dmg;
    enemy.setTintFill(0xffffff);
    this.time.delayedCall(50, () => {
      if (enemy.active) enemy.clearTint();
    });
    if ((enemy.hp ?? 0) <= 0) {
      this.killEnemy(enemy);
    }
  }

  private killEnemy(enemy: EnemySprite) {
    const def = enemy.def;
    const pos = this.logicPos(enemy);
    const elev = Number(enemy.getData("elev") ?? 0);
    enemy.destroy();
    this.killed += 1;
    if (def) {
      const gem = this.gems.create(0, 0, "gem") as Phaser.Physics.Arcade.Sprite;
      gem.setData("xp", def.xp * this.stage.xpGemValue);
      this.place(gem, pos.x, pos.y, 12, elev);
    }
  }

  private collectGem(gem: Phaser.Physics.Arcade.Sprite) {
    if (!gem.active) return;
    const add = Number(gem.getData("xp") ?? 1);
    gem.destroy();
    this.xp += add;
    while (this.xp >= this.xpToLevel) {
      this.xp -= this.xpToLevel;
      this.level += 1;
      this.xpToLevel = Math.floor(this.stage.baseXpToLevel + this.level * 4);
      this.openLevelUp();
    }
  }

  private tickSpawns(dt: number) {
    const table = this.pack.spawns[this.stage.spawnTableId];
    if (!table) return;
    const bossAt = this.shortMode
      ? Math.min(45, this.stage.bossAtSec)
      : this.stage.bossAtSec;
    const t = this.elapsed;

    table.entries.forEach((entry, idx) => {
      let at = entry.atSec;
      let until = entry.untilSec;
      if (entry.enemyId === "boss_tourist") {
        at = bossAt;
        until = bossAt + 1;
      } else if (this.shortMode) {
        at = entry.atSec * (90 / Math.max(1, this.stage.durationSec));
        until = entry.untilSec * (90 / Math.max(1, this.stage.durationSec));
      }
      if (t < at || t > until) return;
      if (entry.once) {
        if (this.onceFired.has(idx)) return;
        this.onceFired.add(idx);
        for (let i = 0; i < entry.count; i++) {
          this.spawnEnemy(entry.enemyId, entry.regionGroup);
        }
        return;
      }
      this.spawnAcc[idx] = (this.spawnAcc[idx] ?? 0) + dt;
      if (this.spawnAcc[idx]! >= entry.intervalSec) {
        this.spawnAcc[idx] = 0;
        for (let i = 0; i < entry.count; i++) {
          this.spawnEnemy(entry.enemyId, entry.regionGroup);
        }
      }
    });
  }

  private spawnEnemy(enemyId: string, group: string) {
    const def = this.pack.enemies[enemyId];
    if (!def) return;
    if (this.enemies.countActive(true) > 180) return;

    let regions = findRegions(this.map, "spawn", group);
    if (regions.length === 0) regions = findRegions(this.map, "spawn");
    const region =
      regions[Math.floor(Math.random() * regions.length)] ??
      findRegions(this.map, "player_start")[0];
    if (!region) return;

    const tileset = this.tilesetOrThrow();
    const radius = enemyBodyRadius(def.radius);
    const sprLib = this.pack.sprites;
    let p = randomWalkablePointInRegion(
      this.map,
      tileset,
      region,
      radius,
      Math.random,
      sprLib,
    );
    // Fallback: try any spawn region, then player_start
    if (!p) {
      for (const r of findRegions(this.map, "spawn")) {
        p = randomWalkablePointInRegion(
          this.map,
          tileset,
          r,
          radius,
          Math.random,
          sprLib,
        );
        if (p) break;
      }
    }
    if (!p) {
      const start = findRegions(this.map, "player_start")[0];
      if (start) {
        p = randomWalkablePointInRegion(
          this.map,
          tileset,
          start,
          radius,
          Math.random,
          sprLib,
        );
      }
    }
    if (!p) return;

    const spr = this.enemies.create(0, 0, `enemy_${def.id}`) as EnemySprite;
    spr.enemyId = def.id;
    spr.def = def;
    spr.hp = def.hp;
    spr.maxHp = def.hp;
    spr.touchCd = 0;
    // Texture is def.radius*2; center the body circle (Phaser default is top-left).
    const texHalf = def.radius;
    spr.setCircle(radius, texHalf - radius, texHalf - radius);
    const linked = def.spriteId ? this.pack.sprites[def.spriteId] : undefined;
    if (linked && spriteHasVisual(linked)) {
      const n = normalizePixelSprite(linked);
      spr.setDisplaySize(n.width, Math.max(1, spriteTotalHeight(n)));
      // Retarget circle to the displayed sprite center.
      const hw = n.width * 0.5;
      const hh = Math.max(1, spriteTotalHeight(n)) * 0.5;
      spr.setCircle(radius, hw - radius, hh - radius);
    }
    spr.elev = p.elev;
    this.place(spr, p.x, p.y, 14, spr.elev);
  }

  private tickEnemies(dt: number) {
    const pl = this.logicPos(this.player);
    for (const e of this.enemies.getChildren() as EnemySprite[]) {
      if (!e.active || !e.def) continue;
      const def = e.def;
      const el = this.logicPos(e);
      let elev = Number(e.getData("elev") ?? e.elev ?? 0);
      const angle = Phaser.Math.Angle.Between(el.x, el.y, pl.x, pl.y);
      const dist = Phaser.Math.Distance.Between(el.x, el.y, pl.x, pl.y);
      const radius = enemyBodyRadius(def.radius);
      const sameElev = elevNearlyEqual(elev, this.playerElev);

      e.touchCd = (e.touchCd ?? 0) - dt;

      // Ranged only on same elev (shots already ignore other floors).
      if (
        def.ranged &&
        sameElev &&
        dist < (def.range ?? 140) &&
        dist > 40
      ) {
        e.setVelocity(0, 0);
        if ((e.touchCd ?? 0) <= 0) {
          e.touchCd = 1.6;
          const sp = def.projectileSpeed ?? 120;
          const b = this.physics.add.sprite(0, 0, "ebullet");
          this.enemyBullets.add(b);
          b.setData("filth", Boolean(def.filthOnHit));
          b.setData("filthMs", def.filthDurationMs ?? 2500);
          b.setData("dmg", def.damage);
          b.setData("strip", def.stripDamage * 0.5);
          b.setData("vx", Math.cos(angle) * sp);
          b.setData("vy", Math.sin(angle) * sp);
          b.setCircle(3);
          this.place(b, el.x, el.y, 15, elev);
          const body = b.body as Phaser.Physics.Arcade.Body | null;
          body?.setAllowGravity(false);
          body?.setVelocity(0, 0);
          this.time.delayedCall(2500, () => {
            if (b.active) b.destroy();
          });
        }
      } else {
        // Straight chase; tryMoveWithElevation blocks cliffs / wrong floors.
        const dx = Math.cos(angle) * def.speed * dt;
        const dy = Math.sin(angle) * def.speed * dt;
        const pos = this.tryCircleMove(
          el.x,
          el.y,
          el.x + dx,
          el.y + dy,
          radius,
          elev,
        );
        elev = pos.elev;
        e.elev = elev;
        this.place(e, pos.x, pos.y, 14, elev);
        e.setVelocity(0, 0);
      }

      if (
        elevNearlyEqual(elev, this.playerElev) &&
        dist < radius + PLAYER_HURT_R &&
        (e.touchCd ?? 0) <= 0 &&
        !def.ranged
      ) {
        e.touchCd = 0.55;
        this.damagePlayer(def.damage, def.stripDamage, def);
      }
    }
  }

  private hitPlayerBullet(b: Phaser.Physics.Arcade.Sprite) {
    if (!b.active) return;
    const dmg = Number(b.getData("dmg") ?? 5);
    const strip = Number(b.getData("strip") ?? 0);
    const filth = Boolean(b.getData("filth"));
    const filthMs = Number(b.getData("filthMs") ?? 2500);
    b.destroy();
    this.damagePlayer(dmg, strip, {
      filthOnHit: filth,
      filthDurationMs: filthMs,
    } as EmberEnemyDef);
  }

  private damagePlayer(
    dmg: number,
    strip: number,
    src?: Pick<EmberEnemyDef, "filthOnHit" | "filthDurationMs">,
  ) {
    if (this.finished || this.awaitingLoot) return;
    this.hp -= dmg;
    this.stripMeter += strip;
    while (this.stripMeter >= 25 && this.stripTier < 3) {
      this.stripMeter -= 25;
      this.stripTier += 1;
      this.player.setTexture(`player_${this.stripTier}`);
      this.onBridge({
        type: "toast",
        textRu: `Одежда: tier ${this.stripTier}`,
      });
    }
    if (src?.filthOnHit) {
      const resist = Math.min(0.85, this.filthResist);
      if (Math.random() > resist) {
        this.filthUntil =
          this.time.now + (src.filthDurationMs ?? 2500) * (1 - resist * 0.5);
        this.player.setAlpha(0.75);
      }
    }
    this.cameras.main.shake(80, 0.004);
    if (this.hp <= 0) {
      this.hp = 0;
      this.finish("fail");
    }
  }

  private tickFilth() {
    if (this.time.now >= this.filthUntil && this.player.alpha < 1) {
      this.player.setAlpha(1);
    }
  }

  private tickTileSemantics() {
    const tile = this.currentGroundTile();
    const now = this.time.now;
    const stain = tile?.stain;
    if (stain) {
      const durationMs =
        typeof stain === "object" ? (stain.durationMs ?? 2500) : 2500;
      this.filthUntil = Math.max(this.filthUntil, now + durationMs);
      this.player.setAlpha(0.75);
    }

    const hazard = tile?.hazard;
    if (!hazard || now < this.tileHazardNextAt) return;
    const damage = typeof hazard === "object" ? (hazard.damage ?? 6) : 6;
    const stripDamage =
      typeof hazard === "object" ? (hazard.stripDamage ?? 0) : 0;
    const intervalMs =
      typeof hazard === "object" ? (hazard.intervalMs ?? 800) : 800;
    this.tileHazardNextAt = now + intervalMs;
    this.damagePlayer(damage, stripDamage);
  }

  private ownedWeaponIds(): Set<string> {
    return new Set(this.weapons.map((w) => w.def.id));
  }

  private openLevelUp() {
    if (this.finished) return;
    const pool = this.pack.pools[this.stage.weaponPoolId];
    if (!pool) return;
    this.awaitingLoot = true;
    this.physics.pause();
    const roll = rollLootOptions(this.pack, pool, 3, this.ownedWeaponIds());
    this.onBridge({
      type: "level_up",
      options: roll.options,
      targetId: roll.targetId,
    });
  }

  private openChest() {
    const pool = this.pack.pools[this.stage.chestPoolId];
    if (!pool) return;
    this.awaitingLoot = true;
    this.physics.pause();
    const roll = rollLootOptions(this.pack, pool, 3, this.ownedWeaponIds());
    this.onBridge({
      type: "chest",
      options: roll.options,
      targetId: roll.targetId,
    });
  }

  applyLoot(itemId: string) {
    const def = this.pack.weapons[itemId];
    if (!def) {
      this.resumeAfterLoot();
      return;
    }
    if (def.kind === "instant_heal") {
      this.hp = Math.min(this.maxHp, this.hp + (def.heal ?? 20));
      this.onBridge({ type: "toast", textRu: `+${def.heal ?? 20} HP` });
    } else {
      const existing = this.weapons.find((w) => w.def.id === itemId);
      if (existing) {
        existing.level += 1;
      } else if (this.weapons.filter((w) => w.def.kind !== "passive").length < 4 || def.kind === "passive") {
        this.weapons.push({ def, level: 1, cooldown: 0 });
      } else {
        // replace weakest non-passive
        const idx = this.weapons.findIndex((w) => w.def.kind !== "passive");
        if (idx >= 0) this.weapons[idx] = { def, level: 1, cooldown: 0 };
      }
      this.recalcPassives();
      this.rebuildOrbitals();
    }
    this.resumeAfterLoot();
  }

  private recalcPassives() {
    this.filthResist = 0;
    this.moveMul = 1;
    for (const w of this.weapons) {
      if (w.def.kind !== "passive" || !w.def.passive) continue;
      const fr =
        (w.def.passive.filthResist ?? 0) +
        (w.level - 1) * (w.def.levelBonus?.filthResist ?? 0);
      this.filthResist += fr;
      this.moveMul *= w.def.passive.moveSpeedMul ?? 1;
    }
  }

  private resumeAfterLoot() {
    this.awaitingLoot = false;
    if (!this.pausedLogic) this.physics.resume();
  }

  pauseLogic() {
    this.pausedLogic = true;
    this.physics.pause();
  }

  resumeLogic() {
    this.pausedLogic = false;
    if (!this.awaitingLoot) this.physics.resume();
  }

  private finish(outcome: "clear" | "fail") {
    if (this.finished) return;
    this.finished = true;
    this.physics.pause();
    const cinders =
      outcome === "clear" ? this.stage.cindersClear : this.stage.cindersFail;
    this.onBridge({
      type: "stage_result",
      outcome,
      cinders,
      elapsedSec: Math.floor(this.elapsed),
      killed: this.killed,
      level: this.level,
      onClearEventId:
        outcome === "clear" ? this.stage.onClearEventId : undefined,
      onFailEventId:
        outcome === "fail" ? this.stage.onFailEventId : undefined,
    });
  }

  private emitHud() {
    this.onBridge({
      type: "hud",
      hp: Math.max(0, this.hp),
      maxHp: this.maxHp,
      level: this.level,
      xp: this.xp,
      xpToLevel: this.xpToLevel,
      elapsedSec: Math.floor(this.elapsed),
      durationSec: this.duration,
      stripTier: this.stripTier,
      filthMs: Math.max(0, this.filthUntil - this.time.now),
      killed: this.killed,
      paused: this.pausedLogic || this.awaitingLoot,
    });
  }

  getApi(): EmberGameApi {
    return {
      ready: Promise.resolve(),
      lockLook: () => undefined,
      pause: () => this.pauseLogic(),
      resume: () => this.resumeLogic(),
      applyLoot: (itemId: string) => this.applyLoot(itemId),
      buyShopItem: () => undefined,
      sellShopItem: () => undefined,
      closeShop: () => undefined,
      toggleInventory: () => undefined,
      closeInventory: () => undefined,
      equipItem: () => undefined,
      unequipSlot: () => undefined,
      useItem: () => undefined,
      advanceDialogue: () => undefined,
      captureExploreSave: () => null,
      applyExploreSave: () => false,
      destroy: () => {
        this.game.destroy(true);
      },
    };
  }
}
