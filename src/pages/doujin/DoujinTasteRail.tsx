import { useEffect, useMemo, useRef, useState } from "react";
import { tagGroupLabel } from "../../lib/doujin/normalize";
import {
  isTasteTag,
  scoreTagNameMatch,
  tagToQueryTerm,
  tasteTagKey,
} from "../../lib/doujin/query";
import { normalizeTagName } from "../../lib/doujin/safety";
import {
  formatTasteSyncProgress,
  tasteSyncProgressRatio,
  type TasteSyncStatus,
} from "../../lib/doujin/tasteSync";
import type {
  DoujinTag,
  DoujinTagType,
} from "../../lib/doujin/types";

const RAIL_TYPES: readonly DoujinTagType[] = [
  "parody",
  "character",
  "artist",
  "group",
  "tag",
  "language",
  "category",
  "unknown",
];

const COLLAPSE_KEY = "joi-doujin-taste-rail-collapsed-v1";
const SUGGEST_LIMIT = 12;

export type RailRow = { tag: DoujinTag; count: number; loved: boolean };

export type RailGroup = {
  id: string;
  label: string;
  rows: RailRow[];
};

function tagCount(tag: DoujinTag): number {
  return typeof tag.count === "number" && Number.isFinite(tag.count) && tag.count > 0
    ? Math.floor(tag.count)
    : 0;
}

function collectRailMap(
  tags: readonly DoujinTag[],
  lovedTags: readonly DoujinTag[],
): Map<string, { tag: DoujinTag; count: number }> {
  const map = new Map<string, { tag: DoujinTag; count: number }>();
  for (const tag of tags) {
    const name = normalizeTagName(tag.name);
    if (!name) continue;
    const key = `${tag.type}:${name}`;
    const add = tagCount(tag);
    const prev = map.get(key);
    if (prev) prev.count += add;
    else map.set(key, { tag: { ...tag, name }, count: add });
  }
  for (const tag of lovedTags) {
    const key = tasteTagKey(tag);
    if (!key.endsWith(":") && !map.has(key)) {
      map.set(key, { tag, count: 0 });
    }
  }
  return map;
}

export function buildRailGroups(
  tags: readonly DoujinTag[],
  lovedTags: readonly DoujinTag[],
  sortTags: readonly DoujinTag[] = [],
): RailGroup[] {
  const lovedKeys = new Set(lovedTags.map((tag) => tasteTagKey(tag)));
  const sortKeys = new Set(sortTags.map((tag) => tasteTagKey(tag)));
  const map = collectRailMap(tags, [...lovedTags, ...sortTags]);
  const byCount = (a: RailRow, b: RailRow) =>
    b.count - a.count || a.tag.name.localeCompare(b.tag.name);
  const groups: RailGroup[] = [];
  const sortRows = sortTags
    .map((tag) => {
      const row = map.get(tasteTagKey(tag));
      return row
        ? { ...row, loved: lovedKeys.has(tasteTagKey(row.tag)) }
        : { tag, count: 0, loved: lovedKeys.has(tasteTagKey(tag)) };
    })
    .filter((row) => !tasteTagKey(row.tag).endsWith(":"));
  if (sortRows.length > 0) {
    groups.push({ id: "sort", label: "Сортировка", rows: sortRows });
  }
  const lovedRows = [...map.values()]
    .filter(
      (row) =>
        lovedKeys.has(tasteTagKey(row.tag)) &&
        !sortKeys.has(tasteTagKey(row.tag)),
    )
    .map((row) => ({ ...row, loved: true }))
    .sort(byCount);
  groups.push({ id: "loved", label: "Любимые", rows: lovedRows });
  for (const type of RAIL_TYPES) {
    const rows = [...map.values()]
      .filter(
        (row) =>
          row.tag.type === type &&
          !lovedKeys.has(tasteTagKey(row.tag)) &&
          !sortKeys.has(tasteTagKey(row.tag)),
      )
      .map((row) => ({ ...row, loved: false }))
      .sort(byCount);
    if (rows.length === 0) continue;
    groups.push({ id: type, label: tagGroupLabel(type), rows });
  }
  return groups;
}

