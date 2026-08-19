import { useEffect, useMemo, useRef, useState } from "react";
import {
  emberAssetUrl,
  writeEmberBytes,
  writeEmberJson,
  writeEmberText,
  type EmberPack,
} from "../../../game";
import type { EmberArt, EmberArtKind } from "../../../game/content/types";

const KIND_LABELS: Record<EmberArtKind, string> = {
  splash: "Splash",
  cg: "CG",
  portrait: "Портрет",
  pixel: "Пиксель",
  animation: "Анимация",
  other: "Другое",
};

const ACCEPT =
  ".svg,image/svg+xml,image/png,image/webp,image/jpeg,.png,.webp,.jpg,.jpeg";

type Props = {
  pack: EmberPack;
  value: string;
  onChange: (artId: string) => void;
  onArtsChange?: (arts: EmberArt[]) => void;
  onStatus?: (msg: string) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
  preferredKinds?: EmberArtKind[];
  label?: string;
  /** Collapsed strip + expandable horizontal gallery (scene editor). */
  compact?: boolean;
};

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

/** Visual art picker — compact strip for scenes, full grid optional. */
export function EmberArtPicker({
  pack,
  value,
  onChange,
  onArtsChange,
  onStatus,
  allowEmpty = false,
  emptyLabel = "— нет —",
  preferredKinds,
  label = "Арт",
  compact = false,
}: Props) {
  const [filter, setFilter] = useState<"all" | EmberArtKind>("all");
  const [importing, setImporting] = useState(false);
  const [assetRev, setAssetRev] = useState(() => Date.now());
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(!compact);
  const panelRef = useRef<HTMLDivElement>(null);

  const arts = useMemo(() => Object.values(pack.arts), [pack.arts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const preferred = preferredKinds ?? [];
    return arts
      .filter((a) => {
        const kind = a.kind ?? "other";
        if (filter !== "all" && kind !== filter) return false;
        if (!q) return true;
        return (
          a.id.toLowerCase().includes(q) ||
          (a.captionRu ?? "").toLowerCase().includes(q) ||
          (a.tags ?? []).some((t) => t.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        const ap = preferred.includes(a.kind ?? "other") ? 0 : 1;
        const bp = preferred.includes(b.kind ?? "other") ? 0 : 1;
        if (ap !== bp) return ap - bp;
        return a.id.localeCompare(b.id);
      });
  }, [arts, filter, query, preferredKinds]);

  const selected = value ? pack.arts[value] : null;
  const missing = Boolean(value) && !selected;

  useEffect(() => {
    if (!compact || !open) return;
    const onDoc = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [compact, open]);

  const importFile = async (file: File) => {
    if (!onArtsChange) return;
    setImporting(true);
    try {
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const ext = extFromFile(file, safeName);
      const id =
        safeName.replace(/\.\w+$/, "") ||
        `art_${Math.random().toString(36).slice(2, 7)}`;
      const path = `arts/files/${id}.${ext}`;
      const svg = isSvgFile(file, safeName);
      const writeRes = svg
        ? await writeEmberText(path, await file.text())
        : await writeEmberBytes(path, new Uint8Array(await file.arrayBuffer()));
      if (!writeRes.ok) {
        onStatus?.(`Файл: ${writeRes.error}`);
        return;
      }
      const art: EmberArt = {
        id,
        path,
        mistressId: "hu_tao",
        nsfw: false,
        kind: preferredKinds?.[0] ?? "cg",
        captionRu: "",
      };
      const next = [...arts.filter((a) => a.id !== art.id), art];
      onArtsChange(next);
      const reg = await writeEmberJson("arts/registry.json", { arts: next });
      setAssetRev(Date.now());
      onChange(art.id);
      setOpen(false);
      onStatus?.(
        reg.ok
          ? `Импорт «${art.id}» и выбран (${writeRes.source})`
          : `Импорт файла ок, registry: ${"error" in reg ? reg.error : "?"}`,
      );
    } finally {
      setImporting(false);
    }
  };

  const pick = (id: string) => {
    onChange(id);
    if (compact) setOpen(false);
  };

  const gallery = (
    <div className="ember-art-picker__panel">
      <div className="ember-art-picker__tools">
        <input
          className="ember-art-picker__search"
          type="search"
          placeholder="Поиск…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="ember-chip-row ember-art-picker__filters">
          <button
            type="button"
            className={`ember-chip ember-chip--sm ${filter === "all" ? "is-active" : ""}`}
            onClick={() => setFilter("all")}
          >
            Все
          </button>
          {(Object.keys(KIND_LABELS) as EmberArtKind[]).map((k) => (
            <button
              key={k}
              type="button"
              className={`ember-chip ember-chip--sm ${filter === k ? "is-active" : ""}`}
              onClick={() => setFilter(k)}
            >
              {KIND_LABELS[k]}
            </button>
          ))}
        </div>
      </div>

      {missing ? (
        <p className="ember-error ember-art-picker__missing">
          Арт «{value}» не найден — выбери другой или импортируй
        </p>
      ) : null}

      <div className="ember-art-picker__rail" role="listbox" aria-label={label}>
        {allowEmpty ? (
          <button
            type="button"
            role="option"
            aria-selected={!value}
            className={`ember-art-picker__tile ${!value ? "is-active" : ""}`}
            onClick={() => pick("")}
            title={emptyLabel}
          >
            <span className="ember-art-picker__none">∅</span>
            <span className="ember-art-picker__tile-label">{emptyLabel}</span>
          </button>
        ) : null}
        {filtered.map((a) => (
          <button
            key={a.id}
            type="button"
            role="option"
            aria-selected={value === a.id}
            className={`ember-art-picker__tile ${value === a.id ? "is-active" : ""}`}
            onClick={() => pick(a.id)}
            title={a.captionRu || a.id}
          >
            <img src={emberAssetUrl(a.path, assetRev)} alt="" />
            <span className="ember-art-picker__tile-label">{a.id}</span>
          </button>
        ))}
        {filtered.length === 0 ? (
          <p className="muted ember-art-picker__empty">Пусто</p>
        ) : null}
      </div>
    </div>
  );

  return (
    <div
      ref={panelRef}
      className={`ember-art-picker${compact ? " ember-art-picker--compact" : ""}${open ? " is-open" : ""}`}
    >
      <div className="ember-art-picker__head">
        <span className="ember-art-picker__label">{label}</span>
        <div className="ember-art-picker__head-actions">
          {onArtsChange ? (
            <label className="ember-art-picker__import">
              {importing ? "…" : "+ файл"}
              <input
                type="file"
                accept={ACCEPT}
                disabled={importing}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void importFile(f);
                  e.target.value = "";
                }}
              />
            </label>
          ) : null}
          {compact ? (
            <button
              type="button"
              className="ember-art-picker__toggle"
              onClick={() => setOpen((v) => !v)}
            >
              {open ? "Скрыть" : "Сменить"}
            </button>
          ) : null}
        </div>
      </div>

      {compact ? (
        <button
          type="button"
          className={`ember-art-picker__current${missing ? " is-missing" : ""}`}
          onClick={() => setOpen((v) => !v)}
        >
          {selected ? (
            <img src={emberAssetUrl(selected.path, assetRev)} alt="" />
          ) : (
            <span className="ember-art-picker__none">∅</span>
          )}
          <span className="ember-art-picker__current-meta">
            <strong>
              {selected?.id || (value ? value : emptyLabel)}
            </strong>
            <span className="muted">
              {missing
                ? "файл не найден"
                : selected
                  ? KIND_LABELS[selected.kind ?? "other"]
                  : "нажми чтобы выбрать"}
            </span>
          </span>
        </button>
      ) : null}

      {open ? gallery : null}
    </div>
  );
}
