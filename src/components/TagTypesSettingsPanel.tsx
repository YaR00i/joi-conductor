import { useMemo, useState } from "react";
import type { ContentUnlockLists } from "../lib/contentUnlocks";
import { listOwnedLibraryTags } from "../lib/contentUnlocks";
import {
  getNativeTagType,
  getTagType,
  groupTagsByType,
  setTagType,
  TAG_TYPE_META,
  tagTypeSectionClass,
  type TagTypeId,
} from "../lib/tagTypes";
import { playUiClick, primeUiAudio } from "../lib/uiSound";
import { SettingsSection } from "./SettingsSection";
import { TagTypePickerModal } from "./TagTypePickerModal";
import { useTagTypeCatalog } from "./useTagTypeCatalog";

type Props = {
  unlocks: ContentUnlockLists;
  /** Skip SettingsSection chrome — parent already provides brain-panel. */
  embedded?: boolean;
};

/** Settings: reclassify owned library tags by type. */
export function TagTypesSettingsPanel({ unlocks, embedded = false }: Props) {
  const [editTag, setEditTag] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const library = useMemo(() => listOwnedLibraryTags(unlocks), [unlocks]);
  const { typeMap, nativeMap, setTypeMap } = useTagTypeCatalog([]);
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return library;
    return library.filter((t) => t.tag.toLowerCase().includes(q));
  }, [library, filter]);
  const groups = useMemo(
    () => groupTagsByType(filtered, typeMap, nativeMap),
    [filtered, typeMap, nativeMap],
  );

  const body = (
    <>
      <label className="brain-field">
        <span className="field__label">Найти тег</span>
        <input
          type="search"
          placeholder="lingerie, oral…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Поиск тега"
        />
      </label>

      {library.length === 0 ? (
        <p className="brain-panel__hint">Пока нет купленных / открытых тегов.</p>
      ) : (
        groups.map((group) => (
          <section key={group.type} className={tagTypeSectionClass(group.type)}>
            <h3 className="brain-panel__h">{group.meta.nameRu}</h3>
            <p className="brain-panel__hint">{group.meta.descriptionRu}</p>
            {group.items.length === 0 ? (
              <p className="brain-panel__hint">В этом типе пусто.</p>
            ) : (
              <ul className="brain-list">
                {group.items.map((item) => (
                  <li key={item.tag} className="brain-row">
                    <div className="brain-row__main">
                      <span className="brain-row__name">{item.tag}</span>
                      <span className="brain-row__meta">
                        {TAG_TYPE_META.find(
                          (m) => m.id === getTagType(item.tag, typeMap, nativeMap),
                        )?.nameRu ?? ""}
                      </span>
                    </div>
                    <div className="brain-row__acts">
                      <select
                        value={getTagType(item.tag, typeMap, nativeMap)}
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
                        className="brain-act"
                        onClick={() => {
                          void primeUiAudio();
                          playUiClick();
                          setEditTag(item.tag);
                        }}
                      >
                        подробнее
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))
      )}

      {editTag ? (
        <TagTypePickerModal
          tag={editTag}
          initialType={getTagType(editTag, typeMap, nativeMap)}
          nativeType={getNativeTagType(editTag, nativeMap)}
          titleRu="Сменить тип тега"
          onCancel={() => setEditTag(null)}
          onConfirm={(type) => {
            setTypeMap(setTagType(editTag, type));
            setEditTag(null);
          }}
        />
      ) : null}
    </>
  );

  if (embedded) return body;

  return (
    <SettingsSection
      id="tag-types"
      title="Типы тегов"
      wide
      defaultOpen={false}
      sub="Категории как на Gelbooru (артист / персонаж / лор / мета) плюс фавориты. Тип подтягивается с сайта; фаворит можно снять — тег вернётся в свой отдел."
    >
      {body}
    </SettingsSection>
  );
}
