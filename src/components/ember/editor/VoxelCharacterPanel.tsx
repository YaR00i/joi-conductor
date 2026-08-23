/**
 * Ordered slot list for a voxel character scene (chibi template).
 */
import type {
  EmberCharacterCardView,
  EmberVoxelScene,
} from "../../../game/content/types";
import { EMBER_CHIBI32_SLOTS } from "../../../game/content/types";
import {
  EMBER_CHARACTER_CARD_VIEWS,
  EMBER_CHARACTER_CARD_VIEW_LABEL_RU,
} from "../../../game/voxel/characterView";
import {
  CHIBI32_SLOT_LABEL_RU,
  CHIBI32_VISUAL_HEIGHT_VOXELS,
  CHIBI_TEMPLATE_LABEL_RU,
  characterCapsule,
  isCharacterScene,
} from "../../../game/voxel/voxelCharacter";

type Props = {
  scene: EmberVoxelScene;
  activeObjectId: string | null;
  cardView: EmberCharacterCardView;
  onCardViewChange: (view: EmberCharacterCardView) => void;
  onSelectSlot: (objectId: string) => void;
  onToggleVisible: (objectId: string) => void;
};

export function VoxelCharacterPanel({
  scene,
  activeObjectId,
  cardView,
  onCardViewChange,
  onSelectSlot,
  onToggleVisible,
}: Props) {
  if (!isCharacterScene(scene)) return null;
  const cap = characterCapsule(scene);
  const slots = scene.character?.slots ?? {};

  const templateId = scene.character?.templateId ?? "chibi_32";
  let metaExtra: string;
  switch (templateId) {
    case "chibi_25d":
      metaExtra = " карточка 3 vx, волосы вне коллизии";
      break;
    case "chibi_32":
      metaExtra = " волосы вне коллизии";
      break;
    default: {
      const _never: never = templateId;
      metaExtra = _never;
    }
  }

  return (
    <div className="ember-voxel-character">
      <p className="ember-voxel-sculpt__section">
        Персонаж · {CHIBI_TEMPLATE_LABEL_RU[templateId]}
      </p>
      <p className="muted ember-hint ember-voxel-character__meta">
        Капсула {cap.radius}×{cap.height} vx · макушка {CHIBI32_VISUAL_HEIGHT_VOXELS} ·
        {metaExtra}
      </p>
      <p className="muted ember-hint ember-voxel-character__hint">
        Ctrl+клик или двойной клик по части · Сдвиг (M) двигает кость, не всё
        тело
      </p>
      {scene.character?.facing === "card4" ? (
        <div className="ember-voxel-sculpt__modes" role="radiogroup" aria-label="Вид карточки">
          {EMBER_CHARACTER_CARD_VIEWS.map((view) => (
            <button
              key={view}
              type="button"
              role="radio"
              aria-checked={cardView === view}
              className={cardView === view ? "is-active" : ""}
              title="Как в Octopath: подмена рисунка, не поворот карточки"
              onClick={() => onCardViewChange(view)}
            >
              {EMBER_CHARACTER_CARD_VIEW_LABEL_RU[view]}
            </button>
          ))}
        </div>
      ) : null}
      <ul className="ember-voxel-character__slots" role="listbox">
        {EMBER_CHIBI32_SLOTS.map((slot) => {
          const objectId = slots[slot];
          const obj = objectId
            ? scene.objects.find((o) => o.id === objectId)
            : undefined;
          if (!objectId || !obj) return null;
          const active = obj.id === activeObjectId;
          const hidden = obj.visible === false;
          return (
            <li key={slot}>
              <button
                type="button"
                role="option"
                aria-selected={active}
                className={`ember-voxel-character__slot ${active ? "is-active" : ""} ${hidden ? "is-hidden" : ""}`}
                onClick={() => onSelectSlot(obj.id)}
              >
                {CHIBI32_SLOT_LABEL_RU[slot]}
              </button>
              <button
                type="button"
                className={`ember-voxel-character__eye ${hidden ? "is-off" : ""}`}
                title={hidden ? "Показать" : "Скрыть"}
                aria-label={hidden ? `Показать ${CHIBI32_SLOT_LABEL_RU[slot]}` : `Скрыть ${CHIBI32_SLOT_LABEL_RU[slot]}`}
                onClick={() => onToggleVisible(obj.id)}
              >
                {hidden ? "×" : "○"}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
