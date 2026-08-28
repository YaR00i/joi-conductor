import { useEffect, useMemo, useRef, useState } from "react";
import { HubSearchDock } from "../../components/HubSearchDock";
import { tagGroupLabel } from "../../lib/doujin/normalize";
import {
  appendSearchPrefix,
  replaceLastSearchToken,
  SEARCH_PREFIXES,
  suggestTagsForSearchQuery,
  tagToQueryTerm,
  tasteTagKey,
} from "../../lib/doujin/query";
import type {
  DoujinCategoryFilter,
  DoujinLanguageFilter,
  DoujinMinFavorites,
  DoujinPagesBand,
  DoujinSearchSort,
  DoujinTag,
} from "../../lib/doujin/types";

const LANGS: Array<{ id: DoujinLanguageFilter; label: string }> = [
  { id: "all", label: "язык" },
  { id: "english", label: "english" },
  { id: "japanese", label: "japanese" },
  { id: "chinese", label: "chinese" },
];

const SORTS: Array<{ id: DoujinSearchSort; label: string }> = [
  { id: "date", label: "новые" },
  { id: "popular", label: "популярные" },
  { id: "popular-week", label: "неделя" },
  { id: "popular-today", label: "сегодня" },
  { id: "popular-month", label: "месяц" },
];

const CATEGORIES: Array<{ id: DoujinCategoryFilter; label: string }> = [
  { id: "all", label: "кат." },
  { id: "doujinshi", label: "doujinshi" },
  { id: "manga", label: "manga" },
  { id: "artistcg", label: "artistcg" },
  { id: "gamecg", label: "gamecg" },
  { id: "imageset", label: "imageset" },
  { id: "western", label: "western" },
  { id: "non-h", label: "non-h" },
  { id: "misc", label: "misc" },
];

const PAGE_BANDS: Array<{ id: DoujinPagesBand; label: string }> = [
  { id: "all", label: "стр." },
  { id: "short", label: "до 20" },
  { id: "mid", label: "20–80" },
  { id: "long", label: "80+" },
];

const MIN_FAVS: Array<{ id: DoujinMinFavorites; label: string }> = [
  { id: "all", label: "лайки" },
  { id: "100", label: "≥100" },
  { id: "500", label: "≥500" },
  { id: "1000", label: "≥1000" },
];

type Props = {
  query: string;
  language: DoujinLanguageFilter;
  category: DoujinCategoryFilter;
  pagesBand: DoujinPagesBand;
  minFavorites: DoujinMinFavorites;
  sort: DoujinSearchSort;
  suggestTags?: readonly DoujinTag[];
  onQuery: (q: string) => void;
  onLanguage: (lang: DoujinLanguageFilter) => void;
  onCategory: (cat: DoujinCategoryFilter) => void;
  onPagesBand: (band: DoujinPagesBand) => void;
  onMinFavorites: (min: DoujinMinFavorites) => void;
  onSort: (sort: DoujinSearchSort) => void;
  onSubmit: () => void;
};

