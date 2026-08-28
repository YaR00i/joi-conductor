import { proxiedImageUrl } from "../../lib/doujin/cdn";
import {
  formatUploadedAt,
  groupGalleryTags,
} from "../../lib/doujin/normalize";
import { tagToQueryTerm } from "../../lib/doujin/query";
import { listItemHasTags, listItemLabel } from "../../lib/doujin/readingLists";
import type { DoujinReadingListItem, DoujinTag } from "../../lib/doujin/types";
import { DoujinLangBadges } from "./DoujinGrid";

type Props = {
  item: DoujinReadingListItem;
  coverSrc?: string;
  enriching?: boolean;
  onRead: (pageIndex?: number) => void;
  onTag: (query: string) => void;
};

const THUMB_CAP = 24;

export function DoujinListPreview({
  item,
  coverSrc,
  enriching = false,
  onRead,
  onTag,
}: Props) {
  const pretty = listItemLabel(item);
  const english =
    item.title.english && item.title.english !== pretty
      ? item.title.english
      : "";
  const japanese =
    item.title.japanese && item.title.japanese !== pretty
      ? item.title.japanese
      : "";
  const groups = groupGalleryTags(item.tags ?? []);
  const uploaded = formatUploadedAt(item.uploadedAt);
  const cover = coverSrc || proxiedImageUrl(item.coverUrl);
  const thumbs = (item.pagePreviews ?? []).slice(0, THUMB_CAP);
  const extraThumbs = Math.max(
    0,
    (item.numPages || item.pagePreviews?.length || 0) - thumbs.length,
  );

  function clickTag(tag: DoujinTag) {
    const q = tagToQueryTerm(tag);
    if (q) onTag(q);
  }

  return (
    <aside className="doujin-lists__preview">
      <div className="doujin-lists__preview-hero">
        <button
          type="button"
          className="doujin-lists__preview-cover"
          onClick={() => onRead()}
          title="Читать"
        >
          {cover ? <img src={cover} alt="" /> : <span className="doujin-lists__cover-ph" />}
          <DoujinLangBadges
            languages={item.languages}
            language={item.language}
          />
        </button>
        <div className="doujin-lists__preview-meta">
        <h2>{pretty}</h2>
        {english ? <p className="doujin-detail__alt">{english}</p> : null}
        {japanese ? <p className="doujin-detail__alt">{japanese}</p> : null}
        <p className="doujin-lists__preview-id">#{item.galleryId}</p>

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
            <dd className="doujin-detail__plain">{item.numPages || "?"}</dd>
          </div>
          {item.numFavorites != null ? (
            <div className="doujin-detail__row">
              <dt>Избранное</dt>
              <dd className="doujin-detail__plain">{item.numFavorites}</dd>
            </div>
          ) : null}
          {uploaded ? (
            <div className="doujin-detail__row">
              <dt>Загружено</dt>
              <dd className="doujin-detail__plain">{uploaded}</dd>
            </div>
          ) : null}
        </dl>

        {!listItemHasTags(item) || thumbs.length === 0 ? (
          <p className="muted">
            {enriching
              ? "Подтягиваю теги и страницы…"
              : "Снимок тегов и страниц сохранится в списке после открытия с ключом API."}
          </p>
        ) : null}

        <div className="doujin-lists__preview-actions">
          <button type="button" className="doujin-lists__go" onClick={() => onRead()}>
            Читать
          </button>
        </div>
        </div>
      </div>
      {thumbs.length > 0 ? (
        <section className="doujin-lists__pages">
          <div className="doujin-detail__thumbs">
            {thumbs.map((url, i) => {
              const src = proxiedImageUrl(url);
              return (
                <button
                  key={`${item.galleryId}-p${i}`}
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
    </aside>
  );
}
