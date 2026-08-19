import type { EmberPack, ValidationIssue } from "./types";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function pushError(
  issues: ValidationIssue[],
  path: string,
  message: string,
): void {
  issues.push({ level: "error", path, message });
}

function validateOptionalString(
  issues: ValidationIssue[],
  path: string,
  value: unknown,
): void {
  if (value != null && typeof value !== "string") {
    pushError(issues, path, "Ожидалась строка");
  }
}

function validateOptionalNumber(
  issues: ValidationIssue[],
  path: string,
  value: unknown,
  opts?: { min?: number; max?: number },
): void {
  if (value == null) return;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    pushError(issues, path, "Ожидалось число");
    return;
  }
  if (opts?.min != null && value < opts.min) {
    pushError(issues, path, `Число должно быть >= ${opts.min}`);
  }
  if (opts?.max != null && value > opts.max) {
    pushError(issues, path, `Число должно быть <= ${opts.max}`);
  }
}

function validateBooleanOrObject(
  issues: ValidationIssue[],
  path: string,
  value: unknown,
): value is boolean | Record<string, unknown> | undefined {
  if (value == null) return true;
  if (typeof value === "boolean" || isPlainObject(value)) return true;
  pushError(issues, path, "Ожидался boolean или object");
  return false;
}

function validateTileSemantics(
  issues: ValidationIssue[],
  base: string,
  tile: Record<string, unknown>,
): void {
  if (tile.transparent != null && typeof tile.transparent !== "boolean") {
    pushError(issues, `${base}.transparent`, "Ожидался boolean");
  }
  validateOptionalNumber(issues, `${base}.opacity`, tile.opacity, {
    min: 0,
    max: 1,
  });
  if (tile.waterReflectMult != null) {
    const m = tile.waterReflectMult;
    if (typeof m !== "number" || ![1, 2, 4, 8].includes(m)) {
      pushError(
        issues,
        `${base}.waterReflectMult`,
        "Ожидалось 1, 2, 4 или 8",
      );
    }
  }
  if (tile.waterStripeAxis != null) {
    const a = tile.waterStripeAxis;
    if (a !== "x" && a !== "z") {
      pushError(
        issues,
        `${base}.waterStripeAxis`,
        "Ожидалось «x» или «z»",
      );
    }
  }
  validateOptionalNumber(
    issues,
    `${base}.waterGlintBright`,
    tile.waterGlintBright,
    { min: 0, max: 2 },
  );
  validateOptionalNumber(
    issues,
    `${base}.waterWarpStrength`,
    tile.waterWarpStrength,
    { min: 0, max: 3 },
  );
  validateOptionalNumber(
    issues,
    `${base}.waterWarpSpeed`,
    tile.waterWarpSpeed,
    { min: 0, max: 3 },
  );

  if (validateBooleanOrObject(issues, `${base}.slow`, tile.slow)) {
    if (isPlainObject(tile.slow)) {
      validateOptionalNumber(
        issues,
        `${base}.slow.multiplier`,
        tile.slow.multiplier,
        { min: 0.05, max: 1 },
      );
    }
  }

  if (validateBooleanOrObject(issues, `${base}.stain`, tile.stain)) {
    if (isPlainObject(tile.stain)) {
      if (tile.stain.kind != null && tile.stain.kind !== "filth") {
        pushError(issues, `${base}.stain.kind`, "Поддерживается только filth");
      }
      validateOptionalNumber(
        issues,
        `${base}.stain.durationMs`,
        tile.stain.durationMs,
        { min: 1 },
      );
    }
  }

  if (validateBooleanOrObject(issues, `${base}.hazard`, tile.hazard)) {
    if (isPlainObject(tile.hazard)) {
      validateOptionalNumber(
        issues,
        `${base}.hazard.damage`,
        tile.hazard.damage,
        { min: 0 },
      );
      validateOptionalNumber(
        issues,
        `${base}.hazard.stripDamage`,
        tile.hazard.stripDamage,
        { min: 0 },
      );
      validateOptionalNumber(
        issues,
        `${base}.hazard.intervalMs`,
        tile.hazard.intervalMs,
        { min: 1 },
      );
    }
  }

  if (validateBooleanOrObject(issues, `${base}.portal`, tile.portal)) {
    if (isPlainObject(tile.portal)) {
      validateOptionalString(
        issues,
        `${base}.portal.targetMapId`,
        tile.portal.targetMapId,
      );
      validateOptionalString(
        issues,
        `${base}.portal.targetRegionId`,
        tile.portal.targetRegionId,
      );
      validateOptionalNumber(
        issues,
        `${base}.portal.targetX`,
        tile.portal.targetX,
      );
      validateOptionalNumber(
        issues,
        `${base}.portal.targetY`,
        tile.portal.targetY,
      );
      validateOptionalNumber(
        issues,
        `${base}.portal.cooldownMs`,
        tile.portal.cooldownMs,
        { min: 1 },
      );
    }
  }

  if (validateBooleanOrObject(issues, `${base}.trigger`, tile.trigger)) {
    if (isPlainObject(tile.trigger)) {
      validateOptionalString(
        issues,
        `${base}.trigger.eventId`,
        tile.trigger.eventId,
      );
      validateOptionalString(
        issues,
        `${base}.trigger.scriptId`,
        tile.trigger.scriptId,
      );
      validateOptionalString(
        issues,
        `${base}.trigger.note`,
        tile.trigger.note,
      );
      if (
        tile.trigger.once != null &&
        typeof tile.trigger.once !== "boolean"
      ) {
        pushError(issues, `${base}.trigger.once`, "Ожидался boolean");
      }
    }
  }
}

