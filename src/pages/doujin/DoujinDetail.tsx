import { useState } from "react";
import { proxiedImageUrl } from "../../lib/doujin/cdn";
import {
  displayTitle,
  formatUploadedAt,
  galleryCoverUrls,
  groupGalleryTags,
} from "../../lib/doujin/normalize";
import { tagToQueryTerm } from "../../lib/doujin/query";
import type { DoujinGallery, DoujinTag } from "../../lib/doujin/types";

type Props = {
  gallery: DoujinGallery;
  saved: boolean;
  listed?: boolean;
  busy?: boolean;
  backLabel?: string;
  onBack: () => void;
  onRead: (pageIndex: number) => void;
  onToggleSave: () => void;
  onOpenLists?: () => void;
  onTag: (query: string) => void;
  onOpenRelated: (id: number) => void;
};

const THUMB_CAP = 24;

function FallbackImg({ urls, className }: { urls: string[]; className?: string }) {
  const [i, setI] = useState(0);
  const src = urls[i] ? proxiedImageUrl(urls[i]!) : "";
  if (!src) return <div className={className} />;
  return (
    <img
      className={className}
      src={src}
      alt=""
      onError={() => setI((n) => n + 1)}
    />
  );
}

export function DoujinDetail({
  gallery,
  saved,
  listed = false,
  busy = false,
  backLabel = "К ленте",
  onBack,
  onRead,
  onToggleSave,
  onOpenLists,
  onTag,
  onOpenRelated,
}: Props) {
  const pretty = displayTitle(gallery.title) || `#${gallery.id}`;
  const english =
    gallery.title.english && gallery.title.english !== pretty
      ? gallery.title.english
      : "";
  const japanese =
    gallery.title.japanese && gallery.title.japanese !== pretty
      ? gallery.title.japanese
      : "";
  const groups = groupGalleryTags(gallery.tags);
  const uploaded = formatUploadedAt(gallery.uploadedAt);
  const thumbs = gallery.pages.slice(0, THUMB_CAP);
  const extraThumbs = Math.max(0, gallery.pages.length - thumbs.length);
  const coverUrls = galleryCoverUrls(gallery);

  function clickTag(tag: DoujinTag) {
    const q = tagToQueryTerm(tag);
    if (q) onTag(q);
  }

  return (
    <div className="doujin-detail">
      <header className="doujin-detail__bar">
        <div className="doujin-pager">
          <button type="button" className="btn-ghost" onClick={onBack}>
            {backLabel}
          </button>
        </div>
        <div className="doujin-detail__bar-brand">
          <span className="doujin-chrome__kicker">nhentai</span>
          <div className="doujin-detail__bar-id">#{gallery.id}</div>
        </div>
      </header>

      <div className="doujin-detail__hero">
        <button
          type="button"
          className="doujin-detail__cover"
          onClick={() => onRead(0)}
          title="Читать"
        >
          <FallbackImg urls={coverUrls} className="doujin-detail__cover-img" />
        </button>

        <div className="doujin-detail__meta">
          <h1>{pretty}</h1>
          {english ? <p className="doujin-detail__alt">{english}</p> : null}
          {japanese ? <p className="doujin-detail__alt">{japanese}</p> : null}

          <dl className="doujin-detail__facts">
            {groups.map((group) => (
              <div key={group.type} className="doujin-detail__row">
                <dt>{group.label}</dt>
                <dd>
                  {group.tags.map((tag) => (
                    <button
                      key={`${tag.type}:${tag.name}`}
                      type="button"
                      className="doujin-detail__pill"
                      title={tagToQueryTerm(tag)}
                      onClick={() => clickTag(tag)}
                    >
                      <span>{tag.name}</span>
                      {tag.count != null ? (
                        <span className="doujin-detail__pill-count">
                          {tag.count}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </dd>
              </div>
            ))}
            <div className="doujin-detail__row">
              <dt>Страницы</dt>
              <dd className="doujin-detail__plain">
                {gallery.numPages || gallery.pages.length || "?"}
              </dd>
            </div>
            {uploaded ? (
              <div className="doujin-detail__row">
                <dt>Загружено</dt>
                <dd className="doujin-detail__plain">{uploaded}</dd>
              </div>
            ) : null}
          </dl>

          <div className="doujin-detail__actions">
            <button
              type="button"
              className="doujin-detail__read"
              onClick={() => onRead(0)}
            >
              Читать
            </button>
            <button
              type="button"
              className={
                "doujin-detail__fav" + (saved ? " is-on" : "")
              }
              disabled={busy}
              onClick={onToggleSave}
            >
              {saved ? "В избранном" : "В избранное"}
              {gallery.numFavorites != null
                ? ` · ${gallery.numFavorites}`
                : ""}
            </button>
            {onOpenLists ? (
              <button
                type="button"
                className={"doujin-detail__list" + (listed ? " is-on" : "")}
                onClick={onOpenLists}
              >
                {listed ? "В списках" : "В список"}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {thumbs.length > 0 ? (
        <section className="doujin-detail__pages">
          <h2>Страницы</h2>
          <div className="doujin-detail__thumbs">
            {thumbs.map((page, i) => {
              const src = proxiedImageUrl(page.previewUrl || page.url);
              return (
                <button
                  key={`${gallery.id}-p${i}`}
                  type="button"
                  className="doujin-detail__thumb"
                  onClick={() => onRead(i)}
                >
                  {src ? <img src={src} alt="" loading="lazy" /> : i + 1}
                  <span>{i + 1}</span>
                </button>
              );
            })}
          </div>
          {extraThumbs > 0 ? (
            <p className="muted">ещё {extraThumbs} стр. — открой ридер</p>
          ) : null}
        </section>
      ) : null}

      {gallery.related.length > 0 ? (
        <section className="doujin-detail__more">
          <h2>Похожее</h2>
          <div className="doujin-detail__related">
            {gallery.related.slice(0, 10).map((card) => {
              const src = proxiedImageUrl(
                card.thumbnailUrl || card.coverUrl,
              );
              return (
                <button
                  key={card.id}
                  type="button"
                  className="doujin-detail__related-card"
                  onClick={() => onOpenRelated(card.id)}
                >
                  {src ? <img src={src} alt="" loading="lazy" /> : null}
                  <span>{displayTitle(card.title) || `#${card.id}`}</span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
