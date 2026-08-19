import { useMemo, useState } from "react";
import type { ContentUnlockLists } from "../lib/contentUnlocks";
import {
  listOwnedLibraryTags,
  queryHasTag,
  toggleTagInQuery,
} from "../lib/contentUnlocks";
import {
  getTagType,
  groupTagsByType,
  loadTagTypeMap,
  setTagType,
  type TagTypeId,
  type TagTypeMap,
} from "../lib/tagTypes";
import { playUiClick, playUiToggle, primeUiAudio } from "../lib/uiSound";
import { TagTypePickerModal } from "./TagTypePickerModal";

const CHIP_LIMIT = 64;

type TagLibraryPanelProps = {
  unlocks: ContentUnlockLists;
  tags: string;
  onTagsChange: (next: string) => void;
};

/**
 * Owned / purchased tag chips grouped by type.
 * Click toggles the tag in the Gelbooru query; hover ⚙ opens type picker.
 */
export function TagLibraryPanel({
  unlocks,
  tags,
  onTagsChange,
}: TagLibraryPanelProps) {
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [typeMap, setTypeMap] = useState<TagTypeMap>(() => loadTagTypeMap());
  const [editTag, setEditTag] = useState<string | null>(null);

  const library = useMemo(() => listOwnedLibraryTags(unlocks), [unlocks]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return library;
    return library.filter(
      (t) =>
        t.tag.toLowerCase().includes(q) ||
        t.labelRu.toLowerCase().includes(q),
    );
  }, [library, search]);

  const visible = showAll ? filtered : filtered.slice(0, CHIP_LIMIT);
  const groups = useMemo(
    () => groupTagsByType(visible, typeMap),
    [visible, typeMap],
  );

  function onToggle(tag: string) {
    void primeUiAudio();
    const next = toggleTagInQuery(tags, tag);
    playUiToggle(queryHasTag(next, tag));
    onTagsChange(next);
  }

  function openTypeEditor(tag: string) {
    void primeUiAudio();
    playUiClick();
    setEditTag(tag);
  }

  return (
    <div className="hub-media-library">
      <div className="hub-media__head">
        <span className="hub-media__title">Моя библиотека</span>
        <span className="hub-media__sub">
          Купленные теги по типам · клик = в запрос · наведи ⚙ = тип
          {library.length > 0 ? ` · ${library.length}` : ""}
        </span>
      </div>

      {library.length === 0 ? (
        <p className="hub-media-library__empty">
          Пока пусто — открывай фетиши в рулетке или покупай теги в магазине
          избранного.
        </p>
      ) : (
        <div className="hub-media-library__filters">
          <div className="hub-media-library__search-row">
            <input
              className="hub-media-library__search"
              type="search"
              placeholder="Поиск по библиотеке…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Поиск по библиотеке тегов"
            />
            {search.trim() ? (
              <button
                type="button"
                className="hub-media-library__clear"
                onClick={() => {
                  void primeUiAudio();
                  playUiClick();
                  setSearch("");
                }}
              >
                Сбросить
              </button>
            ) : null}
          </div>

          {filtered.length === 0 ? (
            <p className="hub-media-library__empty">Ничего не найдено</p>
          ) : (
            <div className="hub-media-library__groups">
              {groups.map((group) => (
                <section key={group.type} className="tag-type-section">
                  <header className="tag-type-section__head">
                    <h3 className="tag-type-section__title">
                      {group.meta.nameRu}
                    </h3>
                    <p className="tag-type-section__desc">
                      {group.meta.descriptionRu}
                    </p>
                  </header>
                  <div
                    className="hub-media-library__tags"
                    role="group"
                    aria-label={group.meta.nameRu}
                  >
                    {group.items.map((item) => {
                      const active = queryHasTag(tags, item.tag);
                      const sourceMark =
                        item.source === "shop"
                          ? "★"
                          : item.source === "pack"
                            ? "◈"
                            : item.source === "character"
                              ? "◆"
                              : "•";
                      return (
                        <span
                          key={item.tag}
                          className={`fav-tag fav-tag--with-gear${
                            active ? " is-active" : ""
                          }`}
                        >
                          <button
                            type="button"
                            className="fav-tag__main"
                            onClick={() => onToggle(item.tag)}
                            title={`${item.labelRu} · ${item.tag}`}
                          >
                            {item.tag}
                          </button>
                          <span className="fav-tag__slot">
                            <span className="fav-tag__n" aria-hidden>
                              {sourceMark}
                            </span>
                            <button
                              type="button"
                              className="fav-tag__gear"
                              title="Настройки тега"
                              aria-label={`Настройки тега ${item.tag}`}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                openTypeEditor(item.tag);
                              }}
                            >
                              ⚙
                            </button>
                          </span>
                        </span>
                      );
                    })}
                  </div>
                </section>
              ))}
              {filtered.length > CHIP_LIMIT ? (
                <button
                  type="button"
                  className="fav-tag fav-tag--more"
                  onClick={() => {
                    void primeUiAudio();
                    playUiClick();
                    setShowAll((v) => !v);
                  }}
                >
                  {showAll
                    ? "Свернуть"
                    : `Ещё ${filtered.length - CHIP_LIMIT}`}
                </button>
              ) : null}
            </div>
          )}
        </div>
      )}

      {editTag ? (
        <TagTypePickerModal
          tag={editTag}
          initialType={getTagType(editTag, typeMap)}
          titleRu="Сменить тип тега"
          confirmRu="Сохранить"
          onCancel={() => setEditTag(null)}
          onConfirm={(type: TagTypeId) => {
            setTypeMap(setTagType(editTag, type));
            setEditTag(null);
          }}
        />
      ) : null}
    </div>
  );
}
