export type EmberWorldLoadSnapshot = {
  terrainSettled: boolean;
  staticPropsSettled: boolean;
  lightsReady: boolean;
  shadowCached: number;
  shadowTotal: number;
  warmupComplete: boolean;
};

export type EmberWorldLoadProgress = {
  ratio: number;
  labelRu: string;
};

export function emberWorldLoadProgress(
  snapshot: EmberWorldLoadSnapshot,
): EmberWorldLoadProgress {
  if (snapshot.warmupComplete) {
    return { ratio: 1, labelRu: "Готово" };
  }
  const terrain = snapshot.terrainSettled ? 1 : 0;
  const props = snapshot.staticPropsSettled ? 1 : 0;
  const lights = snapshot.lightsReady ? 1 : 0;
  const shadowFrac =
    snapshot.shadowTotal <= 0
      ? terrain && props
        ? 1
        : 0
      : Math.min(1, snapshot.shadowCached / snapshot.shadowTotal);
  const ratio =
    terrain * 0.22 + props * 0.28 + lights * 0.12 + shadowFrac * 0.38;
  let labelRu = "Местность…";
  if (!snapshot.terrainSettled) labelRu = "Местность…";
  else if (!snapshot.staticPropsSettled) labelRu = "Объекты…";
  else if (!snapshot.lightsReady || shadowFrac < 1) labelRu = "Свет и тени…";
  else labelRu = "Почти готово…";
  return {
    ratio: Math.max(0.04, Math.min(0.99, ratio)),
    labelRu,
  };
}
