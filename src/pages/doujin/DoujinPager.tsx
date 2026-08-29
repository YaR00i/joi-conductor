import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BookmarkIcon } from "../../components/FavLightbox";
import {
  rangeWheelItems,
  WheelPicker,
} from "../../components/WheelPicker";
import {
  DOUJIN_LIBRARY_CATALOG_SORT_ITEMS,
  type DoujinLibraryCatalogSort,
} from "../../lib/doujin/types";

type DockMenu = "page" | "sort" | null;

type Props = {
  page: number;
  numPages: number;
  total?: number;
  loading?: boolean;
  mode?: "pages" | "refresh";
  layout?: "pager" | "tools";
  recsTitle?: string;
  onPage: (page: number) => void;
  onRefresh?: () => void;
  onPackFound?: () => void;
  packDisabled?: boolean;
  packTitle?: string;
  onDeleteSelected?: () => void;
  deleteDisabled?: boolean;
  deleteTitle?: string;
  catalogSort?: DoujinLibraryCatalogSort;
  onCatalogSort?: (sort: DoujinLibraryCatalogSort) => void;
};

export function DoujinPager({
  page,
  numPages,
  total,
  loading = false,
  mode = "pages",
  layout = "pager",
  recsTitle,
  onPage,
  onRefresh,
  onPackFound,
  packDisabled = false,
  packTitle = "В список из найденного",
  onDeleteSelected,
  deleteDisabled = false,
  deleteTitle = "Удалить выбранные",
  catalogSort,
  onCatalogSort,
}: Props) {
  const [menu, setMenu] = useState<DockMenu>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const pages = Math.max(1, numPages);
  const current = Math.min(pages, Math.max(1, page));
  const pageItems = useMemo(
    () => (menu === "page" ? rangeWheelItems(1, pages, 1) : []),
    [menu, pages],
  );
  const sortRow = catalogSort
    ? DOUJIN_LIBRARY_CATALOG_SORT_ITEMS.find((row) => row.value === catalogSort)
    : undefined;
  const showSort = Boolean(catalogSort && onCatalogSort);

  useEffect(() => {
    if (!menu) return;
    const onPtr = (event: PointerEvent) => {
      const root = rootRef.current;
      if (root && !root.contains(event.target as Node)) setMenu(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(null);
    };
    document.addEventListener("pointerdown", onPtr);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPtr);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const countHint =
    typeof total === "number"
      ? `${total} работ · стр. ${current} из ${pages}`
      : `Страница ${current} из ${pages}`;

  return createPortal(
    <div className="doujin-pager-overlay">
      <div className="doujin-pager is-dock" ref={rootRef}>
      {onPackFound ? (
        <button
          type="button"
          className="gelbooru-hub__icon-btn is-list"
          disabled={packDisabled}
          title={packTitle}
          aria-label={packTitle}
          onClick={() => {
            setMenu(null);
            onPackFound();
          }}
        >
          <BookmarkIcon filled={false} />
        </button>
      ) : null}
      {onDeleteSelected ? (
        <button
          type="button"
          className="gelbooru-hub__icon-btn is-list"
          disabled={deleteDisabled}
          title={deleteTitle}
          aria-label={deleteTitle}
          onClick={() => {
            setMenu(null);
            onDeleteSelected();
          }}
        >
          <TrashIcon />
        </button>
      ) : null}
      {layout === "pager" && showSort && catalogSort && onCatalogSort ? (
        <button
          type="button"
          className={
            "btn-ghost doujin-pager__sort" + (menu === "sort" ? " is-open" : "")
          }
          title={sortRow?.hint ?? "Порядок"}
          aria-expanded={menu === "sort"}
          aria-haspopup="listbox"
          onClick={() => setMenu((on) => (on === "sort" ? null : "sort"))}
        >
          {sortRow?.label ?? "Порядок"}
        </button>
      ) : null}
      {layout === "pager" ? (
        <>
      <button
        type="button"
        className="btn-ghost"
        disabled={current <= 1 || loading}
        onClick={() => {
          setMenu(null);
          onPage(current - 1);
        }}
      >
        Назад
      </button>
      {mode === "refresh" ? (
        <button
          type="button"
          className="btn-ghost doujin-pager__mid"
          disabled={loading}
          title={recsTitle}
          onClick={onRefresh}
        >
          Обновить
        </button>
      ) : (
        <button
          type="button"
          className={
            "btn-ghost doujin-pager__mid" + (menu === "page" ? " is-open" : "")
          }
          disabled={loading || pages <= 1}
          title={`${countHint}. Нажми, чтобы выбрать страницу`}
          aria-expanded={menu === "page"}
          aria-haspopup="listbox"
          onClick={() => setMenu((on) => (on === "page" ? null : "page"))}
        >
          {current} / {pages}
        </button>
      )}
      <button
        type="button"
        className="btn-ghost"
        disabled={current >= pages || loading}
        onClick={() => {
          setMenu(null);
          onPage(current + 1);
        }}
      >
        Дальше
      </button>
      {menu === "page" && mode === "pages" ? (
        <div className="doujin-pager__wheel" role="listbox" aria-label="Страница">
          <p className="doujin-pager__hint">{countHint}</p>
          <WheelPicker
            value={current}
            items={pageItems}
            onChange={(next) => {
              onPage(next);
              setMenu(null);
            }}
          />
        </div>
      ) : null}
      {menu === "sort" && catalogSort && onCatalogSort ? (
        <div className="doujin-pager__wheel" role="listbox" aria-label="Порядок">
          <p className="doujin-pager__hint">{sortRow?.hint ?? "Порядок сетки"}</p>
          <WheelPicker
            value={catalogSort}
            items={DOUJIN_LIBRARY_CATALOG_SORT_ITEMS.map((row) => ({
              value: row.value,
              label: row.label,
            }))}
            onChange={(next) => {
              onCatalogSort(next);
              setMenu(null);
            }}
          />
        </div>
      ) : null}
        </>
      ) : null}
      </div>
    </div>,
    document.body,
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden>
      <path
        d="M3.2 4.3h9.6M6.2 4.3V3.2h3.6v1.1M5.1 6.1v6.1M8 6.1v6.1M10.9 6.1v6.1M4.3 4.3l.65 8.3c.06.55.5.95 1.05.95h4c.55 0 1-.4 1.05-.95l.65-8.3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