export function validatePack(pack: EmberPack): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const stageId = pack.meta.defaultStageId;
  if (!pack.stages[stageId]) {
    issues.push({
      level: "error",
      path: "pack.defaultStageId",
      message: `Стадия «${stageId}» не найдена`,
    });
  }

  for (const tileset of Object.values(pack.tilesets)) {
    for (const tile of tileset.tiles) {
      validateTileSemantics(
        issues,
        `tilesets/${tileset.id}.tiles.${tile.id}`,
        tile as Record<string, unknown>,
      );
    }
  }

  for (const stage of Object.values(pack.stages)) {
    const base = `stages/${stage.id}`;
    if (!pack.maps[stage.mapId]) {
      issues.push({
        level: "error",
        path: `${base}.mapId`,
        message: `Карта «${stage.mapId}» отсутствует`,
      });
    }
    if (!pack.spawns[stage.spawnTableId]) {
      issues.push({
        level: "error",
        path: `${base}.spawnTableId`,
        message: `Спавн «${stage.spawnTableId}» отсутствует`,
      });
    }
    if (!pack.pools[stage.weaponPoolId]) {
      issues.push({
        level: "error",
        path: `${base}.weaponPoolId`,
        message: `Пул «${stage.weaponPoolId}» отсутствует`,
      });
    }
    if (!pack.pools[stage.chestPoolId]) {
      issues.push({
        level: "error",
        path: `${base}.chestPoolId`,
        message: `Пул «${stage.chestPoolId}» отсутствует`,
      });
    }
    if (!pack.weapons[stage.starterWeaponId]) {
      issues.push({
        level: "error",
        path: `${base}.starterWeaponId`,
        message: `Оружие «${stage.starterWeaponId}» отсутствует`,
      });
    }
    if (stage.onClearEventId && !pack.events[stage.onClearEventId]) {
      issues.push({
        level: "error",
        path: `${base}.onClearEventId`,
        message: `Ивент «${stage.onClearEventId}» отсутствует`,
      });
    }
    if (stage.onFailEventId && !pack.events[stage.onFailEventId]) {
      issues.push({
        level: "error",
        path: `${base}.onFailEventId`,
        message: `Ивент «${stage.onFailEventId}» отсутствует`,
      });
    }
  }

  for (const map of Object.values(pack.maps)) {
    const mapBase = `maps/${map.id}`;
    if (!pack.tilesets[map.tilesetId]) {
      issues.push({
        level: "error",
        path: `maps/${map.id}.tilesetId`,
        message: `Тайлсет «${map.tilesetId}» отсутствует`,
      });
    }
    const missingVoxelPlacements = new Map<string, string[]>();
    for (const placement of map.voxelProps ?? []) {
      if (pack.voxelModels[placement.modelId]) continue;
      const ids = missingVoxelPlacements.get(placement.modelId) ?? [];
      ids.push(placement.id);
      missingVoxelPlacements.set(placement.modelId, ids);
    }
    for (const [modelId, placementIds] of missingVoxelPlacements) {
      issues.push({
        level: "error",
        path: `${mapBase}.voxelProps.modelId=${modelId}`,
        message: `Воксельная модель «${modelId}» отсутствует — скрыто размещений: ${placementIds.length}`,
      });
    }
    const expected = map.width * map.height;
    for (const layer of map.layers) {
      if (layer.data.length !== expected) {
        issues.push({
          level: "error",
          path: `maps/${map.id}.layers.${layer.name}`,
          message: `Размер слоя ${layer.data.length}, ожидалось ${expected}`,
        });
      }
    }
    if (!map.regions.some((r) => r.kind === "player_start")) {
      issues.push({
        level: "error",
        path: `maps/${map.id}.regions`,
        message: "Нет region player_start",
      });
    }
    for (const r of map.regions) {
      if (r.closedModelId && !pack.voxelModels[r.closedModelId]) {
        issues.push({
          level: "error",
          path: `${mapBase}.regions.${r.id}.closedModelId`,
          message: `Воксельная модель «${r.closedModelId}» отсутствует`,
        });
      }
      if (r.openModelId && !pack.voxelModels[r.openModelId]) {
        issues.push({
          level: "error",
          path: `${mapBase}.regions.${r.id}.openModelId`,
          message: `Воксельная модель «${r.openModelId}» отсутствует`,
        });
      }
      if (r.sceneId && !pack.voxelScenes[r.sceneId]) {
        issues.push({
          level: "error",
          path: `${mapBase}.regions.${r.id}.sceneId`,
          message: `Воксельная сцена «${r.sceneId}» отсутствует`,
        });
      } else if (r.sceneId && r.openClipId) {
        const scene = pack.voxelScenes[r.sceneId];
        if (!(scene?.animations ?? []).some((clip) => clip.id === r.openClipId)) {
          issues.push({
            level: "warn",
            path: `${mapBase}.regions.${r.id}.openClipId`,
            message: `Анимация открытия «${r.openClipId}» отсутствует в сцене «${r.sceneId}»`,
          });
        }
      }
      if (r.modelOutline != null) {
        const o = r.modelOutline;
        const base = `maps/${map.id}.regions.${r.id}.modelOutline`;
        if (typeof o !== "object" || Array.isArray(o)) {
          issues.push({
            level: "error",
            path: base,
            message: "Ожидался объект modelOutline",
          });
        } else {
          if (o.enabled != null && typeof o.enabled !== "boolean") {
            issues.push({
              level: "error",
              path: `${base}.enabled`,
              message: "Ожидался boolean",
            });
          }
          validateOptionalString(issues, `${base}.color`, o.color);
          validateOptionalString(
            issues,
            `${base}.interactColor`,
            o.interactColor,
          );
          validateOptionalNumber(issues, `${base}.pulseSec`, o.pulseSec, {
            min: 0.05,
            max: 30,
          });
        }
      }
      if (r.kind !== "teleport") continue;
      const hasCoords = r.targetX != null && r.targetY != null;
      const hasRegion = Boolean(r.targetRegionId);
      if (!hasCoords && !hasRegion) {
        issues.push({
          level: "error",
          path: `maps/${map.id}.regions.${r.id}`,
          message:
            "teleport нужен targetX/targetY или targetRegionId",
        });
      }
      if (hasRegion && !map.regions.some((o) => o.id === r.targetRegionId)) {
        issues.push({
          level: "error",
          path: `maps/${map.id}.regions.${r.id}.targetRegionId`,
          message: `Регион «${r.targetRegionId}» не найден`,
        });
      }
    }
  }

  for (const spawn of Object.values(pack.spawns)) {
    for (const [i, entry] of spawn.entries.entries()) {
      if (!pack.enemies[entry.enemyId]) {
        issues.push({
          level: "error",
          path: `spawns/${spawn.id}[${i}].enemyId`,
          message: `Враг «${entry.enemyId}» отсутствует`,
        });
      }
    }
  }

  for (const pool of Object.values(pack.pools)) {
    for (const [i, entry] of pool.entries.entries()) {
      if (!pack.weapons[entry.itemId]) {
        issues.push({
          level: "error",
          path: `pools/${pool.id}[${i}].itemId`,
          message: `Предмет «${entry.itemId}» отсутствует`,
        });
      }
    }
  }

  for (const scene of Object.values(pack.scenes)) {
    const ids = new Set(scene.steps.map((s) => s.id));
    if (!ids.has(scene.startStepId)) {
      issues.push({
        level: "error",
        path: `scenes/${scene.id}.startStepId`,
        message: `Старт «${scene.startStepId}» не найден`,
      });
    }
    for (const step of scene.steps) {
      switch (step.type) {
        case "dialogue":
          if (step.next && !ids.has(step.next)) {
            issues.push({
              level: "error",
              path: `scenes/${scene.id}/${step.id}.next`,
              message: `next «${step.next}» не найден`,
            });
          }
          break;
        case "splash":
          if (!pack.arts[step.artId]) {
            issues.push({
              level: "error",
              path: `scenes/${scene.id}/${step.id}.artId`,
              message: `Арт «${step.artId}» отсутствует`,
            });
          }
          if (step.next && !ids.has(step.next)) {
            issues.push({
              level: "error",
              path: `scenes/${scene.id}/${step.id}.next`,
              message: `next «${step.next}» не найден`,
            });
          }
          break;
        case "choice":
          for (const opt of step.options) {
            if (!ids.has(opt.next)) {
              issues.push({
                level: "error",
                path: `scenes/${scene.id}/${step.id}.${opt.id}`,
                message: `next «${opt.next}» не найден`,
              });
            }
          }
          break;
        case "set_flag":
        case "grant_cinders":
          if (step.next && !ids.has(step.next)) {
            issues.push({
              level: "error",
              path: `scenes/${scene.id}/${step.id}.next`,
              message: `next «${step.next}» не найден`,
            });
          }
          break;
        case "end":
          break;
        default: {
          const _never: never = step;
          void _never;
        }
      }
    }
  }

  for (const event of Object.values(pack.events)) {
    if (!pack.scenes[event.sceneId]) {
      issues.push({
        level: "error",
        path: `events/${event.id}.sceneId`,
        message: `Сцена «${event.sceneId}» отсутствует`,
      });
    }
  }

  return issues;
}
