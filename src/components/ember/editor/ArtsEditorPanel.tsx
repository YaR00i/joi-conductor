import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  deleteEmberFile,
  emberAssetUrl,
  writeEmberBytes,
  writeEmberJson,
  writeEmberText,
  type EmberPack,
} from "../../../game";
import {
  normalizePixelSprite,
  spriteTotalHeight,
} from "../../../game/content/pixelSprite";
import type {
  EmberArt,
  EmberArtKind,
  EmberPixelSprite,
  EmberTileset,
  MistressIdRef,
} from "../../../game/content/types";
import { pixelsToDataUrl } from "./libPixelPreview";

export type LibNavigateTab = "tiles" | "sprites" | "library";

export type LibNavigateFocus = {
  spriteId?: string;
  tilesetId?: string;
  tileId?: number;
};

type Props = {
  pack: EmberPack;
  onChange: (arts: EmberArt[]) => void;
  onSaved: (msg: string) => void;
  onNavigate?: (tab: LibNavigateTab, focus?: LibNavigateFocus) => void;
};

type LibFilter =
  | "all"
  | EmberArtKind
  | "portraits"
  | "nsfw"
  | "tiles"
  | "sprites";

type LibItem =
  | { type: "art"; key: string; art: EmberArt }
  | { type: "sprite"; key: string; sprite: EmberPixelSprite }
  | {
      type: "tile";
      key: string;
      tilesetId: string;
      tileId: number;
      tileset: EmberTileset;
      name: string;
      color: string;
      pixels?: string[];
    }
  | {
      type: "portrait";
      key: string;
      mistressId: string;
      expressionKey: string;
      path: string;
      labelRu: string;
    };

type LightboxTarget = {
  id: string;
  title: string;
  subtitle?: string;
  path?: string;
  src?: string;
};

type ImportSession = {
  file: File;
  url: string;
  draftId: string;
  kind: EmberArtKind | null;
  nsfw: boolean;
  /** Filter suggested a kind — show confirm banner, still allow change. */
  fromFilter: boolean;
};

const KIND_LABELS: Record<EmberArtKind, string> = {
  splash: "Splash",
  cg: "CG / сцена",
  portrait: "Портрет",
  pixel: "Пиксель-арт",
  animation: "Анимация",
  other: "Другое",
};

const ART_KINDS = Object.keys(KIND_LABELS) as EmberArtKind[];

const MISTRESSES: MistressIdRef[] = ["hu_tao", "furina", "sunna", "sparkle"];

const ACCEPT =
  ".svg,image/svg+xml,image/png,image/webp,image/jpeg,.png,.webp,.jpg,.jpeg";

function isSvgFile(file: File, name: string): boolean {
  return file.type.includes("svg") || name.toLowerCase().endsWith(".svg");
}

function extFromFile(file: File, safeName: string): string {
  const fromName = safeName.match(/\.(\w+)$/)?.[1]?.toLowerCase();
  if (fromName) return fromName;
  if (file.type.includes("png")) return "png";
  if (file.type.includes("webp")) return "webp";
  if (file.type.includes("jpeg") || file.type.includes("jpg")) return "jpg";
  if (file.type.includes("svg")) return "svg";
  return "bin";
}

function isImageFile(file: File): boolean {
  return (
    file.type.startsWith("image/") ||
    /\.(svg|png|webp|jpe?g)$/i.test(file.name)
  );
}

function filterBlocksArtImport(filter: LibFilter): boolean {
  return filter === "tiles" || filter === "sprites";
}

/** Kind implied by current filter, or null when user must choose. */
function kindFromFilter(filter: LibFilter): EmberArtKind | null {
  switch (filter) {
    case "cg":
    case "splash":
    case "pixel":
    case "animation":
    case "portrait":
    case "other":
      return filter;
    case "all":
    case "nsfw":
    case "portraits":
    case "tiles":
    case "sprites":
      return null;
    default: {
      const _n: never = filter;
      return _n;
    }
  }
}

function idFromFilename(name: string): string {
  return (
    name.replace(/\.\w+$/, "").replace(/[^\w.\-]+/g, "_") || "new_art"
  );
}