export function suggestTasteRailTags(
  rows: readonly RailRow[],
  query: string,
  limit = SUGGEST_LIMIT,
): RailRow[] {
  const q = normalizeTagName(query);
  if (!q) return [];
  const scored: Array<{ row: RailRow; score: number }> = [];
  for (const row of rows) {
    const score = scoreTagNameMatch(row.tag.name, q);
    if (score < 0) continue;
    scored.push({ row, score });
  }
  scored.sort(
    (a, b) =>
      a.score - b.score ||
      b.row.count - a.row.count ||
      a.row.tag.name.localeCompare(b.row.tag.name),
  );
  const seen = new Set<string>();
  const out: RailRow[] = [];
  for (const { row } of scored) {
    const key = tasteTagKey(row.tag);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
    if (out.length >= limit) break;
  }
  return out;
}

export function filterRailGroups(
  groups: readonly RailGroup[],
  query: string,
): RailGroup[] {
  const q = normalizeTagName(query);
  if (!q) return [...groups];
  return groups
    .map((group) => ({
      ...group,
      rows: group.rows.filter((row) => scoreTagNameMatch(row.tag.name, q) >= 0),
    }))
    .filter(
      (group) =>
        group.rows.length > 0 || group.id === "loved" || group.id === "sort",
    );
}

function loadCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed.filter((id): id is string => typeof id === "string" && id.length > 0),
    );
  } catch {
    return new Set();
  }
}

function persistCollapsed(ids: ReadonlySet<string>): void {
  try {
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...ids]));
  } catch {
    /* quota / private mode */
  }
}

type Props = {
  tags: readonly DoujinTag[];
  lovedTags: readonly DoujinTag[];
  sortTags: readonly DoujinTag[];
  sampled: number;
  total: number;
  complete: boolean;
  busy: boolean;
  sync: TasteSyncStatus;
  onSearch: (query: string) => void;
  onToggleLoved: (tag: DoujinTag) => void;
  onToggleSort: (tag: DoujinTag) => void;
  onMoveSort: (from: number, to: number) => void;
  onSync: () => void;
};

