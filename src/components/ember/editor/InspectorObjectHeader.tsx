import type { EmberSceneGroup } from "../../../game/content/types";

export type InspectorObjectHeaderProps = {
  kindLabel: string;
  name: string;
  description?: string;
  sourceLabel: string;
  sourceDetail?: string;
  icon?: string;
  locked?: boolean;
  hidden?: boolean;
  parentGroupId?: string;
  parentGroups?: readonly EmberSceneGroup[];
  onRename?: (name: string) => void;
  onToggleLocked?: () => void;
  onToggleHidden?: () => void;
  onSetParent?: (parentGroupId?: string) => void;
  onOpenSource?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onClose: () => void;
};

export function InspectorObjectHeader({
  kindLabel,
  name,
  description,
  sourceLabel,
  sourceDetail,
  icon = "◇",
  locked = false,
  hidden = false,
  parentGroupId,
  parentGroups = [],
  onRename,
  onToggleLocked,
  onToggleHidden,
  onSetParent,
  onOpenSource,
  onDuplicate,
  onDelete,
  onClose,
}: InspectorObjectHeaderProps) {
  const hasMenu = Boolean(onDuplicate || onDelete);

  return (
    <header className="ember-inspector-object-head">
      <div className="ember-inspector-object-head__topline">
        <span className="ember-inspector-object-head__kind">{kindLabel}</span>
        <span className="ember-inspector-object-head__source">{sourceLabel}</span>
      </div>

      <div className="ember-inspector-object-head__identity">
        <button
          type="button"
          className={`ember-inspector-object-head__visibility ${hidden ? "is-hidden" : ""}`}
          aria-label={hidden ? "Показать объект в редакторе" : "Скрыть объект в редакторе"}
          aria-pressed={hidden}
          disabled={!onToggleHidden}
          onClick={onToggleHidden}
        >
          {hidden ? "◌" : "●"}
        </button>
        <span className="ember-inspector-object-head__icon" aria-hidden>
          {icon}
        </span>
        {onRename ? (
          <input
            className="ember-inspector-object-head__name"
            key={name}
            defaultValue={name}
            aria-label="Имя объекта"
            onBlur={(event) => {
              const next = event.target.value.trim();
              if (next && next !== name) onRename(next);
              else event.target.value = name;
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                event.currentTarget.value = name;
                event.currentTarget.blur();
              }
            }}
          />
        ) : (
          <strong className="ember-inspector-object-head__name ember-inspector-object-head__name--readonly">
            {name}
          </strong>
        )}
        <button
          type="button"
          className={`ghost ember-inspector-object-head__tool ${locked ? "is-active" : ""}`}
          aria-label={locked ? "Разблокировать объект" : "Заблокировать объект"}
          aria-pressed={locked}
          disabled={!onToggleLocked}
          onClick={onToggleLocked}
        >
          {locked ? "▣" : "▢"}
        </button>
        {hasMenu ? (
          <details className="ember-inspector-object-head__menu">
            <summary aria-label="Действия с объектом">⋮</summary>
            <div className="ember-inspector-object-head__menu-popover">
              {onDuplicate ? (
                <button type="button" onClick={onDuplicate}>
                  Дублировать
                </button>
              ) : null}
              {onDelete ? (
                <button type="button" className="danger" onClick={onDelete}>
                  Удалить
                </button>
              ) : null}
            </div>
          </details>
        ) : null}
        <button
          type="button"
          className="ghost ember-inspector-object-head__tool"
          aria-label="Закрыть Inspector"
          onClick={onClose}
        >
          ×
        </button>
      </div>

      {description ? (
        <p className="ember-inspector-object-head__description">{description}</p>
      ) : null}

      <div className="ember-inspector-object-head__context">
        <div className="ember-inspector-object-head__source-detail">
          <span>{sourceDetail || "Scene object"}</span>
          {onOpenSource ? (
            <button type="button" className="ghost" onClick={onOpenSource}>
              Открыть
            </button>
          ) : null}
        </div>
        {onSetParent ? (
          <label className="ember-inspector-object-head__parent">
            <span>Parent</span>
            <select
              value={parentGroupId ?? ""}
              onChange={(event) => onSetParent(event.target.value || undefined)}
            >
              <option value="">Scene Root</option>
              {parentGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
    </header>
  );
}