function itemLabel(item: LibItem): string {
  switch (item.type) {
    case "art":
      return item.art.id;
    case "sprite":
      return item.sprite.nameRu?.trim() || item.sprite.id;
    case "tile":
      return item.name || `tile ${item.tileId}`;
    case "portrait":
      return item.labelRu;
    default: {
      const _n: never = item;
      return _n;
    }
  }
}

function itemSubtitle(item: LibItem): string {
  switch (item.type) {
    case "art":
      return `${KIND_LABELS[item.art.kind ?? "other"]}${item.art.nsfw ? " · NSFW" : ""}`;
    case "sprite":
      return `Спрайт · ${item.sprite.width}×${spriteTotalHeight(item.sprite)}`;
    case "tile":
      return `Тайл · ${item.tilesetId} #${item.tileId}`;
    case "portrait":
      return `Портрет · ${item.mistressId}`;
    default: {
      const _n: never = item;
      return _n;
    }
  }
}

function itemSearchText(item: LibItem): string {
  switch (item.type) {
    case "art":
      return [
        item.art.id,
        item.art.path,
        item.art.captionRu,
        item.art.notesRu,
        ...(item.art.tags ?? []),
        item.art.kind,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
    case "sprite":
      return `${item.sprite.id} ${item.sprite.nameRu ?? ""} sprite`.toLowerCase();
    case "tile":
      return `${item.tilesetId} ${item.tileId} ${item.name} tile`.toLowerCase();
    case "portrait":
      return `${item.mistressId} ${item.expressionKey} ${item.labelRu} ${item.path}`.toLowerCase();
    default: {
      const _n: never = item;
      return _n;
    }
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function fileFromClipboard(data: DataTransfer | null): File | null {
  if (!data) return null;
  const items = data.items;
  if (items) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item?.kind === "file" && item.type.startsWith("image/")) {
        const f = item.getAsFile();
        if (f) return f;
      }
    }
  }
  const files = data.files;
  if (files?.length) {
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (f && isImageFile(f)) return f;
    }
  }
  return null;
}

