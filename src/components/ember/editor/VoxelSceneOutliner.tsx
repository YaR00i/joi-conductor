/**
 * Outliner: list of scene objects (params live in VoxelObjectPropsPanel).
 */
import type {
  EmberVoxelScene,
  EmberVoxelSceneObject,
} from "../../../game/content/types";

type Props = {
  scene: EmberVoxelScene | null;
  activeObjectId: string | null;
  selectedObjectIds: readonly string[];
  onSelectObject: (
    objectId: string,
    modifiers: { toggle: boolean; range: boolean },
  ) => void;
  onSelectAll: () => void;
  onToggleVisible: (objectId: string) => void;
  onSetSelectionVisible: (visible: boolean) => void;
  onSeparate: () => void;
  canSeparate: boolean;
  onDuplicateSelection: () => void;
  onRemoveSelection: () => void;
  canRemoveSelection: boolean;
};

function EyeIcon({ crossed }: { crossed: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
      {crossed ? <path d="M3 3l18 18" /> : null}
    </svg>
  );
}

export function VoxelSceneOutliner({
  scene,
  activeObjectId,
  selectedObjectIds,
  onSelectObject,
  onSelectAll,
  onToggleVisible,
  onSetSelectionVisible,
  onSeparate,
  canSeparate,
  onDuplicateSelection,
  onRemoveSelection,
  canRemoveSelection,
}: Props) {
  if (!scene) {
    return (
      <p className="muted ember-hint">Нет сцены — создайте или выберите.</p>
    );
  }

  const selected = new Set(selectedObjectIds);
  const selectionCount = selected.size;
  const allSelectionHidden =
    selectionCount > 0 &&
    scene.objects
      .filter((object) => selected.has(object.id))
      .every((object) => object.visible === false);

  return (
    <div className="ember-voxel-outliner">
      <div className="ember-voxel-outliner__head">
        <p className="ember-voxel-sculpt__section">
          Объекты{selectionCount ? ` · ${selectionCount}` : ""}
        </p>
        <div className="ember-voxel-outliner__head-actions">
          <button
            type="button"
            className="ghost"
            disabled={scene.objects.length === 0}
            title="Выбрать все объекты сцены"
            onClick={onSelectAll}
          >
            Все
          </button>
          <button
            type="button"
            className="ghost"
            disabled={!canSeparate}
            title="Отделить выделение в новый объект"
            onClick={onSeparate}
          >
            Отделить
          </button>
        </div>
      </div>
      <div className="ember-voxel-outliner__bulk" aria-label="Операции с выбранными объектами">
        <button
          type="button"
          className="ghost"
          disabled={!selectionCount}
          title="Дублировать выбранные объекты вместе с внутренними связями"
          onClick={onDuplicateSelection}
        >
          Дубль
        </button>
        <button
          type="button"
          className="ghost"
          disabled={!selectionCount}
          onClick={() => onSetSelectionVisible(allSelectionHidden)}
        >
          {allSelectionHidden ? "Показать" : "Скрыть"}
        </button>
        <button
          type="button"
          className="ghost ember-danger"
          disabled={!canRemoveSelection}
          title="Убрать выбранные объекты со сцены"
          onClick={onRemoveSelection}
        >
          Убрать
        </button>
      </div>
      <ul className="ember-voxel-outliner__list" role="listbox">
        {scene.objects.map((o: EmberVoxelSceneObject) => {
          const active = o.id === activeObjectId;
          const isSelected = selected.has(o.id);
          const hidden = o.visible === false;
          return (
            <li
              key={o.id}
              className={[
                "ember-voxel-outliner__card",
                active ? "is-active" : "",
                isSelected ? "is-selected" : "",
                hidden ? "is-hidden" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <div className="ember-voxel-outliner__row">
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className="ember-voxel-outliner__item"
                  title="Клик — выбрать · Ctrl — добавить/убрать · Shift — диапазон"
                  onClick={(event) =>
                    onSelectObject(o.id, {
                      toggle: event.ctrlKey || event.metaKey,
                      range: event.shiftKey,
                    })
                  }
                >
                  <span className="ember-voxel-outliner__name">
                    {o.nameRu?.trim() || o.modelId}
                  </span>
                  <span className="ember-voxel-outliner__meta">
                    {o.modelId} · {o.offset.x}, {o.offset.y}, {o.offset.z}
                    {o.rot ? ` · R${o.rot * 90}°` : ""}
                  </span>
                </button>
                <button
                  type="button"
                  className={`ember-voxel-outliner__eye ${hidden ? "is-off" : ""}`}
                  title={hidden ? "Показать" : "Скрыть"}
                  aria-label={hidden ? "Показать объект" : "Скрыть объект"}
                  aria-pressed={!hidden}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleVisible(o.id);
                  }}
                >
                  <EyeIcon crossed={hidden} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
