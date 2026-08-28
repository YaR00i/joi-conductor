export type EmberWorldLoadSnapshot = {
  terrainSettled: boolean;
  staticPropsSettled: boolean;
  lightsReady: boolean;
  shadowCached: number;
  shadowTotal: number;
  warmupComplete: boolean;
  /** MeshToon compile after bake; overlay stays up. */
  compiling?: boolean;
  /** 0..1 streaming fraction; overrides boolean settled when set. */
  terrainFrac?: number;
  propsFrac?: number;
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
  if (snapshot.compiling) {
    return { ratio: 0.96, labelRu: "Шейдеры…" };
  }
  const terrain =
    snapshot.terrainFrac ?? (snapshot.terrainSettled ? 1 : 0);
  const props =
    snapshot.propsFrac ?? (snapshot.staticPropsSettled ? 1 : 0);
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
  if (terrain < 1) labelRu = "Местность…";
  else if (props < 1) labelRu = "Объекты…";
  else if (!snapshot.lightsReady || shadowFrac < 1) labelRu = "Свет и тени…";
  else labelRu = "Почти готово…";
  return {
    ratio: Math.max(0.04, Math.min(0.99, ratio)),
    labelRu,
  };
}