export function ArtsEditorPanel({
  pack,
  onChange,
  onSaved,
  onNavigate,
}: Props) {
  const arts = Object.values(pack.arts);
  const [filter, setFilter] = useState<LibFilter>("all");
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<"id" | "type">("id");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [assetRev, setAssetRev] = useState(() => Date.now());
  const [lightbox, setLightbox] = useState<LightboxTarget | null>(null);
  const [importSession, setImportSession] = useState<ImportSession | null>(
    null,
  );
  const dropDepth = useRef(0);
  const filterRef = useRef(filter);
  filterRef.current = filter;

  const allItems = useMemo(() => {
    const items: LibItem[] = [];
    for (const art of arts) {
      items.push({ type: "art", key: `art:${art.id}`, art });
    }
    for (const raw of Object.values(pack.sprites)) {
      const sprite = normalizePixelSprite(raw);
      items.push({ type: "sprite", key: `sprite:${sprite.id}`, sprite });
    }
    for (const tileset of Object.values(pack.tilesets)) {
      for (const tile of tileset.tiles) {
        if (tile.id === 0) continue;
        items.push({
          type: "tile",
          key: `tile:${tileset.id}:${tile.id}`,
          tilesetId: tileset.id,
          tileId: tile.id,
          tileset,
          name: tile.name,
          color: tile.color,
          pixels: tile.pixels,
        });
      }
    }
    for (const reg of Object.values(pack.portraits)) {
      for (const [expressionKey, expr] of Object.entries(reg.expressions)) {
        items.push({
          type: "portrait",
          key: `portrait:${reg.mistressId}:${expressionKey}`,
          mistressId: reg.mistressId,
          expressionKey,
          path: expr.path,
          labelRu: expr.labelRu,
        });
      }
    }
    return items;
  }, [arts, pack.sprites, pack.tilesets, pack.portraits]);

  const counts = useMemo(() => {
    const c = {
      all: arts.length,
      cg: 0,
      splash: 0,
      pixel: 0,
      animation: 0,
      portrait: 0,
      other: 0,
      nsfw: 0,
      portraits: 0,
      tiles: 0,
      sprites: 0,
    };
    for (const a of arts) {
      const k = a.kind ?? "other";
      if (k in c) c[k as keyof typeof c] = (c[k as keyof typeof c] as number) + 1;
      if (a.nsfw) c.nsfw += 1;
    }
    c.portraits = allItems.filter((i) => i.type === "portrait").length;
    c.tiles = allItems.filter((i) => i.type === "tile").length;
    c.sprites = allItems.filter((i) => i.type === "sprite").length;
    return c;
  }, [arts, allItems]);

  const filteredItems = useMemo(() => {
    let list = allItems;
    switch (filter) {
      case "all":
        list = allItems.filter((i) => i.type === "art");
        break;
      case "nsfw":
        list = allItems.filter((i) => i.type === "art" && i.art.nsfw);
        break;
      case "portraits":
        list = allItems.filter((i) => i.type === "portrait");
        break;
      case "tiles":
        list = allItems.filter((i) => i.type === "tile");
        break;
      case "sprites":
        list = allItems.filter((i) => i.type === "sprite");
        break;
      default:
        list = allItems.filter(
          (i) => i.type === "art" && (i.art.kind ?? "other") === filter,
        );
    }
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((i) => itemSearchText(i).includes(q));
    const sorted = [...list];
    sorted.sort((a, b) => {
      if (sortBy === "type") {
        const t = a.type.localeCompare(b.type);
        if (t !== 0) return t;
      }
      return itemLabel(a).localeCompare(itemLabel(b), "ru");
    });
    return sorted;
  }, [allItems, filter, query, sortBy]);

  const selected = useMemo(
    () => allItems.find((i) => i.key === selectedKey) ?? null,
    [allItems, selectedKey],
  );

  useEffect(() => {
    if (selectedKey && !allItems.some((i) => i.key === selectedKey)) {
      setSelectedKey(filteredItems[0]?.key ?? null);
    }
  }, [allItems, selectedKey, filteredItems]);

  const previewCache = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of filteredItems) {
      if (item.type === "tile") {
        const size = item.tileset.tileSize;
        const px =
          item.pixels && item.pixels.length === size * size
            ? item.pixels
            : undefined;
        if (px) map.set(item.key, pixelsToDataUrl(px, size, size));
      } else if (item.type === "sprite") {
        const s = item.sprite;
        const h = spriteTotalHeight(s);
        if (s.pixels.length === s.width * h) {
          map.set(item.key, pixelsToDataUrl(s.pixels, s.width, h));
        }
      }
    }
    return map;
  }, [filteredItems]);

  const assetUrl = useCallback(
    (path: string) => emberAssetUrl(path, assetRev),
    [assetRev],
  );

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  useEffect(() => {
    return () => {
      if (importSession) URL.revokeObjectURL(importSession.url);
    };
  }, [importSession]);

  const clearImport = useCallback(() => {
    setImportSession((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
  }, []);

  const stageImport = useCallback(
    (file: File) => {
      const f = filterRef.current;
      if (filterBlocksArtImport(f)) {
        onSaved(
          "Импорт файлов здесь недоступен — переключитесь с «Тайлы» / «Спрайты» на раздел артов",
        );
        return;
      }
      if (!isImageFile(file)) {
        onSaved("Нужен файл изображения (SVG / PNG / WebP / JPEG)");
        return;
      }
      const suggested = kindFromFilter(f);
      setImportSession((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return {
          file,
          url: URL.createObjectURL(file),
          draftId: idFromFilename(file.name),
          kind: suggested,
          nsfw: f === "nsfw",
          fromFilter: suggested != null,
        };
      });
    },
    [onSaved],
  );

  const onFiles = useCallback(
    (files: FileList | File[] | null) => {
      const file = files?.[0];
      if (file) stageImport(file);
    },
    [stageImport],
  );

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (lightbox) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      const file = fileFromClipboard(e.clipboardData);
      if (!file) return;
      e.preventDefault();
      stageImport(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [lightbox, stageImport]);

  useEffect(() => {
    if (!importSession) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !importing) clearImport();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [importSession, importing, clearImport]);

  const patchSelectedArt = (patch: Partial<EmberArt>) => {
    if (!selected || selected.type !== "art") return;
    const next = arts.map((a) =>
      a.id === selected.art.id ? { ...a, ...patch } : a,
    );
    onChange(next);
  };

  const persistRegistry = async (
    next: EmberArt[],
    okMsg: (source: string) => string,
  ) => {
    const res = await writeEmberJson("arts/registry.json", { arts: next });
    onSaved(
      res.ok
        ? okMsg(res.source)
        : `Ошибка: ${"error" in res ? res.error : "?"}`,
    );
    return res.ok;
  };

  const removeArt = async (art: EmberArt) => {
    if (
      !window.confirm(
        `Удалить «${art.id}» из библиотеки и файл на диске?\n${art.path}`,
      )
    ) {
      return;
    }
    const next = arts.filter((a) => a.id !== art.id);
    onChange(next);
    if (selectedKey === `art:${art.id}`) {
      setSelectedKey(next[0] ? `art:${next[0].id}` : null);
    }
    if (lightbox?.id === art.id) setLightbox(null);
    const del = await deleteEmberFile(art.path);
    await persistRegistry(next, (source) =>
      del.ok
        ? `Удалён «${art.id}» (${source})`
        : `Удалён из registry «${art.id}»; файл: ${"error" in del ? del.error : "?"}`,
    );
    setAssetRev(Date.now());
  };

  const saveRegistry = async () => {
    await persistRegistry(arts, (source) => `Библиотека сохранена (${source})`);
  };

  const register = async () => {
    if (!importSession?.kind) {
      onSaved("Выберите раздел для импорта");
      return;
    }
    const { file, draftId, kind, nsfw } = importSession;
    setImporting(true);
    try {
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const ext = extFromFile(file, safeName);
      const id = draftId.trim() || safeName.replace(/\.\w+$/, "") || "art";
      const path = `arts/files/${id}.${ext}`;
      const svg = isSvgFile(file, safeName);

      let writeRes;
      if (svg) {
        writeRes = await writeEmberText(path, await file.text());
      } else {
        const buf = new Uint8Array(await file.arrayBuffer());
        writeRes = await writeEmberBytes(path, buf);
      }
      if (!writeRes.ok) {
        onSaved(`Файл: ${writeRes.error}`);
        return;
      }

      const art: EmberArt = {
        id,
        path,
        mistressId: "hu_tao",
        nsfw,
        kind,
        captionRu: "",
      };
      const next = [...arts.filter((a) => a.id !== art.id), art];
      onChange(next);
      setSelectedKey(`art:${art.id}`);
      if (kindFromFilter(filter) == null && filter !== "nsfw") {
        setFilter(kind);
      }
      setAssetRev(Date.now());
      clearImport();
      await persistRegistry(
        next,
        (source) => `Импорт «${art.id}» → ${KIND_LABELS[kind]} (${writeRes.source} → ${source})`,
      );
    } finally {
      setImporting(false);
    }
  };

  const openLightboxFor = (item: LibItem) => {
    if (item.type === "art") {
      setLightbox({
        id: item.art.id,
        path: item.art.path,
        title: item.art.id,
        subtitle: itemSubtitle(item),
      });
      return;
    }
    if (item.type === "portrait") {
      setLightbox({
        id: item.key,
        path: item.path,
        title: item.mistressId,
        subtitle: item.labelRu,
      });
      return;
    }
    const src = previewCache.get(item.key);
    if (src) {
      setLightbox({
        id: item.key,
        src,
        title: itemLabel(item),
        subtitle: itemSubtitle(item),
      });
    }
  };

  const goEdit = (item: LibItem) => {
    setSelectedKey(item.key);
    switch (item.type) {
      case "art":
      case "portrait":
        onNavigate?.("library");
        break;
      case "sprite":
        onNavigate?.("sprites", { spriteId: item.sprite.id });
        break;
      case "tile":
        onNavigate?.("tiles", {
          tilesetId: item.tilesetId,
          tileId: item.tileId,
        });
        break;
      default: {
        const _n: never = item;
        void _n;
      }
    }
  };

  const thumbSrc = (item: LibItem): string => {
    if (item.type === "art") return assetUrl(item.art.path);
    if (item.type === "portrait") return assetUrl(item.path);
    return previewCache.get(item.key) || "";
  };

  const filters: Array<[LibFilter, string, number]> = [
    ["all", "Все арты", counts.all],
    ["cg", "CG / сцены", counts.cg],
    ["splash", "Splash", counts.splash],
    ["pixel", "Пиксель-арты", counts.pixel],
    ["sprites", "Спрайты", counts.sprites],
    ["tiles", "Тайлы", counts.tiles],
    ["animation", "Анимации", counts.animation],
    ["portrait", "Портреты (файлы)", counts.portrait],
    ["portraits", "Портреты госпож", counts.portraits],
    ["nsfw", "NSFW", counts.nsfw],
    ["other", "Прочее", counts.other],
  ];

  const importBlocked = filterBlocksArtImport(filter);
  const mustPickKind = Boolean(importSession && !importSession.kind);

  return (
    <div
      className={`ember-lib-workspace${dragOver ? " is-drop-target" : ""}`}
      onDragEnter={(e) => {
        e.preventDefault();
        dropDepth.current += 1;
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        dropDepth.current = Math.max(0, dropDepth.current - 1);
        if (dropDepth.current === 0) setDragOver(false);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        dropDepth.current = 0;
        setDragOver(false);
        onFiles(e.dataTransfer.files);
      }}
    >
      <aside className="ember-lib-sidebar">
        <div className="ember-ed-card">
          <h3 className="ember-ed-card__title">Библиотека</h3>
          <p className="muted ember-hint ember-lib-import-hint">
            {importBlocked
              ? "В «Тайлы» и «Спрайты» файлы не импортируются — откройте нужный редактор или фильтр артов."
              : "Перетащи изображение в окно или Ctrl+V — откроется импорт на весь экран."}
          </p>
          <div className="ember-filter-col">
            {filters.map(([id, label, count]) => (
              <button
                key={id}
                type="button"
                className={`ember-filter-btn ${filter === id ? "is-active" : ""}`}
                onClick={() => setFilter(id)}
              >
                {label}
                <span className="muted">{count}</span>
              </button>
            ))}
          </div>
          <div className="ember-chip-row ember-lib-sidebar-actions">
            <label className="ghost ember-lib-file-btn">
              Выбрать файл…
              <input
                type="file"
                accept={ACCEPT}
                disabled={importing || importBlocked}
                onChange={(e) => {
                  onFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            <button
              type="button"
              className="ghost"
              onClick={() => void saveRegistry()}
              disabled={importing}
            >
              Сохранить registry
            </button>
          </div>
        </div>
      </aside>

      <div className="ember-lib-grid-wrap">
        <div className="ember-lib-toolbar">
          <input
            className="ember-lib-search"
            type="search"
            placeholder="Поиск по id, тегам, имени…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <label className="ember-lib-sort">
            <span className="muted">Сорт</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "id" | "type")}
            >
              <option value="id">По имени</option>
              <option value="type">По типу</option>
            </select>
          </label>
        </div>

        <div className="ember-lib-grid">
          {filteredItems.map((item) => {
            const src = thumbSrc(item);
            const active = selectedKey === item.key;
            return (
              <div
                key={item.key}
                className={`ember-lib-card${active ? " is-active" : ""}`}
              >
                <div className="ember-lib-card__media">
                  <button
                    type="button"
                    className="ember-lib-card__thumb"
                    title="Открыть на весь экран"
                    onClick={() => {
                      setSelectedKey(item.key);
                      openLightboxFor(item);
                    }}
                  >
                    {src ? (
                      <img src={src} alt="" />
                    ) : (
                      <span
                        className="ember-lib-card__swatch"
                        style={{
                          background:
                            item.type === "tile"
                              ? item.color
                              : item.type === "sprite"
                                ? item.sprite.color
                                : "#2a2018",
                        }}
                      />
                    )}
                  </button>
                  {item.type === "art" ? (
                    <button
                      type="button"
                      className="ember-lib-card__trash"
                      title="Удалить"
                      aria-label={`Удалить ${item.art.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        void removeArt(item.art);
                      }}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="16"
                        height="16"
                        aria-hidden
                      >
                        <path
                          fill="currentColor"
                          d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9zm-1 13h12a1 1 0 0 0 1-1V8H5v13a1 1 0 0 0 1 1z"
                        />
                      </svg>
                    </button>
                  ) : null}
                </div>
                <div className="ember-lib-card__foot">
                  <button
                    type="button"
                    className="ember-lib-card__meta"
                    onClick={() => setSelectedKey(item.key)}
                  >
                    <strong>{itemLabel(item)}</strong>
                    <span>{itemSubtitle(item)}</span>
                  </button>
                  <button
                    type="button"
                    className="ember-lib-card__edit"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (item.type === "portrait") {
                        setSelectedKey(item.key);
                        openLightboxFor(item);
                        return;
                      }
                      goEdit(item);
                    }}
                  >
                    Редактировать
                  </button>
                </div>
              </div>
            );
          })}
          {filteredItems.length === 0 ? (
            <p className="muted">Ничего не найдено</p>
          ) : null}
        </div>
      </div>

      {selected ? (
        <aside className="ember-lib-inspector">
          {selected.type === "art" ? (
            <div className="ember-art-sheet">
              <header className="ember-art-sheet__head">
                <div>
                  <p className="ember-art-sheet__eyebrow">Арт</p>
                  <h3 className="ember-art-sheet__title">{selected.art.id}</h3>
                </div>
                <div className="ember-art-sheet__badges">
                  <span className="ember-art-sheet__badge">
                    {KIND_LABELS[selected.art.kind ?? "other"]}
                  </span>
                  {selected.art.nsfw ? (
                    <span className="ember-art-sheet__badge ember-art-sheet__badge--nsfw">
                      NSFW
                    </span>
                  ) : null}
                </div>
              </header>

              <button
                type="button"
                className="ember-art-sheet__hero"
                title="На весь экран"
                onClick={() => openLightboxFor(selected)}
              >
                <img src={thumbSrc(selected)} alt="" />
                <span>Открыть</span>
              </button>

              <div className="ember-art-sheet__idrow">
                <div className="ember-art-sheet__idblock">
                  <span className="muted">path</span>
                  <code title={selected.art.path}>{selected.art.path}</code>
                </div>
                <button
                  type="button"
                  className="ghost ember-art-sheet__iconbtn"
                  title="Копировать id"
                  onClick={() => {
                    void copyText(selected.art.id).then((ok) =>
                      onSaved(
                        ok
                          ? `Скопирован id: ${selected.art.id}`
                          : "Не удалось скопировать",
                      ),
                    );
                  }}
                >
                  id
                </button>
              </div>

              <div className="ember-art-sheet__fields">
                <label className="ember-art-sheet__field ember-art-sheet__field--half">
                  <span>Тип</span>
                  <select
                    value={selected.art.kind ?? "other"}
                    onChange={(e) =>
                      patchSelectedArt({ kind: e.target.value as EmberArtKind })
                    }
                  >
                    {ART_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {KIND_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="ember-art-sheet__field ember-art-sheet__field--half">
                  <span>Госпожа</span>
                  <select
                    value={selected.art.mistressId ?? ""}
                    onChange={(e) =>
                      patchSelectedArt({
                        mistressId: (e.target.value ||
                          undefined) as MistressIdRef | undefined,
                      })
                    }
                  >
                    <option value="">—</option>
                    {MISTRESSES.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="ember-art-sheet__field">
                  <span>Подпись</span>
                  <input
                    value={selected.art.captionRu ?? ""}
                    onChange={(e) =>
                      patchSelectedArt({ captionRu: e.target.value })
                    }
                  />
                </label>
                <label className="ember-art-sheet__field">
                  <span>Теги</span>
                  <input
                    placeholder="bunny, dialogue…"
                    value={(selected.art.tags ?? []).join(", ")}
                    onChange={(e) =>
                      patchSelectedArt({
                        tags: e.target.value
                          .split(",")
                          .map((t) => t.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </label>
                <label className="ember-art-sheet__field">
                  <span>Заметки</span>
                  <textarea
                    rows={2}
                    value={selected.art.notesRu ?? ""}
                    onChange={(e) =>
                      patchSelectedArt({ notesRu: e.target.value })
                    }
                  />
                </label>
                <label className="ember-art-sheet__nsfw">
                  <input
                    type="checkbox"
                    checked={Boolean(selected.art.nsfw)}
                    onChange={(e) =>
                      patchSelectedArt({ nsfw: e.target.checked })
                    }
                  />
                  <span>NSFW</span>
                </label>
              </div>

              <div className="ember-art-sheet__actions">
                <button
                  type="button"
                  className="primary"
                  onClick={() => void saveRegistry()}
                >
                  Сохранить
                </button>
                <button
                  type="button"
                  className="ghost ember-danger"
                  onClick={() => void removeArt(selected.art)}
                >
                  Удалить
                </button>
              </div>
            </div>
          ) : (
            <div className="ember-ed-card">
              <h3 className="ember-ed-card__title">
                {selected.type === "sprite"
                  ? "Спрайт"
                  : selected.type === "tile"
                    ? "Тайл"
                    : "Портрет"}
              </h3>

              <button
                type="button"
                className="ember-inspector-preview-btn"
                title="На весь экран"
                onClick={() => openLightboxFor(selected)}
              >
                {thumbSrc(selected) ? (
                  <img
                    className="ember-inspector-preview"
                    src={thumbSrc(selected)}
                    alt=""
                  />
                ) : (
                  <div
                    className="ember-inspector-preview ember-lib-card__swatch"
                    style={{
                      background:
                        selected.type === "tile"
                          ? selected.color
                          : selected.type === "sprite"
                            ? selected.sprite.color
                            : "#2a2018",
                    }}
                  />
                )}
                <span className="ember-inspector-preview-hint">Открыть</span>
              </button>

              {selected.type === "sprite" ? (
                <div className="ember-ed-form">
                  <label>
                    id
                    <input value={selected.sprite.id} disabled />
                  </label>
                  <label>
                    Имя
                    <input value={selected.sprite.nameRu ?? ""} disabled />
                  </label>
                  <label>
                    Размер
                    <input
                      value={`${selected.sprite.width}×${spriteTotalHeight(selected.sprite)}`}
                      disabled
                    />
                  </label>
                  <p className="muted ember-hint">
                    Удаление и правка пикселей — в редакторе спрайтов.
                  </p>
                </div>
              ) : null}

              {selected.type === "tile" ? (
                <div className="ember-ed-form">
                  <label>
                    tileset
                    <input value={selected.tilesetId} disabled />
                  </label>
                  <label>
                    tile id
                    <input value={String(selected.tileId)} disabled />
                  </label>
                  <label>
                    Имя
                    <input value={selected.name} disabled />
                  </label>
                  <p className="muted ember-hint">
                    Правка пикселей — в редакторе тайлов.
                  </p>
                </div>
              ) : null}

              {selected.type === "portrait" ? (
                <div className="ember-ed-form">
                  <label>
                    Госпожа
                    <input value={selected.mistressId} disabled />
                  </label>
                  <label>
                    Выражение
                    <input value={selected.expressionKey} disabled />
                  </label>
                  <label>
                    path
                    <input value={selected.path} disabled />
                  </label>
                </div>
              ) : null}

              <div className="ember-chip-row">
                {selected.type === "sprite" || selected.type === "tile" ? (
                  <button
                    type="button"
                    className="primary"
                    onClick={() => goEdit(selected)}
                  >
                    Редактировать
                  </button>
                ) : null}
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    const id =
                      selected.type === "sprite"
                        ? selected.sprite.id
                        : selected.type === "tile"
                          ? String(selected.tileId)
                          : selected.key;
                    void copyText(id).then((ok) =>
                      onSaved(
                        ok ? `Скопирован id: ${id}` : "Не удалось скопировать",
                      ),
                    );
                  }}
                >
                  Копировать id
                </button>
              </div>
            </div>
          )}
        </aside>
      ) : null}

      {dragOver && !importSession ? (
        <div className="ember-lib-dropveil" aria-hidden>
          <div className="ember-lib-dropveil__card">
            <strong>
              {importBlocked
                ? "Сначала выйдите из «Тайлы» / «Спрайты»"
                : "Отпусти — импорт арта"}
            </strong>
            <span className="muted">
              {importBlocked
                ? "Файлы артов сюда не принимаются"
                : kindFromFilter(filter)
                  ? `Раздел: ${KIND_LABELS[kindFromFilter(filter)!]}`
                  : "Дальше выберешь раздел"}
            </span>
          </div>
        </div>
      ) : null}

      {importSession ? (
        <div
          className="ember-lib-import"
          role="dialog"
          aria-modal="true"
          aria-label="Импорт арта"
        >
          <div className="ember-lib-import__stage">
            <img src={importSession.url} alt="" />
          </div>
          <aside className="ember-lib-import__panel">
            <header className="ember-lib-import__head">
              <p className="ember-art-sheet__eyebrow">Импорт</p>
              <h3>Новый арт</h3>
              <p className="muted ember-hint">
                {importSession.file.name} ·{" "}
                {(importSession.file.size / 1024).toFixed(0)} KB
              </p>
            </header>

            {importSession.fromFilter && importSession.kind ? (
              <p className="ember-lib-import__banner">
                В раздел «{KIND_LABELS[importSession.kind]}» — подтверди или
                смени ниже
              </p>
            ) : (
              <p className="ember-lib-import__banner ember-lib-import__banner--ask">
                Выбери раздел библиотеки
              </p>
            )}

            <label className="ember-art-sheet__field">
              <span>id</span>
              <input
                value={importSession.draftId}
                disabled={importing}
                onChange={(e) =>
                  setImportSession((s) =>
                    s ? { ...s, draftId: e.target.value } : s,
                  )
                }
              />
            </label>

            <div className="ember-lib-import__kinds" role="group" aria-label="Раздел">
              {ART_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`ember-lib-import__kind${
                    importSession.kind === k ? " is-active" : ""
                  }`}
                  disabled={importing}
                  onClick={() =>
                    setImportSession((s) => (s ? { ...s, kind: k } : s))
                  }
                >
                  {KIND_LABELS[k]}
                </button>
              ))}
            </div>

            <label className="ember-art-sheet__nsfw">
              <input
                type="checkbox"
                checked={importSession.nsfw}
                disabled={importing}
                onChange={(e) =>
                  setImportSession((s) =>
                    s ? { ...s, nsfw: e.target.checked } : s,
                  )
                }
              />
              <span>NSFW</span>
            </label>

            <div className="ember-lib-import__actions">
              <button
                type="button"
                className="primary"
                disabled={
                  importing || mustPickKind || !importSession.draftId.trim()
                }
                onClick={() => void register()}
              >
                {importing ? "Импорт…" : "Зарегистрировать"}
              </button>
              <button
                type="button"
                className="ghost"
                disabled={importing}
                onClick={clearImport}
              >
                Отмена
              </button>
            </div>
          </aside>
        </div>
      ) : null}

      {lightbox ? (
        <div
          className="ember-art-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.title}
          onClick={() => setLightbox(null)}
        >
          <div
            className="ember-art-lightbox__toolbar"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ember-art-lightbox__titles">
              <strong>{lightbox.title}</strong>
              {lightbox.subtitle ? (
                <span className="muted">{lightbox.subtitle}</span>
              ) : null}
            </div>
            <button
              type="button"
              className="ember-art-lightbox__close"
              onClick={() => setLightbox(null)}
            >
              Закрыть
            </button>
          </div>
          <img
            className="ember-art-lightbox__img"
            src={lightbox.src ?? (lightbox.path ? assetUrl(lightbox.path) : "")}
            alt={lightbox.title}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </div>
  );
}
