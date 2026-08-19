import { useMemo, useState } from "react";
import type { ContentUnlockLists } from "../lib/contentUnlocks";
import { listOwnedLibraryTags } from "../lib/contentUnlocks";
import {
  getTagType,
  groupTagsByType,
  loadTagTypeMap,
  setTagType,
  TAG_TYPE_META,
  type TagTypeId,
  type TagTypeMap,
} from "../lib/tagTypes";
import { playUiClick, primeUiAudio } from "../lib/uiSound";
import { SettingsSection } from "./SettingsSection";
import { TagTypePickerModal } from "./TagTypePickerModal";

type Props = {
  unlocks: ContentUnlockLists;
};

/** Settings: reclassify owned library tags by type. */
export function TagTypesSettingsPanel({ unlocks }: Props) {
  const [typeMap, setTypeMap] = useState<TagTypeMap>(() => loadTagTypeMap());
  const [editTag, setEditTag] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const library = useMemo(() => listOwnedLibraryTags(unlocks), [unlocks]);
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return library;
    return library.filter((t) => t.tag.toLowerCase().includes(q));
  }, [library, filter]);
  const groups = useMemo(
    () => groupTagsByType(filtered, typeMap),
    [filtered, typeMap],
  );

  return (
    <SettingsSection
      id="tag-types"
      title="Типы тегов"
      wide
      defaultOpen={false}
      sub="Категории для библиотеки на Рулетке и фильтров в Избранном. При покупке в магазине тип выбирается сразу — здесь можно поправить."
    >
      <div className="tag-types-settings__search-row">
        <input
          className="tag-types-settings__search"
          type="search"
          placeholder="Найти тег…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Поиск тега"
        />
      </div>

      {library.length === 0 ? (
        <p className="card__sub">Пока нет купленных / открытых тегов.</p>
      ) : (
        <div className="tag-types-settings__groups">
          {groups.map((group) => (
            <section key={group.type} className="tag-type-section">
              <header className="tag-type-section__head">
                <h3 className="tag-type-section__title">{group.meta.nameRu}</h3>
                <p className="tag-type-section__desc">{group.meta.descriptionRu}</p>
              </header>
              <ul className="tag-types-settings__list">
                {group.items.map((item) => (
                  <li key={item.tag} className="tag-types-settings__row">
                    <code>{item.tag}</code>
                    <select
                      className="tag-types-settings__select"
                      value={getTagType(item.tag, typeMap)}
                      aria-label={`Тип для ${item.tag}`}
                      onChange={(e) => {
                        void primeUiAudio();
                        playUiClick();
                        const next = e.target.value as TagTypeId;
                        setTypeMap(setTagType(item.tag, next));
                      }}
                    >
                      {TAG_TYPE_META.map((meta) => (
                        <option key={meta.id} value={meta.id}>
                          {meta.nameRu}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => {
                        void primeUiAudio();
                        playUiClick();
                        setEditTag(item.tag);
                      }}
                    >
                      Подробнее
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {editTag ? (
        <TagTypePickerModal
          tag={editTag}
          initialType={getTagType(editTag, typeMap)}
          titleRu="Сменить тип тега"
          onCancel={() => setEditTag(null)}
          onConfirm={(type) => {
            setTypeMap(setTagType(editTag, type));
            setEditTag(null);
          }}
        />
      ) : null}
    </SettingsSection>
  );
}
