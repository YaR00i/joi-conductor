import { useState } from "react";
import { TAG_TYPE_META, type TagTypeId } from "../lib/tagTypes";
import { playUiClick, playUiConfirm, primeUiAudio } from "../lib/uiSound";

type Props = {
  tag: string;
  labelRu?: string;
  /** Extra line under the title (e.g. list of tags for bulk edit). */
  detailRu?: string;
  initialType: TagTypeId;
  titleRu?: string;
  confirmRu?: string;
  onConfirm: (type: TagTypeId) => void;
  onCancel: () => void;
};

export function TagTypePickerModal({
  tag,
  labelRu,
  detailRu,
  initialType,
  titleRu = "Тип тега",
  confirmRu = "Сохранить",
  onConfirm,
  onCancel,
}: Props) {
  const [selected, setSelected] = useState<TagTypeId>(initialType);

  return (
    <div
      className="tag-type-modal"
      role="dialog"
      aria-modal="true"
      aria-label={titleRu}
      onClick={onCancel}
    >
      <div
        className="tag-type-modal__card"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="tag-type-modal__head">
          <p className="tag-type-modal__eyebrow">{titleRu}</p>
          <h2 className="tag-type-modal__title">{labelRu || tag}</h2>
          <p className="tag-type-modal__tag">{detailRu || tag}</p>
        </header>

        <div className="tag-type-modal__list" role="listbox" aria-label="Типы">
          {TAG_TYPE_META.map((meta) => {
            const active = selected === meta.id;
            return (
              <button
                key={meta.id}
                type="button"
                role="option"
                aria-selected={active}
                className={`tag-type-modal__option${active ? " is-active" : ""}`}
                onClick={() => {
                  void primeUiAudio();
                  playUiClick();
                  setSelected(meta.id);
                }}
              >
                <span className="tag-type-modal__option-name">{meta.nameRu}</span>
                <span className="tag-type-modal__option-desc">
                  {meta.descriptionRu}
                </span>
              </button>
            );
          })}
        </div>

        <div className="tag-type-modal__actions">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              void primeUiAudio();
              playUiClick();
              onCancel();
            }}
          >
            Отмена
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              void primeUiAudio();
              playUiConfirm();
              onConfirm(selected);
            }}
          >
            {confirmRu}
          </button>
        </div>
      </div>
    </div>
  );
}
