import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  EMBER_DYNAMIC_ACTOR_LAYER,
  beginPointShadowBake,
  beginStaticPointShadowBake,
  cachePointLightShadows,
  configureCachedSunShadow,
  DIR_SHADOW_DEPTH_BIAS,
  DIR_SHADOW_NORMAL_BIAS,
  DIR_SHADOW_SNAP_MIN,
  directionalShadowHalfExtent,
  directionalShadowLightDistance,
  fitDirectionalShadowToFocus,
  invalidatePointLightShadows,
  mapWideDirectionalHalf,
  pickDynamicPointShadowLights,
  pickDynamicPointShadowLightsFrom,
  pickPointShadowSlotLights,
  pointLightAffectsPoint,
  setObjectRenderLayer,
  snapShadowFocusToTexel,
  snapStickyGroundLookDir,
} from "./dynamicShadowPolicy";

describe("dynamic shadow policy", () => {
  it("puts an actor hierarchy on the dynamic render layer", () => {
    const root = new THREE.Group();
    const child = new THREE.Mesh(new THREE.PlaneGeometry(1, 1));
    root.add(child);

    setObjectRenderLayer(root, EMBER_DYNAMIC_ACTOR_LAYER);

    expect(root.layers.isEnabled(EMBER_DYNAMIC_ACTOR_LAYER)).toBe(true);
    expect(root.layers.isEnabled(0)).toBe(false);
    expect(child.layers.isEnabled(EMBER_DYNAMIC_ACTOR_LAYER)).toBe(true);
    expect(child.layers.isEnabled(0)).toBe(false);
  });

  it("caches only point-light shadows and can invalidate them", () => {
    const root = new THREE.Group();
    const point = new THREE.PointLight();
    point.castShadow = true;
    const directional = new THREE.DirectionalLight();
    directional.castShadow = true;
    root.add(point, directional);

    expect(cachePointLightShadows(root)).toBe(1);
    expect(point.shadow.autoUpdate).toBe(false);
    expect(point.shadow.needsUpdate).toBe(true);
    expect(directional.shadow.autoUpdate).toBe(true);

    point.shadow.needsUpdate = false;
    expect(invalidatePointLightShadows(root)).toBe(1);
    expect(point.shadow.needsUpdate).toBe(true);
  });

  it("bakes beyond torch flicker reach and restores the live cutoff", () => {
    const root = new THREE.Group();
    const light = new THREE.PointLight(0xffffff, 4, 92);
    light.castShadow = true;
    light.userData.emberLamp = { distance: 100 };
    root.add(light);

    const bake = beginStaticPointShadowBake(root);
    expect(bake.count).toBe(1);
    expect(light.distance).toBe(150);
    expect(light.shadow.camera.far).toBe(150);
    expect(light.shadow.needsUpdate).toBe(true);

    bake.restore();
    expect(light.distance).toBe(92);
    // The cached depth texture and its decode range must continue to agree.
    expect(light.shadow.camera.far).toBe(150);
  });

  it("covers the authored map with one cached sun volume", () => {
    expect(mapWideDirectionalHalf(400)).toBeGreaterThan(200);
    expect(directionalShadowLightDistance(mapWideDirectionalHalf(400))).toBeGreaterThan(
      80,
    );
    expect(directionalShadowHalfExtent(120)).toBe(90);
  });

  it("snaps sub-texel motion so the directional projection stays stable", () => {
    const sun = new THREE.Vector3(0.5, 0.8, 0.3).normalize();
    const focus = new THREE.Vector3(10, 4, 20);
    const half = 64;
    const mapSize = 1024;
    const texel = (half * 2) / mapSize;
    const lateral = new THREE.Vector3().crossVectors(
      sun,
      new THREE.Vector3(0, 1, 0),
    );
    lateral.normalize();

    const snapped = snapShadowFocusToTexel(focus, sun, half, mapSize);
    const sameCell = snapShadowFocusToTexel(
      snapped.clone().addScaledVector(lateral, texel * 0.25),
      sun,
      half,
      mapSize,
    );
    expect(snapped.distanceTo(sameCell)).toBeLessThan(1e-6);

    const nextCell = snapShadowFocusToTexel(
      snapped.clone().addScaledVector(lateral, texel * 1.1),
      sun,
      half,
      mapSize,
    );
    expect(nextCell.distanceTo(snapped)).toBeGreaterThan(texel * 0.9);
  });

  it("fits a tight directional volume to the player without changing sun direction", () => {
    const root = new THREE.Group();
    const light = new THREE.DirectionalLight();
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    root.add(light, light.target);

    const sun = new THREE.Vector3(0.4, 0.85, 0.35).normalize();
    const focus = new THREE.Vector3(40, 6, -12);
    const half = 72;
    const dist = directionalShadowLightDistance(half);

    expect(
      fitDirectionalShadowToFocus(light, focus, sun, {
        halfExtent: half,
        lightDistance: dist,
        mapSize: 1024,
      }),
    ).toBe(true);

    const fromTarget = light.position
      .clone()
      .sub(light.target.position)
      .normalize();
    expect(fromTarget.dot(sun)).toBeGreaterThan(0.999);
    expect(light.shadow.camera.right).toBe(half);
    expect(light.shadow.camera.left).toBe(-half);
    expect(
      light.position.distanceTo(light.target.position),
    ).toBeCloseTo(dist);

    expect(
      fitDirectionalShadowToFocus(light, focus, sun, {
        halfExtent: half,
        lightDistance: dist,
        mapSize: 1024,
      }),
    ).toBe(false);
  });

  it("shifts the directional volume forward along the camera look", () => {
    const root = new THREE.Group();
    const light = new THREE.DirectionalLight();
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    root.add(light, light.target);

    const sun = new THREE.Vector3(0, 1, 0);
    const focus = new THREE.Vector3(0, 6, 0);
    const look = new THREE.Vector3(0.2, -0.5, 1);
    const half = 100;
    fitDirectionalShadowToFocus(light, focus, sun, {
      halfExtent: half,
      lightDistance: directionalShadowLightDistance(half),
      mapSize: 1024,
      lookDir: look,
      forwardBias: 0.6,
    });

    expect(light.target.position.z).toBeGreaterThan(40);
    expect(Math.abs(light.target.position.x)).toBeLessThan(25);
    const fromTarget = light.position
      .clone()
      .sub(light.target.position)
      .normalize();
    expect(fromTarget.dot(sun)).toBeGreaterThan(0.999);
  });

  it("picks only the nearest in-range shadowed lamp for actor cubes", () => {
    const root = new THREE.Group();
    const near = new THREE.PointLight(0xffffff, 1, 80);
    near.castShadow = true;
    near.position.set(12, 4, 0);
    near.userData.emberLamp = { distance: 80 };
    const closer = new THREE.PointLight(0xffffff, 1, 80);
    closer.castShadow = true;
    closer.position.set(6, 4, 0);
    closer.userData.emberLamp = { distance: 80 };
    const far = new THREE.PointLight(0xffffff, 1, 80);
    far.castShadow = true;
    far.position.set(400, 4, 0);
    far.userData.emberLamp = { distance: 80 };
    const unshadowed = new THREE.PointLight(0xffffff, 1, 80);
    unshadowed.position.set(3, 4, 0);
    root.add(near, closer, far, unshadowed);
    root.updateMatrixWorld(true);

    expect(
      pickDynamicPointShadowLights(root, new THREE.Vector3(0, 4, 0), 1),
    ).toEqual([closer]);
    expect(
      pickDynamicPointShadowLights(root, new THREE.Vector3(0, 4, 0), 2),
    ).toEqual([closer, near]);
  });

  it("uses ground proximity for actors below elevated local lights", () => {
    const streetLamp = new THREE.PointLight(0xffffff, 1, 64);
    streetLamp.castShadow = true;
    streetLamp.position.set(0, 28, 48);
    streetLamp.userData.emberLamp = { distance: 64 };

    expect(
      pickDynamicPointShadowLightsFrom(
        [streetLamp],
        new THREE.Vector3(0, 6, 0),
        { enterScale: 0.8 },
      ),
    ).toEqual([streetLamp]);
  });

  it("prioritizes a light that physically reaches the player", () => {
    const affecting = new THREE.PointLight(0xffffff, 1, 40);
    affecting.castShadow = true;
    affecting.position.set(30, 0, 0);
    affecting.userData.emberLamp = { distance: 40 };
    const groundOnly = new THREE.PointLight(0xffffff, 1, 40);
    groundOnly.castShadow = true;
    groundOnly.position.set(5, 50, 0);
    groundOnly.userData.emberLamp = { distance: 40 };
    const focus = new THREE.Vector3();

    expect(pointLightAffectsPoint(affecting, focus)).toBe(true);
    expect(pointLightAffectsPoint(groundOnly, focus)).toBe(false);
    expect(
      pickDynamicPointShadowLightsFrom([groundOnly, affecting], focus, {
        maxLights: 1,
      }),
    ).toEqual([affecting]);
  });

  it("falls back to the nearest visible light volume", () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
    camera.position.set(0, 20, 0);
    camera.lookAt(0, 20, -1);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    const visible = new THREE.PointLight(0xffffff, 1, 20);
    visible.castShadow = true;
    visible.position.set(0, 20, -100);
    visible.userData.emberLamp = { distance: 20 };

    expect(
      pickDynamicPointShadowLightsFrom(
        [visible],
        new THREE.Vector3(0, 0, 0),
        { camera },
      ),
    ).toEqual([visible]);
  });

  it("lets a budgeted-out requested light become dynamic", () => {
    const light = new THREE.PointLight(0xffffff, 1, 64);
    light.castShadow = false;
    light.userData.emberShadowRequested = true;
    light.userData.emberEmissive = { baseDistance: 64 };

    expect(
      pickDynamicPointShadowLightsFrom(
        [light],
        new THREE.Vector3(12, 0, 0),
      ),
    ).toEqual([light]);
  });

  it("moves limited cube slots to nearby lights and reserves dynamic slots", () => {
    const near = new THREE.PointLight(0xffffff, 1, 64);
    near.position.set(10, 0, 0);
    near.userData.emberShadowRequested = true;
    near.userData.emberEmissive = { baseDistance: 64 };
    const middle = new THREE.PointLight(0xffffff, 1, 64);
    middle.castShadow = true;
    middle.position.set(80, 0, 0);
    middle.userData.emberShadowRequested = true;
    middle.userData.emberEmissive = { baseDistance: 64 };
    const far = new THREE.PointLight(0xffffff, 1, 64);
    far.castShadow = true;
    far.position.set(160, 0, 0);
    far.userData.emberShadowRequested = true;
    far.userData.emberEmissive = { baseDistance: 64 };

    expect(
      pickPointShadowSlotLights(
        [near, middle, far],
        new THREE.Vector3(),
        [near],
        2,
      ),
    ).toEqual([near, middle]);
    expect(
      pickPointShadowSlotLights(
        [near, middle, far],
        new THREE.Vector3(160, 0, 0),
        [],
        2,
      ),
    ).toEqual([far, middle]);
  });

  it("uses separate enter and exit radii to retain a dynamic lamp", () => {
    const light = new THREE.PointLight(0xffffff, 1, 100);
    light.castShadow = true;
    light.userData.emberLamp = { distance: 100 };

    const edgeFocus = new THREE.Vector3(90, 0, 0);
    expect(
      pickDynamicPointShadowLightsFrom([light], edgeFocus, {
        enterScale: 0.8,
        exitScale: 1,
      }),
    ).toEqual([]);
    expect(
      pickDynamicPointShadowLightsFrom([light], edgeFocus, {
        previous: [light],
        enterScale: 0.8,
        exitScale: 1,
      }),
    ).toEqual([light]);
    expect(
      pickDynamicPointShadowLightsFrom(
        [light],
        new THREE.Vector3(101, 0, 0),
        {
          previous: [light],
          enterScale: 0.8,
          exitScale: 1,
        },
      ),
    ).toEqual([]);
  });

  it("lets a visible actor nominate a second on-screen lamp", () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
    camera.position.set(0, 0, 0);
    camera.lookAt(0, 0, -1);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);

    const playerLamp = new THREE.PointLight(0xffffff, 1, 40);
    playerLamp.castShadow = true;
    playerLamp.position.set(-10, 0, -20);
    playerLamp.userData.emberLamp = { distance: 40 };
    const actorLamp = new THREE.PointLight(0xffffff, 1, 30);
    actorLamp.castShadow = true;
    actorLamp.position.set(10, 0, -30);
    actorLamp.userData.emberLamp = { distance: 30 };
    const offscreenLamp = new THREE.PointLight(0xffffff, 1, 10);
    offscreenLamp.castShadow = true;
    offscreenLamp.position.set(0, 0, 100);
    offscreenLamp.userData.emberLamp = { distance: 10 };

    const selected = pickDynamicPointShadowLightsFrom(
      [playerLamp, actorLamp, offscreenLamp],
      new THREE.Vector3(-10, 0, -20),
      {
        maxLights: 2,
        actorFocuses: [new THREE.Vector3(10, 0, -30)],
        camera,
      },
    );
    expect(selected).toContain(playerLamp);
    expect(selected).toContain(actorLamp);
    expect(selected).not.toContain(offscreenLamp);
  });

  it("can bake a subset of point lights without touching the others", () => {
    const root = new THREE.Group();
    const a = new THREE.PointLight(0xffffff, 4, 92);
    a.castShadow = true;
    a.userData.emberLamp = { distance: 100 };
    const b = new THREE.PointLight(0xffffff, 4, 40);
    b.castShadow = true;
    b.userData.emberLamp = { distance: 40 };
    root.add(a, b);

    const bake = beginPointShadowBake([a]);
    expect(bake.count).toBe(1);
    expect(a.distance).toBe(150);
    expect(b.distance).toBe(40);
    bake.restore();
    expect(a.distance).toBe(92);
    expect(b.distance).toBe(40);
  });

  it("snaps the shadow volume to voxel size even when the map is finer", () => {
    const sun = new THREE.Vector3(0, 1, 0);
    const focus = new THREE.Vector3(10, 4, 20);
    const snapped = snapShadowFocusToTexel(
      focus,
      sun,
      64,
      256,
      new THREE.Vector3(),
      4,
    );
    const sameCell = snapShadowFocusToTexel(
      snapped.clone().add(new THREE.Vector3(1, 0, 0)),
      sun,
      64,
      256,
      new THREE.Vector3(),
      4,
    );
    expect(snapped.distanceTo(sameCell)).toBeLessThan(1e-6);
  });

  it("caches the key sun shadow without extra cascade lights", () => {
    const root = new THREE.Group();
    const key = new THREE.DirectionalLight(0xffe0c0, 2);
    key.castShadow = true;
    root.add(key, key.target);
    const childCount = root.children.length;
    configureCachedSunShadow(key, 256);
    expect(key.intensity).toBe(2);
    expect(key.shadow.autoUpdate).toBe(false);
    expect(key.shadow.mapSize.x).toBe(256);
    expect(key.shadow.normalBias).toBe(DIR_SHADOW_NORMAL_BIAS);
    expect(key.shadow.bias).toBeCloseTo(DIR_SHADOW_DEPTH_BIAS);
    expect(root.children.length).toBe(childCount);
  });

  it("keeps the follow volume still across several voxels of motion", () => {
    const sun = new THREE.Vector3(0, 1, 0);
    const a = snapShadowFocusToTexel(
      new THREE.Vector3(10, 4, 20),
      sun,
      90,
      256,
      new THREE.Vector3(),
      1,
      DIR_SHADOW_SNAP_MIN,
    );
    const nearby = snapShadowFocusToTexel(
      new THREE.Vector3(10 + 8, 4, 20),
      sun,
      90,
      256,
      new THREE.Vector3(),
      1,
      DIR_SHADOW_SNAP_MIN,
    );
    expect(a.distanceTo(nearby)).toBeLessThan(1e-6);
    const next = snapShadowFocusToTexel(
      new THREE.Vector3(10 + DIR_SHADOW_SNAP_MIN + 4, 4, 20),
      sun,
      90,
      256,
      new THREE.Vector3(),
      1,
      DIR_SHADOW_SNAP_MIN,
    );
    expect(next.distanceTo(a)).toBeGreaterThan(8);
  });

  it("sticks camera look until heading crosses a yaw step", () => {
    const state = { yaw: null as number | null };
    const out = new THREE.Vector3();
    snapStickyGroundLookDir(new THREE.Vector3(0, -0.4, 1), state, out);
    const first = out.clone();
    snapStickyGroundLookDir(new THREE.Vector3(0.08, -0.4, 1), state, out);
    expect(out.distanceTo(first)).toBeLessThan(1e-6);
    snapStickyGroundLookDir(new THREE.Vector3(1, -0.4, 0), state, out);
    expect(out.x).toBeGreaterThan(0.9);
    expect(state.yaw).not.toBeNull();
  });
});