export function DoujinSearchBar({
  query,
  language,
  category,
  pagesBand,
  minFavorites,
  sort,
  suggestTags = [],
  onQuery,
  onLanguage,
  onCategory,
  onPagesBand,
  onMinFavorites,
  onSort,
  onSubmit,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const suggestions = useMemo(
    () => suggestTagsForSearchQuery(suggestTags, query),
    [query, suggestTags],
  );
  const showSuggest = suggestOpen && suggestions.length > 0;

  useEffect(() => {
    if (!showSuggest) return;
    const onPtr = (event: PointerEvent) => {
      const root = wrapRef.current;
      if (root && !root.contains(event.target as Node)) {
        setSuggestOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPtr);
    return () => document.removeEventListener("pointerdown", onPtr);
  }, [showSuggest]);

  const pickSuggestion = (tag: DoujinTag) => {
    const term = tagToQueryTerm(tag);
    if (!term) return;
    onQuery(replaceLastSearchToken(query, term));
    setSuggestOpen(false);
    setActiveIndex(0);
    inputRef.current?.focus();
  };

  return (
    <HubSearchDock abovePager peek={query}>
      <form
        className="doujin-search"
        onSubmit={(e) => {
          e.preventDefault();
          setSuggestOpen(false);
          onSubmit();
        }}
      >
        <div className="doujin-search__toolbar">
          <div className="doujin-search__query" ref={wrapRef}>
            <input
              ref={inputRef}
              type="search"
              value={query}
              placeholder="artist:mokuyama-hito · 675882"
              autoComplete="off"
              aria-label="Поиск по коду или тегам nhentai"
              aria-autocomplete="list"
              aria-expanded={showSuggest}
              aria-controls="doujin-search-suggest"
              role="combobox"
              onChange={(e) => {
                onQuery(e.target.value);
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
                if (event.key === "Enter" && suggestOpen) {
                  const tag = suggestions[activeIndex] ?? suggestions[0];
                  if (!tag) return;
                  event.preventDefault();
                  pickSuggestion(tag);
                }
              }}
            />
            {showSuggest ? (
              <ul
                id="doujin-search-suggest"
                className="doujin-search__suggest"
                role="listbox"
              >
                {suggestions.map((tag, index) => {
                  const key = tasteTagKey(tag);
                  return (
                    <li key={key} role="presentation">
                      <button
                        type="button"
                        className={
                          "doujin-search__suggest-item" +
                          (index === activeIndex ? " is-active" : "")
                        }
                        role="option"
                        aria-selected={index === activeIndex}
                        onMouseEnter={() => setActiveIndex(index)}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => pickSuggestion(tag)}
                      >
                        <span>{tag.name}</span>
                        <span>{tagGroupLabel(tag.type)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
          <select
            value={category}
            aria-label="Категория"
            onChange={(e) => onCategory(e.target.value as DoujinCategoryFilter)}
          >
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <select
            value={pagesBand}
            aria-label="Число страниц"
            onChange={(e) => onPagesBand(e.target.value as DoujinPagesBand)}
          >
            {PAGE_BANDS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
          <select
            value={minFavorites}
            aria-label="Минимум закладок на сайте"
            onChange={(e) =>
              onMinFavorites(e.target.value as DoujinMinFavorites)
            }
          >
            {MIN_FAVS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <select
            value={language}
            aria-label="Язык"
            onChange={(e) => onLanguage(e.target.value as DoujinLanguageFilter)}
          >
            {LANGS.map((lang) => (
              <option key={lang.id} value={lang.id}>
                {lang.label}
              </option>
            ))}
          </select>
          <select
            value={sort}
            aria-label="Сортировка"
            onChange={(e) => onSort(e.target.value as DoujinSearchSort)}
          >
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <details className="doujin-search__syntax">
            <summary title="Синтаксис сайта" aria-label="Синтаксис сайта">
              ?
            </summary>
            <div className="doujin-search__syntax-pop">
              <p className="doujin-search__syntax-hint">
                Один фильтр как на сайте (artist:muk или ссылка /artist/muk/)
                открывает ту же ленту, что страница автора, не всех, чьи ники
                начинаются на muk. Дефис в слаге — пробел в имени.
              </p>
              <div
                className="doujin-chips doujin-chips--prefix"
                role="group"
                aria-label="Вставить фильтр"
              >
                {SEARCH_PREFIXES.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    title={p.hint}
                    onClick={() => {
                      onQuery(appendSearchPrefix(query, p.insert));
                      inputRef.current?.focus();
                    }}
                  >
                    {p.insert}
                  </button>
                ))}
              </div>
            </div>
          </details>
        </div>
        <button
          type="submit"
          className="gelbooru-hub__icon-btn"
          title="Искать"
          aria-label="Искать"
        >
          <SearchIcon />
        </button>
      </form>
    </HubSearchDock>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden>
      <circle
        cx="7"
        cy="7"
        r="4.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.45"
      />
      <path
        d="m10.2 10.2 3 3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinecap="round"
      />
    </svg>
  );
}