export function DoujinTasteRail({
  tags,
  lovedTags,
  sortTags,
  sampled,
  total,
  complete,
  busy,
  sync,
  onSearch,
  onToggleLoved,
  onToggleSort,
  onMoveSort,
  onSync,
}: Props) {
  const groups = useMemo(
    () => buildRailGroups(tags, lovedTags, sortTags),
    [lovedTags, sortTags, tags],
  );
  const allRows = useMemo(
    () => groups.flatMap((group) => group.rows),
    [groups],
  );
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const [find, setFind] = useState("");
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const findWrapRef = useRef<HTMLDivElement>(null);
  const filtering = Boolean(normalizeTagName(find));
  const visibleGroups = useMemo(
    () => filterRailGroups(groups, find),
    [find, groups],
  );

  const suggestions = useMemo(
    () => suggestTasteRailTags(allRows, find),
    [allRows, find],
  );
  const showSuggest = suggestOpen && suggestions.length > 0;

  useEffect(() => {
    if (!showSuggest) return;
    const onPtr = (event: PointerEvent) => {
      const root = findWrapRef.current;
      if (root && !root.contains(event.target as Node)) {
        setSuggestOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPtr);
    return () => document.removeEventListener("pointerdown", onPtr);
  }, [showSuggest]);

  const hint = complete && sampled > 0
    ? `Счётчики по ${sampled} избранного, сохранены локально. Звезда поднимает тег в рекомендациях.`
    : sampled > 0
      ? `Счётчики — по выборке ${sampled}${total > sampled ? ` из ${total}` : ""} избранного, не по всему аккаунту. «Синхронизация вкусов» доберёт остальные. Звезда поднимает тег в рекомендациях.`
      : busy
        ? "Считаем теги по выборке избранного…"
        : "Теги появятся после загрузки выборки избранного. Звезда — любимый тег для рекомендаций.";
  const syncLabel = sync.running
    ? "Синхронизация…"
    : complete
      ? "Обновить каталог"
      : "Синхронизировать каталог";
  const syncText = formatTasteSyncProgress(sync);
  const syncRatio = tasteSyncProgressRatio(sync);
  const syncTitle = sync.error
    ? sync.error
    : sync.running
      ? syncText || "Идёт синхронизация — ~8 с на страницу из‑за лимита API"
      : complete
        ? "Синхронизация вкусов: добрать новые избранные и превью"
        : "Синхронизация вкусов: обойти всё избранное и сохранить локально";

  const toggleGroup = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      persistCollapsed(next);
      return next;
    });
  };

  const pickSuggestion = (row: RailRow) => {
    setFind(row.tag.name);
    setSuggestOpen(false);
    setActiveIndex(0);
  };

  return (
    <aside className="doujin-taste-rail" aria-label="Теги избранного">
      <div className="doujin-taste-rail__find" ref={findWrapRef}>
        <input
          type="search"
          value={find}
          placeholder="Найти тег…"
          autoComplete="off"
          aria-label="Поиск тегов избранного"
          aria-autocomplete="list"
          aria-expanded={showSuggest}
          aria-controls="doujin-taste-suggest"
          role="combobox"
          onChange={(event) => {
            setFind(event.target.value);
            setSuggestOpen(true);
            setActiveIndex(0);
          }}
          onFocus={() => setSuggestOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setSuggestOpen(false);
              return;
            }
            if (!suggestions.length) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setSuggestOpen(true);
              setActiveIndex((i) => (i + 1) % suggestions.length);
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setSuggestOpen(true);
              setActiveIndex(
                (i) => (i - 1 + suggestions.length) % suggestions.length,
              );
              return;
            }
            if (event.key === "Enter") {
              const row = suggestions[activeIndex] ?? suggestions[0];
              if (!row) return;
              event.preventDefault();
              pickSuggestion(row);
            }
          }}
        />
        {showSuggest ? (
          <ul
            id="doujin-taste-suggest"
            className="doujin-taste-rail__suggest"
            role="listbox"
          >
            {suggestions.map((row, index) => {
              const key = tasteTagKey(row.tag);
              return (
                <li key={key} role="presentation">
                  <button
                    type="button"
                    className={
                      "doujin-taste-rail__suggest-item" +
                      (index === activeIndex ? " is-active" : "")
                    }
                    role="option"
                    aria-selected={index === activeIndex}
                    onMouseEnter={() => setActiveIndex(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => pickSuggestion(row)}
                  >
                    <span>{row.tag.name}</span>
                    <span>{tagGroupLabel(row.tag.type)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
      <div className="doujin-taste-sync">
        <button
          type="button"
          className={
            "doujin-taste-rail__sync" +
            (sync.running ? " is-busy" : "") +
            (complete ? " is-done" : "")
          }
          title={syncTitle}
          aria-label={syncLabel}
          disabled={sync.running}
          onClick={onSync}
        >
          {syncLabel}
        </button>
        {sync.running || sync.error ? (
          <div
            className={
              "doujin-taste-sync__panel" + (sync.error ? " is-error" : "")
            }
            role="status"
            aria-live="polite"
          >
            <div
              className="doujin-taste-sync__track"
              aria-hidden={!sync.running}
            >
              <span
                className={
                  "doujin-taste-sync__fill" +
                  (sync.running && sync.phase === "names" ? " is-pulse" : "")
                }
                style={{ width: `${Math.round(syncRatio * 100)}%` }}
              />
            </div>
            <p className="doujin-taste-sync__msg">
              {syncText || "Синхронизация вкусов…"}
            </p>
          </div>
        ) : null}
      </div>
      {visibleGroups.map((group) => {
        const isCollapsed = filtering ? false : collapsed.has(group.id);
        const listId = `doujin-taste-${group.id}`;
        const loved = group.id === "loved";
        const ranking = group.id === "sort";
        return (
          <section key={group.id} className="doujin-taste-rail__group">
            <h3 className="doujin-taste-rail__title">
              <button
                type="button"
                className="doujin-taste-rail__toggle"
                aria-expanded={!isCollapsed}
                aria-controls={listId}
                onClick={() => toggleGroup(group.id)}
              >
                <span className="doujin-taste-rail__chevron" aria-hidden>
                  {isCollapsed ? "▸" : "▾"}
                </span>
                <span>{group.label}</span>
                <span className="doujin-taste-rail__n">{group.rows.length}</span>
              </button>
              {loved ? (
                <span
                  className="doujin-taste-rail__info"
                  title={hint}
                  aria-label={hint}
                  tabIndex={0}
                >
                  i
                </span>
              ) : null}
            </h3>
            {isCollapsed ? null : (
              <ul id={listId} className="doujin-taste-rail__list">
                {group.rows.map((row) => {
                  const key = tasteTagKey(row.tag);
                  const query = tagToQueryTerm(row.tag);
                  const canLove = isTasteTag(row.tag);
                  const sorted = ranking;
                  const sortIndex = sortTags.findIndex(
                    (tag) => tasteTagKey(tag) === key,
                  );
                  return (
                    <li
                      key={key}
                      className={
                        "doujin-taste-row" +
                        (sorted ? " doujin-taste-row--rank" : "")
                      }
                    >
                      <button
                        type="button"
                        className="doujin-taste-row__name"
                        title={
                          sorted
                            ? "Убрать из сортировки избранного"
                            : "Сортировать избранное по тегу"
                        }
                        onClick={() => onToggleSort(row.tag)}
                      >
                        {row.tag.name}
                      </button>
                      <span className="doujin-taste-row__count">
                        {row.count > 0 ? row.count : "—"}
                      </span>
                      {sorted ? (
                        <span className="doujin-taste-row__move">
                          <button
                            type="button"
                            className="doujin-taste-row__nudge"
                            aria-label="Выше в сортировке"
                            title="Выше в сортировке"
                            disabled={sortIndex <= 0}
                            onClick={() => onMoveSort(sortIndex, sortIndex - 1)}
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            className="doujin-taste-row__nudge"
                            aria-label="Ниже в сортировке"
                            title="Ниже в сортировке"
                            disabled={sortIndex >= sortTags.length - 1}
                            onClick={() => onMoveSort(sortIndex, sortIndex + 1)}
                          >
                            ▼
                          </button>
                        </span>
                      ) : null}
                      <button
                        type="button"
                        className="doujin-taste-row__search"
                        aria-label={`Искать ${query}`}
                        title={`Искать ${query}`}
                        onClick={() => onSearch(query)}
                      >
                        ⌕
                      </button>
                      {canLove ? (
                        <button
                          type="button"
                          className={
                            "doujin-taste-row__star" + (row.loved ? " is-on" : "")
                          }
                          aria-pressed={row.loved}
                          title={
                            row.loved
                              ? "Убрать из любимых тегов"
                              : "В любимые теги — больше вес в рекомендациях"
                          }
                          onClick={() => onToggleLoved(row.tag)}
                        >
                          {row.loved ? "★" : "☆"}
                        </button>
                      ) : (
                        <span className="doujin-taste-row__star" aria-hidden />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </aside>
  );
}

export function DoujinSyncToast({ sync }: { sync: TasteSyncStatus }) {
  const [hold, setHold] = useState(false);
  const wasRunning = useRef(false);

  useEffect(() => {
    if (sync.running) {
      wasRunning.current = true;
      setHold(true);
      return;
    }
    if (!wasRunning.current) return;
    wasRunning.current = false;
    setHold(true);
    if (sync.error) return;
    const timer = window.setTimeout(() => setHold(false), 8000);
    return () => window.clearTimeout(timer);
  }, [sync.running, sync.error, sync.complete]);

  const text = formatTasteSyncProgress(sync);
  if (!text || (!sync.running && !sync.error && !hold)) return null;

  return (
    <div
      className={
        "doujin-toast" +
        (sync.error ? " is-error" : sync.running ? " is-live" : " is-done")
      }
      role="status"
      aria-live="polite"
    >
      <span className="doujin-toast__kicker">
        {sync.running ? "Синхронизация" : sync.error ? "Ошибка" : "Готово"}
      </span>
      <span className="doujin-toast__text">{text}</span>
    </div>
  );
}

