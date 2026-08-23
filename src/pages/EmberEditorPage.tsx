import {
  Component,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import type {
  LibNavigateFocus,
  LibNavigateTab,
} from "../components/ember/editor/ArtsEditorPanel";
import { EmberSavePanel } from "../components/ember/EmberSavePanel";
import {
  clearAllLocalOverrides,
  clearLocalOverride,
  deleteEmberFile,
  listLocalOverrides,
  writeEmberJson,
} from "../game/content/io";
import { createLocalStorageSaveBackend } from "../game/content/emberSave";
import {
  createEmptyScene,
  createEventForScene,
  syncEventStageLinks,
} from "../game/content/sceneFactory";
import {
  loadEmberPack,
  removeMapFromPack,
  upsertEvent,
  upsertMap,
  upsertScene,
  upsertStage,
} from "../game/content/loadPack";
import {
  createBlankEmberMap,
  createStageForMap,
} from "../game/content/mapFactory";
import { validatePack } from "../game/content/validate";
import type {
  EmberDialogueUse,
  EmberMapPlayProfile,
  EmberPack,
  ValidationIssue,
} from "../game/content/types";

const LazyMapEditorPanel = lazy(() =>
  import("../components/ember/editor/MapEditorPanel").then((module) => ({
    default: module.MapEditorPanel,
  })),
);
const LazyTileEditorPanel = lazy(() =>
  import("../components/ember/editor/TileEditorPanel").then((module) => ({
    default: module.TileEditorPanel,
  })),
);
const LazySpriteEditorPanel = lazy(() =>
  import("../components/ember/editor/SpriteEditorPanel").then((module) => ({
    default: module.SpriteEditorPanel,
  })),
);
const LazyVoxelSculptPanel = lazy(() =>
  import("../components/ember/editor/VoxelSculptPanel").then((module) => ({
    default: module.VoxelSculptPanel,
  })),
);
const LazySceneEditorPanel = lazy(() =>
  import("../components/ember/editor/SceneEditorPanel").then((module) => ({
    default: module.SceneEditorPanel,
  })),
);
const LazyArtsEditorPanel = lazy(() =>
  import("../components/ember/editor/ArtsEditorPanel").then((module) => ({
    default: module.ArtsEditorPanel,
  })),
);
const LazyItemsEditorPanel = lazy(() =>
  import("../components/ember/editor/ItemsEditorPanel").then((module) => ({
    default: module.ItemsEditorPanel,
  })),
);
const LazyShopsEditorPanel = lazy(() =>
  import("../components/ember/editor/ShopsEditorPanel").then((module) => ({
    default: module.ShopsEditorPanel,
  })),
);
import type {
  EmberArt,
  EmberEvent,
  EmberSpawnTable,
  EmberStage,
} from "../game/content/types";

type Tab =
  | "maps"
  | "tiles"
  | "sprites"
  | "voxels"
  | "scenes"
  | "library"
  | "items"
  | "shops"
  | "validate";

type EditorToast = {
  id: number;
  text: string;
  kind: "default" | "warn";
};

const TOAST_MS = 2500;
const TOAST_WARN_MS = 4200;

type Props = {
  onBackToPlay: () => void;
  onGrantCinders: (n: number) => void;
};

const NAV_GROUPS: Array<{
  id: string;
  title: string;
  items: Array<{ id: Tab; label: string; hint: string }>;
}> = [
  {
    id: "world",
    title: "Мир",
    items: [
      {
        id: "maps",
        label: "Карты",
        hint: "Тайлы, кисти, стадии, спавны, regions",
      },
    ],
  },
  {
    id: "narrative",
    title: "Нарратив",
    items: [
      { id: "scenes", label: "Сцены", hint: "Диалоги, splash, триггеры" },
    ],
  },
  {
    id: "tiles",
    title: "Редактор тайлов",
    items: [
      {
        id: "tiles",
        label: "Редактор тайлов",
        hint: "Пиксели и палитра текстур",
      },
    ],
  },
  {
    id: "sprites",
    title: "Редактор спрайтов",
    items: [
      {
        id: "sprites",
        label: "Редактор спрайтов",
        hint: "Декор, герои, монстры",
      },
    ],
  },
  {
    id: "voxels",
    title: "Редактор вокселей",
    items: [
      {
        id: "voxels",
        label: "Редактор вокселей",
        hint: "3D скульптор блоков по вокселям",
      },
    ],
  },
  {
    id: "library",
    title: "Библиотека",
    items: [
      {
        id: "library",
        label: "Библиотека",
        hint: "Арты, тайлы, спрайты, портреты",
      },
    ],
  },
  {
    id: "items",
    title: "Предметы",
    items: [
      {
        id: "items",
        label: "Предметы",
        hint: "Каталог, иконки, лут сундуков",
      },
    ],
  },
  {
    id: "shops",
    title: "Магазины",
    items: [
      {
        id: "shops",
        label: "Магазины",
        hint: "Ассортимент, цены, сток",
      },
    ],
  },
  {
    id: "system",
    title: "Система",
    items: [{ id: "validate", label: "Validate", hint: "Проверка пака" }],
  },
];

function tabMeta(tab: Tab): { group: string; label: string } {
  for (const group of NAV_GROUPS) {
    const item = group.items.find((i) => i.id === tab);
    if (item) return { group: group.title, label: item.label };
  }
  return { group: "", label: tab };
}

function EditorPanelFallback({ tab }: { tab: Tab }) {
  return (
    <div className="ember-ed-card" aria-busy="true" aria-live="polite">
      <p className="muted">Загрузка: {tabMeta(tab).label}…</p>
    </div>
  );
}

class EditorPanelBoundary extends Component<
  { children: ReactNode; tab: Tab },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Ember editor tab failed to load", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="ember-ed-card ember-validate ember-validate--error">
        <h3 className="ember-ed-card__title">
          Не удалось загрузить: {tabMeta(this.props.tab).label}
        </h3>
        <p>{this.state.error.message}</p>
        <button type="button" onClick={() => window.location.reload()}>
          Перезапустить редактор
        </button>
      </div>
    );
  }
}

