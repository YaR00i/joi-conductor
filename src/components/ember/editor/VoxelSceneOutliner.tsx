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
  onSelectObject: (objectId: string) => void;
  onToggleVisible: (objectId: string) => void;
  onSeparate: () => void;
  canSeparate: boolean;
  onDuplicate?: (objectId: string) => void;
  onRemove?: (objectId: string) => void;
  canRemove?: boolean;
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
  onSelectObject,
  onToggleVisible,
  onSeparate,
  canSeparate,
  onDuplicate,
  onRemove,
  canRemove = false,
}: Props) {
  if (!scene) {
    return (
      <p className="muted ember-hint">Нет сцены — создайте или выберите.</p>
    );
  }

  return (
    <div className="ember-voxel-outliner">
      <div className="ember-voxel-outliner__head">
        <p className="ember-voxel-sculpt__section">Объекты</p>
        <div className="ember-voxel-outliner__head-actions">
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
      <ul className="ember-voxel-outliner__list" role="listbox">
        {scene.objects.map((o: EmberVoxelSceneObject) => {
          const active = o.id === activeObjectId;
          const hidden = o.visible === false;
          return (
            <li
              key={o.id}
              className={[
                "ember-voxel-outliner__card",
                active ? "is-active" : "",
                hidden ? "is-hidden" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <div className="ember-voxel-outliner__row">
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  className="ember-voxel-outliner__item"
                  onClick={() => onSelectObject(o.id)}
                >
                  <span className="ember-voxel-outliner__name">
                    {o.nameRu?.trim() || o.modelId}
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
                {onDuplicate ? (
                  <button
                    type="button"
                    className="ghost ember-voxel-outliner__op"
                    title="Дублировать объект сцены"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDuplicate(o.id);
                    }}
                  >
                    Дубль
                  </button>
                ) : null}
                {onRemove ? (
                  <button
                    type="button"
                    className="ghost ember-danger ember-voxel-outliner__op"
                    title="Убрать объект со сцены"
                    disabled={!canRemove || !active}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(o.id);
                    }}
                  >
                    Убрать
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
