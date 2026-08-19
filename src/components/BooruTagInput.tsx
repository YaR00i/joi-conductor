import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type { ContentUnlockLists } from "../lib/contentUnlocks";
import {
  tagPurchaseStatus,
  type TagPurchaseStatus,
} from "../lib/contentUnlocks";
import {
  fetchGelbooruTagAutocomplete,
  type GelbooruTagSuggest,
} from "../lib/media";
import {
  collectFavoriteTagStats,
  listFavoriteRecords,
} from "../lib/mediaFavorites";

const EMPTY_UI_UNLOCKS: ContentUnlockLists = {
  fetishIds: [],
  characterIds: [],
  mediaTypeIds: [],
  modeIds: [],
  moodIds: [],
  unlockedTags: [],
  pendingShopTags: [],
};

type BooruTagInputProps = {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Prefer Gelbooru network suggest (default true). */
  useGelbooru?: boolean;
  /** Shop unlocks — used to show ✓ / ✗ for gated tags. */
  unlocks?: ContentUnlockLists;
};

type SuggestRow = GelbooruTagSuggest & {
  key: string;
  purchase?: TagPurchaseStatus;
};

type TagToken = {
  start: number;
  end: number;
  raw: string;
  neg: boolean;
  query: string;
};

function formatCount(n: number | undefined): string {
  if (n == null || !Number.isFinite(n)) return "";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

function isTagChar(ch: string): boolean {
  return ch !== " " && ch !== "\t" && ch !== "\n" && ch !== "\r";
}

function clampCaret(value: string, caret: number): number {
  if (!Number.isFinite(caret)) return value.length;
  return Math.max(0, Math.min(Math.floor(caret), value.length));
}

function tokenBoundsAt(value: string, index: number): { start: number; end: number } {
  const n = value.length;
  let i = clampCaret(value, index);
  if (n === 0) return { start: 0, end: 0 };
  if (i >= n) i = n - 1;
  if (!isTagChar(value[i]!)) {
    return { start: i, end: i };
  }
  let start = i;
  while (start > 0 && isTagChar(value[start - 1]!)) start -= 1;
  let end = i + 1;
  while (end < n && isTagChar(value[end]!)) end += 1;
  return { start, end };
}

/**
 * Token under caret for Gelbooru-style space-separated tags.
 * - Inside a tag → that tag (supports leading `-`).
 * - Right after a tag (before/on the following space) → that same tag.
 * - Deeper in a whitespace gap → the following tag (click-to-edit).
 * - Trailing whitespace / empty → new empty token at caret.
 */
function tokenAtCaret(value: string, caret: number): TagToken {
  const n = value.length;
  const pos = clampCaret(value, caret);

  if (n === 0) {
    return { start: 0, end: 0, raw: "", neg: false, query: "" };
  }

  let anchor = pos;

  if (pos < n && isTagChar(value[pos]!)) {
    anchor = pos;
  } else if (pos > 0 && isTagChar(value[pos - 1]!)) {
    // Caret glued to the end of a tag — keep that tag (typing / finished word).
    anchor = pos - 1;
  } else {
    // Whitespace not adjacent to a tag end: prefer the next tag if present.
    let look = pos;
    while (look < n && !isTagChar(value[look]!)) look += 1;
    if (look < n) {
      anchor = look;
    } else {
      return { start: pos, end: pos, raw: "", neg: false, query: "" };
    }
  }

  const { start, end } = tokenBoundsAt(value, anchor);
  const raw = value.slice(start, end);
  const neg = raw.startsWith("-");
  const query = (neg ? raw.slice(1) : raw).trim().toLowerCase();
  return { start, end, raw, neg, query };
}

export function BooruTagInput({
  value,
  onChange,
  placeholder,
  disabled = false,
  className = "",
  useGelbooru = true,
  unlocks = EMPTY_UI_UNLOCKS,
}: BooruTagInputProps) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [rows, setRows] = useState<SuggestRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [caret, setCaret] = useState(() => value.length);
  const favCacheRef = useRef<{ tag: string; count: number }[] | null>(null);
  const reqGenRef = useRef(0);
  const caretRef = useRef(caret);
  caretRef.current = caret;
  const focusedRef = useRef(false);

  const closeSuggest = useCallback(() => {
    reqGenRef.current += 1;
    setOpen(false);
    setLoading(false);
  }, []);

  const syncCaretFromInput = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const next = el.selectionStart ?? el.value.length;
    setCaret((prev) => (prev === next ? prev : next));
  }, []);

  const loadFavorites = useCallback(async () => {
    if (favCacheRef.current) return favCacheRef.current;
    try {
      const records = await listFavoriteRecords();
      const stats = collectFavoriteTagStats(records);
      favCacheRef.current = stats;
      return stats;
    } catch {
      favCacheRef.current = [];
      return [];
    }
  }, []);

  const refreshSuggest = useCallback(
    async (query: string) => {
      const gen = ++reqGenRef.current;
      if (query.length < 1) {
        setRows([]);
        setOpen(false);
        setLoading(false);
        return;
      }

      setLoading(true);
      const favs = await loadFavorites();
      if (reqGenRef.current !== gen || !focusedRef.current) {
        setLoading(false);
        return;
      }
      const local = favs
        .filter((f) => f.tag.toLowerCase().includes(query))
        .slice(0, 8)
        .map(
          (f): SuggestRow => ({
            key: `fav:${f.tag}`,
            value: f.tag,
            label: f.tag.replace(/_/g, " "),
            postCount: f.count,
            fromFavorites: true,
          }),
        );

      let remote: SuggestRow[] = [];
      if (useGelbooru) {
        try {
          const hits = await fetchGelbooruTagAutocomplete(query, 12);
          if (reqGenRef.current !== gen || !focusedRef.current) {
            setLoading(false);
            return;
          }
          remote = hits.map((h) => ({
            ...h,
            key: `gb:${h.value}`,
          }));
        } catch {
          /* offline / rate — keep local */
        }
      }

      if (reqGenRef.current !== gen || !focusedRef.current) {
        setLoading(false);
        return;
      }

      const seen = new Set<string>();
      const merged: SuggestRow[] = [];
      for (const row of [...local, ...remote]) {
        const k = row.value.toLowerCase();
        if (seen.has(k)) {
          const existing = merged.find((m) => m.value.toLowerCase() === k);
          if (existing && row.fromFavorites) existing.fromFavorites = true;
          continue;
        }
        seen.add(k);
        merged.push({
          ...row,
          purchase: tagPurchaseStatus(row.value, unlocks),
        });
      }

      merged.sort((a, b) => {
        if (a.fromFavorites !== b.fromFavorites) {
          return a.fromFavorites ? -1 : 1;
        }
        return (b.postCount ?? 0) - (a.postCount ?? 0);
      });

      setRows(merged.slice(0, 14));
      setActive(0);
      setOpen(merged.length > 0 && focusedRef.current);
      setLoading(false);
    },
    [loadFavorites, unlocks, useGelbooru],
  );

  useEffect(() => {
    if (disabled || !focusedRef.current) return;
    const { query } = tokenAtCaret(value, caret);
    const t = window.setTimeout(() => {
      if (!focusedRef.current) return;
      void refreshSuggest(query);
    }, 160);
    return () => window.clearTimeout(t);
  }, [value, caret, disabled, refreshSuggest]);

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node | null;
      if (!t) return;
      if (wrapRef.current?.contains(t)) return;
      focusedRef.current = false;
      closeSuggest();
      // Drop focus so a later Gelbooru reply can't reopen the list
      if (document.activeElement === inputRef.current) {
        inputRef.current?.blur();
      }
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", onPointerDown, true);
  }, [closeSuggest]);

  function applySuggestion(row: SuggestRow) {
    const el = inputRef.current;
    const caretNow = el?.selectionStart ?? caretRef.current;
    const { start, end, neg } = tokenAtCaret(value, caretNow);
    const token = `${neg ? "-" : ""}${row.value}`;
    const next = `${value.slice(0, start)}${token} ${value.slice(end).replace(/^\s*/, "")}`;
    const pos = start + token.length + 1;
    onChange(next);
    setCaret(pos);
    setOpen(false);
    window.requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(pos, pos);
      setCaret(pos);
    });
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open || rows.length === 0) {
      if (e.key === "Escape") setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % rows.length);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + rows.length) % rows.length);
      return;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      const row = rows[active];
      if (row) {
        e.preventDefault();
        applySuggestion(row);
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div
      ref={wrapRef}
      className={`booru-tag-input${className ? ` ${className}` : ""}`}
    >
      <input
        ref={inputRef}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        onChange={(e) => {
          const next = e.target.value;
          const nextCaret = e.target.selectionStart ?? next.length;
          setCaret(nextCaret);
          onChange(next);
        }}
        onKeyDown={onKeyDown}
        onKeyUp={syncCaretFromInput}
        onClick={syncCaretFromInput}
        onSelect={syncCaretFromInput}
        onFocus={() => {
          focusedRef.current = true;
          syncCaretFromInput();
          const el = inputRef.current;
          const caretNow = el?.selectionStart ?? caretRef.current;
          const { query } = tokenAtCaret(value, caretNow);
          if (query) void refreshSuggest(query);
        }}
        onBlur={() => {
          focusedRef.current = false;
          // Defer so suggestion button mousedown can apply first
          window.setTimeout(() => {
            if (document.activeElement === inputRef.current) {
              focusedRef.current = true;
              return;
            }
            closeSuggest();
          }, 0);
        }}
      />
      {open && rows.length > 0 ? (
        <ul id={listId} className="booru-tag-input__list" role="listbox">
          {rows.map((row, i) => (
            <li key={row.key} role="option" aria-selected={i === active}>
              <button
                type="button"
                className={`booru-tag-input__item${i === active ? " is-active" : ""}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  applySuggestion(row);
                }}
                onMouseEnter={() => setActive(i)}
              >
                <span className="booru-tag-input__name">{row.label}</span>
                <span className="booru-tag-input__meta">
                  {row.fromFavorites ? (
                    <span className="booru-tag-input__fav" title="Из избранного">
                      fav
                    </span>
                  ) : null}
                  {row.purchase === "unlocked" ? (
                    <span
                      className="booru-tag-input__bought is-yes"
                      title="Куплено / доступно"
                      aria-label="Куплено"
                    >
                      ✓
                    </span>
                  ) : row.purchase === "locked" ? (
                    <span
                      className="booru-tag-input__bought is-no"
                      title="Не куплено"
                      aria-label="Не куплено"
                    >
                      ✕
                    </span>
                  ) : null}
                  {row.postCount != null ? (
                    <span className="booru-tag-input__count">
                      {formatCount(row.postCount)}
                      {row.fromFavorites ? "×" : ""}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
          {loading ? (
            <li className="booru-tag-input__status">Gelbooru…</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