export function EmberEditorPage({ onBackToPlay, onGrantCinders }: Props) {
  const [pack, setPack] = useState<EmberPack | null>(null);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [tab, setTab] = useState<Tab>("maps");
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [toasts, setToasts] = useState<EditorToast[]>([]);
  const [error, setError] = useState<string | null>(null);
  const toastIdRef = useRef(0);
  const toastTimersRef = useRef<Map<number, number>>(new Map());
  const toastsRef = useRef<EditorToast[]>([]);
  const [overrides, setOverrides] = useState<string[]>([]);
  const [sceneId, setSceneId] = useState<string | null>(null);
  const [activeTilesetId, setActiveTilesetId] = useState<string | null>(null);
  const [activeMapId, setActiveMapId] = useState<string | null>(null);
  const [spriteFocusId, setSpriteFocusId] = useState<string | null>(null);
  const [tileFocusId, setTileFocusId] = useState<number | null>(null);
  const [voxelFocusId, setVoxelFocusId] = useState<string | null>(null);
  const [createMapOpen, setCreateMapOpen] = useState(false);
  const [createMapName, setCreateMapName] = useState("Новая карта");
  const [createMapW, setCreateMapW] = useState(24);
  const [createMapH, setCreateMapH] = useState(24);
  const [createMapTilesetId, setCreateMapTilesetId] = useState("");
  const [createMapProfile, setCreateMapProfile] =
    useState<EmberMapPlayProfile>("explore");
  const menubarRef = useRef<HTMLElement>(null);
  const saveBackend = useMemo(() => createLocalStorageSaveBackend(), []);
  const prevToastFlagsRef = useRef({ bak: false, vox: 0, ov: 0 });

  const setStatus = useCallback(
    (text: string, kind: "default" | "warn" = "default") => {
      const warn = kind === "warn" || /ошибк|override|\.bak/i.test(text);
      const ms = warn ? TOAST_WARN_MS : TOAST_MS;
      const existing = toastsRef.current.find((t) => t.text === text);
      const id = existing?.id ?? ++toastIdRef.current;
      const prevTimer = toastTimersRef.current.get(id);
      if (prevTimer !== undefined) window.clearTimeout(prevTimer);
      const timer = window.setTimeout(() => {
        toastsRef.current = toastsRef.current.filter((t) => t.id !== id);
        setToasts(toastsRef.current);
        toastTimersRef.current.delete(id);
      }, ms);
      toastTimersRef.current.set(id, timer);
      if (existing) return;
      const toastKind: EditorToast["kind"] = warn ? "warn" : "default";
      const next: EditorToast[] = [
        { id, text, kind: toastKind },
        ...toastsRef.current,
      ].slice(0, 4);
      toastsRef.current = next;
      setToasts(next);
    },
    [],
  );

  useEffect(
    () => () => {
      for (const timer of toastTimersRef.current.values()) {
        window.clearTimeout(timer);
      }
      toastTimersRef.current.clear();
    },
    [],
  );

  const reload = useCallback(async () => {
    setError(null);
    try {
      const { pack: p, issues: iss } = await loadEmberPack();
      setPack(p);
      setIssues(iss);
      setOverrides(listLocalOverrides());
      setSceneId((prev) => {
        if (prev && p.scenes[prev]) return prev;
        return Object.keys(p.scenes)[0] ?? null;
      });
      setActiveMapId((prev) => {
        if (prev && p.maps[prev]) return prev;
        const fromStage = p.stages[p.meta.defaultStageId]?.mapId;
        if (fromStage && p.maps[fromStage]) return fromStage;
        return Object.keys(p.maps)[0] ?? null;
      });
      setActiveTilesetId((prev) => {
        if (prev && p.tilesets[prev]) return prev;
        return Object.keys(p.tilesets)[0] ?? null;
      });
      setStatus("Пак загружен");
    } catch (err) {
      setError(err instanceof Error ? err.message : "load failed");
    }
  }, [setStatus]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const createScene = useCallback(async (use?: EmberDialogueUse) => {
    if (!pack) return;
    const speaker = Object.keys(pack.portraits)[0] ?? "hu_tao";
    const scene = createEmptyScene({
      speaker,
      use,
      defaultBgArtId:
        use === "talk" || use === "shop_intro"
          ? undefined
          : Object.values(pack.scenes)[0]?.defaultBgArtId,
    });
    const event = createEventForScene(scene, "manual");
    let next = upsertScene(pack, scene);
    next = upsertEvent(next, event);
    setPack(next);
    setIssues(validatePack(next));
    setSceneId(scene.id);
    const sceneRes = await writeEmberJson(`scenes/${scene.id}.json`, scene);
    const evRes = await writeEmberJson(`events/${event.id}.json`, event);
    setOverrides(listLocalOverrides());
    if (sceneRes.ok && evRes.ok) {
      setStatus(`Сцена «${scene.nameRu}» создана`);
    } else {
      setStatus(
        `Сцена: ${sceneRes.ok ? "ok" : "error" in sceneRes ? sceneRes.error : "?"} · ивент: ${evRes.ok ? "ok" : "error" in evRes ? evRes.error : "?"}`,
      );
    }
  }, [pack]);

  const openCreateMap = useCallback(() => {
    if (!pack) return;
    const current =
      (activeMapId && pack.maps[activeMapId]) ||
      Object.values(pack.maps)[0] ||
      null;
    setCreateMapName("Новая карта");
    setCreateMapW(current?.width ? Math.min(48, current.width) : 24);
    setCreateMapH(current?.height ? Math.min(48, current.height) : 24);
    setCreateMapTilesetId(
      current?.tilesetId && pack.tilesets[current.tilesetId]
        ? current.tilesetId
        : Object.keys(pack.tilesets)[0] ?? "",
    );
    setCreateMapProfile(
      current?.playProfile === "explore" ? "explore" : "arena",
    );
    setOpenMenu(null);
    setCreateMapOpen(true);
  }, [pack, activeMapId]);

  const createMap = useCallback(async () => {
    if (!pack) return;
    const tileset =
      pack.tilesets[createMapTilesetId] ?? Object.values(pack.tilesets)[0];
    if (!tileset) {
      setStatus("Нет тайлсета — сначала загрузи пак");
      return;
    }
    const lightTemplate =
      Object.values(pack.maps).find(
        (m) =>
          (createMapProfile === "explore"
            ? m.playProfile === "explore"
            : m.playProfile !== "explore") && m.light,
      ) ??
      pack.maps[activeMapId ?? ""] ??
      Object.values(pack.maps)[0] ??
      null;
    const map = createBlankEmberMap({
      nameRu: createMapName,
      width: createMapW,
      height: createMapH,
      tilesetId: tileset.id,
      tileSize: tileset.tileSize,
      playProfile: createMapProfile,
      lightTemplate,
      usedMapIds: pack.maps,
    });
    let next = upsertMap(pack, map);
    let stageId: string | null = null;
    try {
      const stage = createStageForMap(next, map);
      next = upsertStage(next, stage);
      stageId = stage.id;
    } catch {
      /* pack without stages — map still playable once a stage exists */
    }
    setPack(next);
    setIssues(validatePack(next));
    setActiveMapId(map.id);
    setActiveTilesetId(tileset.id);
    setTab("maps");
    setCreateMapOpen(false);
    const mapRes = await writeEmberJson(`maps/${map.id}.json`, map);
    let stageError: string | null = null;
    if (stageId) {
      const stageRes = await writeEmberJson(
        `stages/${stageId}.json`,
        next.stages[stageId]!,
      );
      if (!stageRes.ok) stageError = stageRes.error;
    }
    setOverrides(listLocalOverrides());
    if (mapRes.ok && !stageError) {
      setStatus(`Карта «${map.nameRu}» создана`);
    } else {
      setStatus(
        `Карта: ${mapRes.ok ? "ok" : mapRes.error} · стадия: ${stageError ?? "ok"}`,
      );
    }
  }, [
    pack,
    createMapName,
    createMapW,
    createMapH,
    createMapTilesetId,
    createMapProfile,
    activeMapId,
  ]);

  const deleteMap = useCallback(async () => {
    if (!pack) return;
    const id =
      (activeMapId && pack.maps[activeMapId] ? activeMapId : null) ??
      Object.keys(pack.maps)[0] ??
      null;
    if (!id) return;
    if (Object.keys(pack.maps).length <= 1) {
      setStatus("Нельзя удалить последнюю карту пака");
      return;
    }
    const map = pack.maps[id];
    if (
      !window.confirm(
        `Удалить карту «${map?.nameRu ?? id}» и связанные стадии? Это нельзя отменить Undo.`,
      )
    ) {
      return;
    }
    const { pack: next, removedStageIds } = removeMapFromPack(pack, id);
    setPack(next);
    setIssues(validatePack(next));
    setActiveMapId(Object.keys(next.maps)[0] ?? null);
    const mapRes = await deleteEmberFile(`maps/${id}.json`);
    const stageErrors: string[] = [];
    for (const stageId of removedStageIds) {
      const stageRes = await deleteEmberFile(`stages/${stageId}.json`);
      if (!stageRes.ok) stageErrors.push(stageRes.error);
    }
    setOverrides(listLocalOverrides());
    if (mapRes.ok && stageErrors.length === 0) {
      setStatus(`Карта «${map?.nameRu ?? id}» удалена`);
    } else {
      setStatus(
        `Карта: ${mapRes.ok ? "ok" : mapRes.error}${
          stageErrors.length ? ` · стадии: ${stageErrors.join("; ")}` : ""
        }`,
      );
    }
  }, [pack, activeMapId]);

  const applyEventChange = useCallback(
    async (event: EmberEvent) => {
      if (!pack) return;
      let next = upsertEvent(pack, event);
      const synced = syncEventStageLinks(next, event);
      next = synced.pack;
      setPack(next);
      setIssues(validatePack(next));
      const evRes = await writeEmberJson(`events/${event.id}.json`, event);
      for (const st of synced.stagesChanged) {
        await writeEmberJson(`stages/${st.id}.json`, st);
      }
      setOverrides(listLocalOverrides());
      setStatus(
        evRes.ok
          ? `Ивент обновлён (${evRes.source})`
          : `Ивент: ${"error" in evRes ? evRes.error : "?"}`,
      );
    },
    [pack],
  );

  useEffect(() => {
    if (!openMenu && !createMapOpen) return;
    const onDocDown = (e: MouseEvent) => {
      const root = menubarRef.current;
      if (openMenu && root && !root.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenMenu(null);
        setCreateMapOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openMenu, createMapOpen]);

  const mapId =
    (activeMapId && pack?.maps[activeMapId] ? activeMapId : null) ??
    (pack ? Object.keys(pack.maps)[0] : null);
  const tilesetId =
    (activeTilesetId && pack?.tilesets[activeTilesetId]
      ? activeTilesetId
      : null) ?? (pack ? Object.keys(pack.tilesets)[0] : null);
  const errorCount = issues.filter((i) => i.level === "error").length;
  const warningCount = issues.filter((i) => i.level === "warn").length;
  const issueCount = errorCount + warningCount;
  const current = tabMeta(tab);

  const selectTab = (id: Tab) => {
    setTab(id);
    setOpenMenu(null);
  };

  const applyStageChange = useCallback(
    (stage: EmberStage) => {
      if (!pack) return;
      const next = {
        ...pack,
        stages: { ...pack.stages, [stage.id]: stage },
      };
      setPack(next);
      setIssues(validatePack(next));
    },
    [pack],
  );

  const applySpawnChange = useCallback(
    (spawn: EmberSpawnTable) => {
      if (!pack) return;
      const next = {
        ...pack,
        spawns: { ...pack.spawns, [spawn.id]: spawn },
      };
      setPack(next);
      setIssues(validatePack(next));
    },
    [pack],
  );

  const navigateFromLibrary = (
    nextTab: LibNavigateTab,
    focus?: LibNavigateFocus,
  ) => {
    if (nextTab === "library") {
      setTab("library");
      return;
    }
    if (nextTab === "sprites") {
      setSpriteFocusId(focus?.spriteId ?? null);
      setTab("sprites");
      setOpenMenu(null);
      return;
    }
    if (nextTab === "tiles") {
      if (focus?.tilesetId && pack?.tilesets[focus.tilesetId]) {
        setActiveTilesetId(focus.tilesetId);
      }
      setTileFocusId(focus?.tileId ?? null);
      setTab("tiles");
      setOpenMenu(null);
    }
  };

  useEffect(() => {
    if (spriteFocusId == null) return;
    const t = window.setTimeout(() => setSpriteFocusId(null), 200);
    return () => window.clearTimeout(t);
  }, [spriteFocusId]);

  useEffect(() => {
    if (tileFocusId == null) return;
    const t = window.setTimeout(() => setTileFocusId(null), 200);
    return () => window.clearTimeout(t);
  }, [tileFocusId]);

  const onMenuTrigger = (
    e: ReactMouseEvent<HTMLButtonElement>,
    groupId: string,
    soleTab?: Tab,
  ) => {
    e.stopPropagation();
    if (soleTab) {
      selectTab(soleTab);
      return;
    }
    setOpenMenu((cur) => (cur === groupId ? null : groupId));
  };

  const voxelOverrides = overrides.filter((rel) => rel.startsWith("voxels/"));
  const voxelBakIssue = issues.some(
    (issue) =>
      issue.path.startsWith("voxels/") && issue.message.includes("резервн"),
  );

  useEffect(() => {
    const prev = prevToastFlagsRef.current;
    if (voxelBakIssue && !prev.bak) {
      setStatus("voxel .bak — открыта резервная копия", "warn");
    }
    if (voxelOverrides.length !== prev.vox && voxelOverrides.length > 0) {
      setStatus(`voxel override×${voxelOverrides.length}`, "warn");
    } else if (
      voxelOverrides.length === 0 &&
      overrides.length !== prev.ov &&
      overrides.length > 0
    ) {
      setStatus(`override×${overrides.length}`, "warn");
    }
    prevToastFlagsRef.current = {
      bak: voxelBakIssue,
      vox: voxelOverrides.length,
      ov: overrides.length,
    };
  }, [voxelBakIssue, voxelOverrides.length, overrides.length, setStatus]);

  return (
    <div className="page page--ember-editor">
      <nav
        ref={menubarRef}
        className="ember-menubar"
        aria-label="Меню редактора"
      >
        <div
          className="ember-menubar__brand"
          title="Библиотека контента: карты · сцены · арты. Сохранение в content/ember (Electron) или local override."
        >
          Ember
        </div>

        {NAV_GROUPS.map((group) => {
          const hasActive = group.items.some((i) => i.id === tab);
          const soleTab =
            group.items.length === 1 ? group.items[0]!.id : undefined;
          const open = openMenu === group.id && !soleTab;
          const showBadge =
            group.id === "system" && issueCount > 0 ? issueCount : 0;
          return (
            <div
              key={group.id}
              className={`ember-menubar__menu ${open ? "is-open" : ""} ${hasActive ? "has-active" : ""}`}
            >
              <button
                type="button"
                className={`ember-menubar__trigger ${open ? "is-open" : ""} ${hasActive ? "is-active" : ""}`}
                aria-haspopup={soleTab ? undefined : "menu"}
                aria-expanded={soleTab ? undefined : open}
                onClick={(e) => onMenuTrigger(e, group.id, soleTab)}
                onMouseEnter={() => {
                  if (soleTab || openMenu === null) return;
                  setOpenMenu(group.id);
                }}
              >
                <span>{group.title}</span>
                {showBadge > 0 ? (
                  <span className="ember-menubar__badge">{showBadge}</span>
                ) : null}
              </button>
              {open ? (
                <div className="ember-menubar__dropdown" role="menu">
                  {group.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="menuitem"
                      className={`ember-menubar__item ${tab === item.id ? "is-active" : ""}`}
                      title={item.hint}
                      onClick={() => selectTab(item.id)}
                    >
                      <span>{item.label}</span>
                      {item.id === "validate" && issueCount > 0 ? (
                        <span className="ember-menubar__badge">
                          {issueCount}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}

        <div className="ember-menubar__current" aria-live="polite">
          <span className="ember-menubar__crumb muted">{current.group}</span>
          <span className="ember-menubar__crumb-sep" aria-hidden>
            /
          </span>
          <strong>{current.label}</strong>
          {tab === "maps" && pack ? (
            <>
              {Object.keys(pack.maps).length > 0 ? (
                <label className="ember-menubar__pick">
                  <span className="muted">Карта</span>
                  <select
                    aria-label="Карта"
                    value={mapId ?? ""}
                    onChange={(e) => {
                      const id = e.target.value;
                      setActiveMapId(id);
                      const tilesetIdForMap = pack.maps[id]?.tilesetId;
                      if (tilesetIdForMap && pack.tilesets[tilesetIdForMap]) {
                        setActiveTilesetId(tilesetIdForMap);
                      }
                    }}
                  >
                    {Object.values(pack.maps).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nameRu ?? m.id}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <button
                type="button"
                className="ghost ember-menubar__create"
                title="Пустая карта + стадия для play"
                onClick={openCreateMap}
              >
                + Карта
              </button>
              {mapId ? (
                <button
                  type="button"
                  className="ghost ember-danger ember-menubar__create"
                  title="Удалить открытую карту из пака"
                  onClick={() => void deleteMap()}
                >
                  Удалить карту
                </button>
              ) : null}
            </>
          ) : null}
          {tab === "tiles" && pack && Object.keys(pack.tilesets).length > 1 ? (
            <label className="ember-menubar__pick">
              <span className="muted">Тайлсет</span>
              <select
                aria-label="Тайлсет"
                value={tilesetId ?? ""}
                onChange={(e) => setActiveTilesetId(e.target.value)}
              >
                {Object.values(pack.tilesets).map((ts) => (
                  <option key={ts.id} value={ts.id}>
                    {ts.id}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        <div className="ember-menubar__actions">
          <button type="button" className="ghost" onClick={onBackToPlay}>
            К игре
          </button>
          <button type="button" className="ghost" onClick={() => void reload()}>
            Reload
          </button>
          {voxelOverrides.length > 0 ? (
            <button
              type="button"
              className="ghost"
              title="Убрать браузерный кэш вокселей и перечитать диск / .bak"
              onClick={() => {
                for (const rel of voxelOverrides) clearLocalOverride(rel);
                setOverrides(listLocalOverrides());
                void reload();
                setStatus("Voxel override сброшен");
              }}
            >
              Voxel disk
            </button>
          ) : null}
          <button
            type="button"
            className="ghost"
            title="Clear local overrides"
            onClick={() => {
              clearAllLocalOverrides();
              setOverrides([]);
              void reload();
              setStatus("Overrides очищены");
            }}
          >
            Clear
          </button>
        </div>
      </nav>

      {error ? <p className="ember-error">{error}</p> : null}

      {createMapOpen && pack ? (
        <div
          className="ember-ed-create-map"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ember-create-map-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setCreateMapOpen(false);
          }}
        >
          <form
            className="ember-ed-create-map__card"
            onSubmit={(e) => {
              e.preventDefault();
              void createMap();
            }}
          >
            <p className="ember-ed-create-map__kicker muted">Новая карта</p>
            <h2 id="ember-create-map-title">Пустой мир</h2>
            <p className="muted ember-ed-create-map__hint">
              Рамка-стены и точка старта. Свет копируется с похожей карты, если
              она есть.
            </p>
            <label className="ember-ed-create-map__field">
              <span>Имя</span>
              <input
                type="text"
                value={createMapName}
                onChange={(e) => setCreateMapName(e.target.value)}
                autoFocus
              />
            </label>
            <div className="ember-ed-create-map__row">
              <label className="ember-ed-create-map__field">
                <span>Ширина</span>
                <input
                  type="number"
                  min={8}
                  max={96}
                  value={createMapW}
                  onChange={(e) => setCreateMapW(Number(e.target.value))}
                />
              </label>
              <label className="ember-ed-create-map__field">
                <span>Высота</span>
                <input
                  type="number"
                  min={8}
                  max={96}
                  value={createMapH}
                  onChange={(e) => setCreateMapH(Number(e.target.value))}
                />
              </label>
            </div>
            <label className="ember-ed-create-map__field">
              <span>Тайлсет</span>
              <select
                value={createMapTilesetId}
                onChange={(e) => setCreateMapTilesetId(e.target.value)}
              >
                {Object.values(pack.tilesets).map((ts) => (
                  <option key={ts.id} value={ts.id}>
                    {ts.id}
                  </option>
                ))}
              </select>
            </label>
            <label className="ember-ed-create-map__field">
              <span>Режим</span>
              <select
                value={createMapProfile}
                onChange={(e) =>
                  setCreateMapProfile(
                    e.target.value === "arena" ? "arena" : "explore",
                  )
                }
              >
                <option value="explore">Прогулка</option>
                <option value="arena">Арена</option>
              </select>
            </label>
            <div className="ember-ed-create-map__ops">
              <button
                type="button"
                className="ghost"
                onClick={() => setCreateMapOpen(false)}
              >
                Отмена
              </button>
              <button type="submit" className="primary">
                Создать
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <div className="ember-editor-shell">
        <div className="ember-editor-body">
          {!pack ? (
            <p className="muted">Загрузка…</p>
          ) : (
            <EditorPanelBoundary key={tab} tab={tab}>
              <Suspense fallback={<EditorPanelFallback tab={tab} />}>
              {tab === "maps" && mapId && pack.maps[mapId] ? (
                <LazyMapEditorPanel
                  key={mapId}
                  pack={{
                    ...pack,
                    voxelModels: pack.voxelModels ?? {},
                  }}
                  map={pack.maps[mapId]}
                  onChange={(map) => {
                    const next = {
                      ...pack,
                      maps: { ...pack.maps, [map.id]: map },
                    };
                    setPack(next);
                    setIssues(validatePack(next));
                  }}
                  onPackChange={(next) => {
                    setPack(next);
                    setIssues(validatePack(next));
                  }}
                  onStageChange={applyStageChange}
                  onSpawnChange={applySpawnChange}
                  onSaved={(msg) => {
                    setStatus(msg);
                    setOverrides(listLocalOverrides());
                  }}
                  onEditTile={(tileId) => {
                    setTileFocusId(tileId);
                    setTab("tiles");
                    setOpenMenu(null);
                  }}
                  onEditSprite={(spriteId) => {
                    setSpriteFocusId(spriteId);
                    setTab("sprites");
                    setOpenMenu(null);
                  }}
                />
              ) : tab === "maps" ? (
                <div className="ember-ed-card">
                  <p className="muted">Нет карт в паке.</p>
                  <button
                    type="button"
                    className="primary"
                    onClick={openCreateMap}
                  >
                    + Создать карту
                  </button>
                </div>
              ) : null}

              {tab === "tiles" && tilesetId && pack.tilesets[tilesetId] ? (
                <LazyTileEditorPanel
                  pack={pack}
                  tileset={pack.tilesets[tilesetId]}
                  favorites={pack.paletteFavorites ?? []}
                  initialTileId={tileFocusId}
                  onFavoritesChange={(paletteFavorites) => {
                    const next = { ...pack, paletteFavorites };
                    setPack(next);
                    void writeEmberJson("sprites/registry.json", {
                      paletteFavorites,
                      sprites: Object.values(pack.sprites),
                    });
                  }}
                  onChange={(tileset) => {
                    const next = {
                      ...pack,
                      tilesets: { ...pack.tilesets, [tileset.id]: tileset },
                    };
                    setPack(next);
                    setIssues(validatePack(next));
                  }}
                  onSaved={(msg) => {
                    setStatus(msg);
                    setOverrides(listLocalOverrides());
                  }}
                />
              ) : null}

              {tab === "sprites" ? (
                <LazySpriteEditorPanel
                  pack={pack}
                  initialSpriteId={spriteFocusId}
                  onChangePack={(next) => {
                    setPack(next);
                    setIssues(validatePack(next));
                  }}
                  onSaved={(msg) => {
                    setStatus(msg);
                    setOverrides(listLocalOverrides());
                  }}
                />
              ) : null}

              {tab === "voxels" ? (
                <LazyVoxelSculptPanel
                  pack={{
                    ...pack,
                    voxelModels: pack.voxelModels ?? {},
                    lightPresets: pack.lightPresets ?? {},
                    lookPresets: pack.lookPresets ?? {},
                  }}
                  modelId={voxelFocusId}
                  onActiveModelChange={setVoxelFocusId}
                  onPackChange={(next) => {
                    setPack(next);
                    setIssues(validatePack(next));
                    // Keep current focus; only fall back if the focused model was deleted.
                    setVoxelFocusId((prev) => {
                      if (prev && next.voxelModels[prev]) return prev;
                      if (prev && !next.voxelModels[prev]) {
                        return Object.keys(next.voxelModels)[0] ?? null;
                      }
                      return prev;
                    });
                  }}
                  onSaved={(msg) => {
                    setStatus(msg);
                    setOverrides(listLocalOverrides());
                  }}
                />
              ) : null}

              {tab === "scenes" ? (
                sceneId && pack.scenes[sceneId] ? (
                  <LazySceneEditorPanel
                    pack={pack}
                    scene={pack.scenes[sceneId]}
                    sceneId={sceneId}
                    onSelectScene={setSceneId}
                    onCreateScene={(use) => void createScene(use)}
                    onChange={(scene) => {
                      const next = {
                        ...pack,
                        scenes: { ...pack.scenes, [scene.id]: scene },
                      };
                      setPack(next);
                      setIssues(validatePack(next));
                    }}
                    onArtsChange={(arts: EmberArt[]) => {
                      const map: Record<string, EmberArt> = {};
                      for (const a of arts) map[a.id] = a;
                      const next = { ...pack, arts: map };
                      setPack(next);
                      setIssues(validatePack(next));
                    }}
                    onEventChange={(event) => void applyEventChange(event)}
                    onEnsureEvent={() => {
                      const scene = pack.scenes[sceneId];
                      if (!scene) return;
                      const event = createEventForScene(scene, "manual");
                      void applyEventChange(event);
                    }}
                    onSaved={(msg) => {
                      setStatus(msg);
                      setOverrides(listLocalOverrides());
                    }}
                    onGrantCinders={onGrantCinders}
                  />
                ) : (
                  <div className="ember-ed-card">
                    <p className="muted">Нет сцен в паке.</p>
                    <button
                      type="button"
                      className="primary"
                      onClick={() => void createScene()}
                    >
                      + Создать сцену
                    </button>
                  </div>
                )
              ) : null}

              {tab === "library" ? (
                <LazyArtsEditorPanel
                  pack={pack}
                  onNavigate={navigateFromLibrary}
                  onChange={(arts: EmberArt[]) => {
                    const map: Record<string, EmberArt> = {};
                    for (const a of arts) map[a.id] = a;
                    const next = { ...pack, arts: map };
                    setPack(next);
                    setIssues(validatePack(next));
                  }}
                  onSaved={(msg) => {
                    setStatus(msg);
                    setOverrides(listLocalOverrides());
                  }}
                />
              ) : null}

              {tab === "items" ? (
                <LazyItemsEditorPanel
                  pack={pack}
                  onChangePack={(next) => {
                    setPack(next);
                    setIssues(validatePack(next));
                  }}
                  onSaved={(msg) => {
                    setStatus(msg);
                    setOverrides(listLocalOverrides());
                  }}
                />
              ) : null}

              {tab === "shops" ? (
                <LazyShopsEditorPanel
                  pack={pack}
                  onChangePack={(next) => {
                    setPack(next);
                    setIssues(validatePack(next));
                  }}
                  onSaved={(msg) => {
                    setStatus(msg);
                    setOverrides(listLocalOverrides());
                  }}
                />
              ) : null}

              {tab === "validate" ? (
                <div className="ember-ed-card ember-validate">
                  <h3 className="ember-ed-card__title">Проверка пака</h3>
                  {issues.length === 0 ? (
                    <p>Ошибок нет ✓</p>
                  ) : (
                    issues.map((i) => (
                      <div
                        key={i.path + i.message}
                        className={
                          i.level === "error"
                            ? "ember-validate--error"
                            : "ember-validate--warn"
                        }
                      >
                        [{i.level}] {i.path}: {i.message}
                      </div>
                    ))
                  )}
                  <EmberSavePanel
                    packId={pack.meta.id}
                    backend={saveBackend}
                    mode="editor"
                    onToast={(textRu) => setStatus(textRu)}
                  />
                </div>
              ) : null}
              </Suspense>
            </EditorPanelBoundary>
          )}
        </div>
      </div>

      {toasts.length > 0 ? (
        <div
          className="ember-toast-host ember-toast-host--top"
          aria-live="polite"
          aria-relevant="additions"
        >
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={
                toast.kind === "warn"
                  ? "ember-toast ember-toast--warn"
                  : "ember-toast"
              }
              role="status"
            >
              {toast.text}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
