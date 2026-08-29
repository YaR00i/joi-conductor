import { useEffect, useRef, useState, type CSSProperties } from "react";
import { CardSelectButton } from "../../components/FavLightbox";
import { proxiedImageUrl } from "../../lib/doujin/cdn";
import {
  displayTitle,
  languageBadges,
  languagesOf,
} from "../../lib/doujin/normalize";
import type { DoujinCard } from "../../lib/doujin/types";

export function DoujinLangBadges({
  languages,
  language,
}: {
  languages?: readonly string[];
  language?: string;
}) {
  const badges = languageBadges(languagesOf({ languages, language }));
  if (badges.length === 0) return null;
  return (
    <span className="doujin-card__langs">
      {badges.map((badge) => (
        <span
          key={`${badge.kind}:${badge.code}`}
          className={`doujin-card__lang doujin-card__lang--${badge.kind}`}
          title={badge.title}
        >
          {badge.code}
        </span>
      ))}
    </span>
  );
}

type Props = {
  items: DoujinCard[];
  savedIds: Set<number>;
  listedIds: Set<number>;
  busyIds?: ReadonlySet<string>;
  cols: number;
  rows: number;
  loading?: boolean;
  coverOverrides?: Record<number, string>;
  onOpen: (id: number) => void;
  onToggleSave: (card: DoujinCard) => void;
  onOpenLists: (card: DoujinCard) => void;
  selectedIds?: ReadonlySet<number>;
  onToggleSelect?: (card: DoujinCard) => void;
};

export function DoujinGrid({
  items,
  savedIds,
  listedIds,
  busyIds,
  cols,
  rows,
  loading = false,
  coverOverrides,
  onOpen,
  onToggleSave,
  onOpenLists,
  selectedIds,
  onToggleSelect,
}: Props) {
  const style = {
    "--doujin-cols": cols,
    "--doujin-rows": rows,
  } as CSSProperties;
  const skeletonCount =
    loading && items.length === 0
      ? Math.max(1, cols) * Math.max(1, rows)
      : 0;

  return (
    <div className="doujin-grid" style={style}>
      {skeletonCount > 0
        ? Array.from({ length: skeletonCount }, (_, index) => (
            <article
              key={`sk-${index}`}
              className="doujin-card is-skeleton"
              style={{ "--stagger": Math.min(index, 11) } as CSSProperties}
              aria-hidden
            >
              <span className="doujin-card__cover-slot" />
            </article>
          ))
        : items.map((card, index) => {
            const title = displayTitle(card.title) || `#${card.id}`;
            const saved = savedIds.has(card.id);
            const listed = listedIds.has(card.id);
            const picked = Boolean(selectedIds?.has(card.id));
            const cover =
              coverOverrides?.[card.id] ||
              proxiedImageUrl(card.thumbnailUrl || card.coverUrl);
            return (
              <article
                key={card.id}
                className={"doujin-card" + (picked ? " is-selected" : "")}
                style={{ "--stagger": Math.min(index, 11) } as CSSProperties}
              >
                <DoujinLangBadges
                  languages={card.languages}
                  language={card.language}
                />
                <div className="doujin-card__actions">
                  {onToggleSelect ? (
                    <CardSelectButton
                      selected={picked}
                      onClick={() => onToggleSelect(card)}
                    />
                  ) : null}
                  <button
                    type="button"
                    className={"doujin-card__list" + (listed ? " is-on" : "")}
                    aria-pressed={listed}
                    title={
                      listed
                        ? "Списки чтения"
                        : "Добавить в список чтения"
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenLists(card);
                    }}
                  >
                    <BookmarkIcon filled={listed} />
                  </button>
                  <button
                    type="button"
                    className={"doujin-card__fav" + (saved ? " is-on" : "")}
                    aria-pressed={saved}
                    disabled={Boolean(busyIds?.has(String(card.id)))}
                    title={
                      saved
                        ? "Убрать из избранного на сайте"
                        : "В избранное аккаунта nhentai"
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleSave(card);
                    }}
                  >
                    <HeartIcon filled={saved} />
                  </button>
                </div>
                <button
                  type="button"
                  className="doujin-card__open"
                  onClick={() => onOpen(card.id)}
                >
                  <DoujinCardCover src={cover} />
                  <div className="doujin-card__body">
                    <div className="doujin-card__title">{title}</div>
                    <div className="doujin-card__meta">
                      {card.numPages || "?"} стр.
                    </div>
                  </div>
                </button>
              </article>
            );
          })}
    </div>
  );
}

function DoujinCardCover({ src }: { src: string }) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(false);
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth > 0) setReady(true);
  }, [src]);

  return (
    <span className="doujin-card__cover-slot">
      {src ? (
        <img
          ref={imgRef}
          className={"doujin-card__cover" + (ready ? " is-ready" : "")}
          src={src}
          alt=""
          decoding="async"
          onLoad={() => setReady(true)}
          onError={() => setReady(true)}
        />
      ) : (
        <span className="doujin-card__cover is-ready" />
      )}
    </span>
  );
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden>
      <path
        d="M8 13.55S2.7 10.1 2.7 6.55A2.85 2.85 0 0 1 8 4.2a2.85 2.85 0 0 1 5.3 2.35C13.3 10.1 8 13.55 8 13.55z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={filled ? 0 : 1.35}
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden>
      <path
        d="M4.2 2.4h7.6c.44 0 .8.36.8.8v10.2l-4.6-2.35L3.4 13.4V3.2c0-.44.36-.8.8-.8z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={filled ? 0 : 1.35}
        strokeLinejoin="round"
      />
    </svg>
  );
}
