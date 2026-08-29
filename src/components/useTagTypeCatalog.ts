import { useCallback, useEffect, useState } from "react";
import { hydrateGelbooruNativeTypes } from "../lib/media";
import {
  loadGelbooruNativeMap,
  loadTagTypeMap,
  type GelbooruNativeMap,
  type TagTypeMap,
} from "../lib/tagTypes";

/**
 * User type map + Gelbooru native groups, refreshed after site hydration.
 * State is always a shallow copy of the in-memory cache so setTagType
 * mutations re-render (React ignores setState with the same object).
 */
export function useTagTypeCatalog(tagsToHydrate: readonly string[]): {
  typeMap: TagTypeMap;
  nativeMap: GelbooruNativeMap;
  setTypeMap: (next: TagTypeMap) => void;
  refresh: () => void;
} {
  const [typeMap, setTypeMapState] = useState<TagTypeMap>(() => ({
    ...loadTagTypeMap(),
  }));
  const [nativeMap, setNativeMapState] = useState<GelbooruNativeMap>(() => ({
    ...loadGelbooruNativeMap(),
  }));

  const setTypeMap = useCallback((next: TagTypeMap) => {
    setTypeMapState({ ...next });
  }, []);

  const refresh = useCallback(() => {
    setTypeMapState({ ...loadTagTypeMap() });
    setNativeMapState({ ...loadGelbooruNativeMap() });
  }, []);

  const hydrateKey = tagsToHydrate.join("\0");
  useEffect(() => {
    if (!hydrateKey) return;
    let cancelled = false;
    const tags = hydrateKey.split("\0").slice(0, 120);
    const timer = window.setTimeout(() => {
      void hydrateGelbooruNativeTypes(tags, { autocompleteFallback: false }).then(
        (changed) => {
          if (!cancelled && changed) refresh();
        },
      );
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [hydrateKey, refresh]);

  return { typeMap, nativeMap, setTypeMap, refresh };
}
