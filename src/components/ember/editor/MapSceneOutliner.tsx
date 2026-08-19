import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import type {
  EmberSceneGroup,
  EmberWorldObject,
  EmberWorldObjectKind,
} from "../../../game/editor";

type Filter = "all" | EmberWorldObjectKind;

type Props = {
  objects: readonly EmberWorldObject[];
  selectedKeys: ReadonlySet<string>;
  primaryKey: string | null;
  selectedGroupId: string | null;
  groups: readonly EmberSceneGroup[];
  hiddenKeys: ReadonlySet<string>;
  lockedKeys: ReadonlySet<string>;
  onSelectionChange: (
    objects: readonly EmberWorldObject[],
    primary: EmberWorldObject | null,
  ) => void;
  onSelectGroup: (group: EmberSceneGroup) => void;
  onFocus: (object: EmberWorldObject) => void;
  onToggleHidden: (object: EmberWorldObject) => void;
  onToggleLocked: (object: EmberWorldObject) => void;
  onSetHidden: (objects: readonly EmberWorldObject[], hidden: boolean) => void;
  onSetLocked: (objects: readonly EmberWorldObject[], locked: boolean) => void;
  onTranslate: (objects: readonly EmberWorldObject[], dx: number, dy: number) => void;
  onDelete: (objects: readonly EmberWorldObject[]) => void;
  onCreateGroup: (objects: readonly EmberWorldObject[]) => void;
  onRemoveGroup: (id: string) => void;
  onRenameGroup: (id: string, name: string) => void;
  onDuplicateGroup: (id: string) => void;
  onReparentObjects: (objectKeys: readonly string[], groupId?: string) => void;
  onReparentGroup: (id: string, parentGroupId?: string) => void;
};

const GROUPS: readonly {
  kind: EmberWorldObjectKind;
  label: string;
  glyph: string;
}[] = [
  { kind: "voxel", label: "Воксели", glyph: "◆" },
  { kind: "sprite", label: "Спрайты", glyph: "▧" },
  { kind: "light", label: "Свет", glyph: "✦" },
  { kind: "region", label: "Зоны", glyph: "▱" },
];

function objectPosition(object: EmberWorldObject): string {
  const { x, y } = object.transform.position;
  const z = object.transform.resolvedZ;
  return `${x}, ${y}${z ? `, Z${z}` : ""}`;
}

export function MapSceneOutliner({
  objects,
  selectedKeys,
  primaryKey,
  selectedGroupId,
  groups,
  hiddenKeys,
  lockedKeys,
  onSelectionChange,
  onSelectGroup,
  onFocus,
  onToggleHidden,
  onToggleLocked,
  onSetHidden,
  onSetLocked,
  onTranslate,
  onDelete,
  onCreateGroup,
  onRemoveGroup,
  onRenameGroup,
  onDuplicateGroup,
  onReparentObjects,
  onReparentGroup,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [draggedNode, setDraggedNode] = useState<
    { kind: "objects"; keys: readonly string[] } | { kind: "group"; id: string } | null
  >(null);
  const draggedNodeRef = useRef<typeof draggedNode>(null);
  const [dropGroupId, setDropGroupId] = useState<string | "root" | null>(null);
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [contextMenu, setContextMenu] = useState<
    | { x: number; y: number; kind: "group"; id: string }
    | { x: number; y: number; kind: "object"; key: string }
    | null
  >(null);
  const updateDraggedNode = (node: typeof draggedNode) => {
    draggedNodeRef.current = node;
    setDraggedNode(node);
  };
  const anchorKeyRef = useRef<string | null>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase("ru");
  const visibleObjects = useMemo(
    () =>
      objects.filter(
        (object) =>
          object.kind !== "tile" &&
          (filter === "all" || object.kind === filter) &&
          (!normalizedQuery ||
            `${object.name} ${object.id} ${object.key}`
              .toLocaleLowerCase("ru")
              .includes(normalizedQuery)),
      ),
    [filter, normalizedQuery, objects],
  );
  const selectedObjects = useMemo(
    () => objects.filter((object) => selectedKeys.has(object.key)),
    [objects, selectedKeys],
  );
  const allSelectedHidden =
    selectedObjects.length > 0 &&
    selectedObjects.every((object) => hiddenKeys.has(object.key));
  const allSelectedLocked =
    selectedObjects.length > 0 &&
    selectedObjects.every((object) => lockedKeys.has(object.key));
  const groupedKeys = useMemo(
    () => new Set(groups.flatMap((group) => group.objectKeys)),
    [groups],
  );
  const visibleKeys = useMemo(
    () => new Set(visibleObjects.map((object) => object.key)),
    [visibleObjects],
  );
  const rootVisibleObjects = useMemo(
    () => visibleObjects.filter((object) => !groupedKeys.has(object.key)),
    [groupedKeys, visibleObjects],
  );
  const groupMemberKeys = (groupId: string): Set<string> => {
    const result = new Set<string>();
    const visit = (id: string, visiting: Set<string>) => {
      if (visiting.has(id)) return;
      const group = groups.find((candidate) => candidate.id === id);
      if (!group) return;
      const next = new Set(visiting).add(id);
      for (const key of group.objectKeys) result.add(key);
      for (const child of groups.filter((candidate) => candidate.parentGroupId === id)) {
        visit(child.id, next);
      }
    };
    visit(groupId, new Set());
    return result;
  };
  const beginRenameGroup = (group: EmberSceneGroup) => {
    setRenamingGroupId(group.id);
    setRenameValue(group.name);
    setContextMenu(null);
  };
  const commitRenameGroup = () => {
    if (!renamingGroupId) return;
    const name = renameValue.trim();
    if (name) onRenameGroup(renamingGroupId, name);
    setRenamingGroupId(null);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "F2" || !selectedGroupId) return;
      const group = groups.find((candidate) => candidate.id === selectedGroupId);
      if (!group) return;
      event.preventDefault();
      beginRenameGroup(group);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [groups, selectedGroupId]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [contextMenu]);

  const selectRow = (object: EmberWorldObject, event: MouseEvent) => {
    setConfirmDelete(false);
    if (event.shiftKey && anchorKeyRef.current) {
      const anchorIndex = visibleObjects.findIndex(
        (candidate) => candidate.key === anchorKeyRef.current,
      );
      const objectIndex = visibleObjects.findIndex(
        (candidate) => candidate.key === object.key,
      );
      if (anchorIndex >= 0 && objectIndex >= 0) {
        const from = Math.min(anchorIndex, objectIndex);
        const to = Math.max(anchorIndex, objectIndex);
        onSelectionChange(visibleObjects.slice(from, to + 1), object);
        return;
      }
    }
    if (event.ctrlKey || event.metaKey) {
      const next = selectedKeys.has(object.key)
        ? selectedObjects.filter((candidate) => candidate.key !== object.key)
        : [...selectedObjects, object];
      onSelectionChange(next, next.includes(object) ? object : next.at(-1) ?? null);
      anchorKeyRef.current = object.key;
      return;
    }
    anchorKeyRef.current = object.key;
    onSelectionChange([object], object);
  };

  const dropNode = (event: DragEvent, parentGroupId?: string) => {
    event.preventDefault();
    event.stopPropagation();
    const node = draggedNodeRef.current;
    if (node?.kind === "objects") {
      onReparentObjects(node.keys, parentGroupId);
    } else if (node?.kind === "group") {
      if (node.id !== parentGroupId) onReparentGroup(node.id, parentGroupId);
    }
    updateDraggedNode(null);
    setDropGroupId(null);
  };

  const renderObjectRow = (
    object: EmberWorldObject,
    glyph: string,
    depth = 0,
  ): ReactNode => {
    const hidden = hiddenKeys.has(object.key);
    const locked = lockedKeys.has(object.key);
    return (
      <div
        key={object.key}
        role="treeitem"
        aria-selected={selectedKeys.has(object.key)}
        className={[
          "ember-outliner__row",
          depth ? "is-child" : "",
          selectedKeys.has(object.key) ? "is-selected" : "",
          primaryKey === object.key ? "is-primary" : "",
          hidden ? "is-hidden" : "",
          locked ? "is-locked" : "",
        ].filter(Boolean).join(" ")}
        style={{ paddingLeft: `${0.3 + depth * 0.65}rem` }}
        onClick={(event) => selectRow(object, event)}
        onDoubleClick={() => onFocus(object)}
        onContextMenu={(event) => {
          event.preventDefault();
          onSelectionChange([object], object);
          setContextMenu({
            x: Math.min(event.clientX, window.innerWidth - 190),
            y: Math.min(event.clientY, window.innerHeight - 190),
            kind: "object",
            key: object.key,
          });
        }}
        draggable
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          const keys =
            primaryKey && selectedKeys.has(object.key)
              ? [...selectedKeys]
              : [object.key];
          updateDraggedNode({ kind: "objects", keys });
        }}
        onDragEnd={() => {
          updateDraggedNode(null);
          setDropGroupId(null);
        }}
      >
        <button
          type="button"
          className="ember-outliner__state"
          aria-label={hidden ? `Показать ${object.name}` : `Скрыть ${object.name}`}
          title={hidden ? "Показать в редакторе" : "Скрыть в редакторе"}
          onClick={(event) => {
            event.stopPropagation();
            onToggleHidden(object);
          }}
        >
          {hidden ? "○" : "◉"}
        </button>
        <button
          type="button"
          className="ember-outliner__state"
          aria-label={locked ? `Разблокировать ${object.name}` : `Заблокировать ${object.name}`}
          title={locked ? "Разблокировать редактирование" : "Заблокировать редактирование"}
          onClick={(event) => {
            event.stopPropagation();
            onToggleLocked(object);
          }}
        >
          {locked ? "▣" : "□"}
        </button>
        <span className="ember-outliner__kind" aria-hidden>{glyph}</span>
        <span className="ember-outliner__name">
          <strong>{object.name}</strong>
          <small>{objectPosition(object)}</small>
        </span>
      </div>
    );
  };

  const groupHasVisibleChildren = (groupId: string, visiting = new Set<string>()): boolean => {
    if (visiting.has(groupId)) return false;
    const group = groups.find((candidate) => candidate.id === groupId);
    if (!group) return false;
    if (group.objectKeys.some((key) => visibleKeys.has(key))) return true;
    const next = new Set(visiting).add(groupId);
    return groups.some(
      (candidate) =>
        candidate.parentGroupId === groupId &&
        groupHasVisibleChildren(candidate.id, next),
    );
  };

  const renderGroupBranch = (
    group: EmberSceneGroup,
    depth: number,
    visiting = new Set<string>(),
  ): ReactNode => {
    if (visiting.has(group.id)) return null;
    const showEmpty = filter === "all" && !normalizedQuery;
    if (!showEmpty && !groupHasVisibleChildren(group.id)) return null;
    const collapsed = collapsedGroupIds.has(group.id);
    const memberKeys = groupMemberKeys(group.id);
    const memberCount = memberKeys.size;
    const directObjects = group.objectKeys.flatMap((key) => {
      const object = objects.find((candidate) => candidate.key === key);
      return object && visibleKeys.has(key) ? [object] : [];
    });
    const childGroups = groups.filter((candidate) => candidate.parentGroupId === group.id);
    const nextVisiting = new Set(visiting).add(group.id);
    return (
      <div className="ember-outliner__branch" key={group.id}>
        <div
          className={[
            "ember-outliner__collection",
            selectedGroupId === group.id ? "is-selected" : "",
            dropGroupId === group.id ? "is-drop-target" : "",
          ].filter(Boolean).join(" ")}
          style={{ paddingLeft: `${depth * 0.65}rem` }}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            setDropGroupId(group.id);
          }}
          onDragLeave={() => setDropGroupId((current) => current === group.id ? null : current)}
          onDrop={(event) => dropNode(event, group.id)}
          onContextMenu={(event) => {
            event.preventDefault();
            onSelectGroup(group);
            setContextMenu({
              x: Math.min(event.clientX, window.innerWidth - 190),
              y: Math.min(event.clientY, window.innerHeight - 220),
              kind: "group",
              id: group.id,
            });
          }}
        >
          <button
            type="button"
            className="ember-outliner__collection-toggle"
            aria-label={collapsed ? `Развернуть ${group.name}` : `Свернуть ${group.name}`}
            onClick={(event) => {
              event.stopPropagation();
              setCollapsedGroupIds((current) => {
                const next = new Set(current);
                if (next.has(group.id)) next.delete(group.id);
                else next.add(group.id);
                return next;
              });
            }}
          >
            {collapsed ? "▸" : "▾"}
          </button>
          {renamingGroupId === group.id ? (
            <div className="ember-outliner__collection-main">
              <input
                autoFocus
                aria-label="Имя группы"
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                onBlur={commitRenameGroup}
                onKeyDown={(event) => {
                  if (event.key === "Enter") commitRenameGroup();
                  if (event.key === "Escape") setRenamingGroupId(null);
                }}
              />
            </div>
          ) : (
            <button
              type="button"
              className="ember-outliner__collection-main"
              draggable
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                updateDraggedNode({ kind: "group", id: group.id });
              }}
              onDragEnd={() => {
                updateDraggedNode(null);
                setDropGroupId(null);
              }}
              onClick={() => onSelectGroup(group)}
              onDoubleClick={() => beginRenameGroup(group)}
              title={`Pivot ${group.pivot.x.toFixed(1)}, ${group.pivot.y.toFixed(1)}, Z${group.pivot.z.toFixed(1)}`}
            >
              <span>▰</span><strong>{group.name}</strong><small>{memberCount}</small>
            </button>
          )}
          <button
            type="button"
            className="ember-outliner__collection-remove"
            aria-label={`Удалить группу ${group.name}`}
            onClick={() => onRemoveGroup(group.id)}
          >×</button>
        </div>
        {!collapsed ? (
          <div role="group" aria-label={`Дочерние элементы ${group.name}`}>
            {directObjects.map((object) => {
              const definition = GROUPS.find((entry) => entry.kind === object.kind);
              return renderObjectRow(object, definition?.glyph ?? "•", depth + 1);
            })}
            {childGroups.map((child) => renderGroupBranch(child, depth + 1, nextVisiting))}
          </div>
        ) : null}
      </div>
    );
  };

  if (collapsed) {
    return (
      <aside className="ember-outliner is-collapsed" aria-label="Outliner">
        <button
          type="button"
          className="ember-outliner__collapse"
          aria-label="Развернуть Outliner"
          title="Развернуть Outliner"
          onClick={() => setCollapsed(false)}
        >
          ☷
        </button>
        <span className="ember-outliner__vertical-label">OUTLINER</span>
        <strong>{objects.length}</strong>
      </aside>
    );
  }

  return (
    <aside
      className={`ember-outliner${draggedNode ? " is-dragging" : ""}`}
      aria-label="Outliner"
    >
      <header className="ember-outliner__head">
        <div>
          <span>СЦЕНА</span>
          <strong>Outliner</strong>
        </div>
        <button
          type="button"
          className="ember-outliner__collapse"
          aria-label="Свернуть Outliner"
          title="Свернуть Outliner"
          onClick={() => setCollapsed(true)}
        >
          ‹
        </button>
      </header>

      <div className="ember-outliner__search">
        <input
          type="search"
          value={query}
          placeholder="Поиск объектов…"
          aria-label="Поиск объектов"
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          value={filter}
          aria-label="Фильтр объектов"
          onChange={(event) => setFilter(event.target.value as Filter)}
        >
          <option value="all">Все</option>
          {GROUPS.map((group) => (
            <option key={group.kind} value={group.kind}>
              {group.label}
            </option>
          ))}
        </select>
      </div>

      {selectedObjects.length > 1 ? (
        <div className="ember-outliner__batch" aria-label="Пакетные действия">
          <strong>{selectedObjects.length} выбрано</strong>
          <div className="ember-outliner__batch-row">
            <button type="button" title="Сдвинуть влево" onClick={() => onTranslate(selectedObjects, -1, 0)}>←</button>
            <button type="button" title="Сдвинуть вверх" onClick={() => onTranslate(selectedObjects, 0, -1)}>↑</button>
            <button type="button" title="Сдвинуть вниз" onClick={() => onTranslate(selectedObjects, 0, 1)}>↓</button>
            <button type="button" title="Сдвинуть вправо" onClick={() => onTranslate(selectedObjects, 1, 0)}>→</button>
            <button type="button" title={allSelectedHidden ? "Показать выбранные" : "Скрыть выбранные"} onClick={() => onSetHidden(selectedObjects, !allSelectedHidden)}>
              {allSelectedHidden ? "◉" : "○"}
            </button>
            <button type="button" title={allSelectedLocked ? "Разблокировать выбранные" : "Заблокировать выбранные"} onClick={() => onSetLocked(selectedObjects, !allSelectedLocked)}>
              {allSelectedLocked ? "□" : "■"}
            </button>
          </div>
          <div className="ember-outliner__batch-wide">
            <button type="button" onClick={() => onCreateGroup(selectedObjects)}>Сгруппировать</button>
            <button
              type="button"
              className={confirmDelete ? "is-danger" : ""}
              onClick={() => {
                if (!confirmDelete) {
                  setConfirmDelete(true);
                  return;
                }
                onDelete(selectedObjects);
                setConfirmDelete(false);
              }}
            >
              {confirmDelete ? `Удалить ${selectedObjects.length}?` : "Удалить"}
            </button>
          </div>
        </div>
      ) : null}

      <div className="ember-outliner__tree" role="tree" aria-label="Объекты сцены">
        {groups.length > 0 ? (
          <section className="ember-outliner__group ember-outliner__collections">
            <div className="ember-outliner__group-head">
              <span>▰</span><strong>Группы</strong><small>{groups.length}</small>
            </div>
            {groups
              .filter(
                (group) =>
                  !group.parentGroupId ||
                  !groups.some((candidate) => candidate.id === group.parentGroupId),
              )
              .map((group) => renderGroupBranch(group, 0))}
            <div
              className={[
                "ember-outliner__root-drop",
                dropGroupId === "root" ? "is-drop-target" : "",
              ].filter(Boolean).join(" ")}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDropGroupId("root");
              }}
              onDragLeave={() => setDropGroupId((current) => current === "root" ? null : current)}
              onDrop={(event) => dropNode(event)}
            >
              ⤒ Scene Root
            </div>
          </section>
        ) : null}
        {GROUPS.map((group) => {
          const groupObjects = rootVisibleObjects.filter(
            (object) => object.kind === group.kind,
          );
          if (groupObjects.length === 0) return null;
          return (
            <section className="ember-outliner__group" key={group.kind}>
              <div className="ember-outliner__group-head">
                <span>{group.glyph}</span>
                <strong>{group.label}</strong>
                <small>{groupObjects.length}</small>
              </div>
              {groupObjects.map((object) => renderObjectRow(object, group.glyph))}
            </section>
          );
        })}
        {visibleObjects.length === 0 ? (
          <p className="ember-outliner__empty">Объекты не найдены.</p>
        ) : null}
      </div>

      {contextMenu ? (
        <div
          className="ember-outliner__context"
          role="menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {contextMenu.kind === "group" ? (() => {
            const group = groups.find((candidate) => candidate.id === contextMenu.id);
            if (!group) return null;
            return (
              <>
                <button type="button" role="menuitem" onClick={() => beginRenameGroup(group)}>Переименовать <kbd>F2</kbd></button>
                <button type="button" role="menuitem" onClick={() => { onDuplicateGroup(group.id); setContextMenu(null); }}>Дублировать</button>
                <button type="button" role="menuitem" onClick={() => { onSelectGroup(group); setContextMenu(null); }}>Выбрать ветвь</button>
                <button type="button" role="menuitem" onClick={() => { onRemoveGroup(group.id); setContextMenu(null); }}>Разгруппировать</button>
              </>
            );
          })() : (() => {
            const object = objects.find((candidate) => candidate.key === contextMenu.key);
            if (!object) return null;
            return (
              <>
                <button type="button" role="menuitem" onClick={() => { onFocus(object); setContextMenu(null); }}>Фокусировать</button>
                <button type="button" role="menuitem" onClick={() => { onToggleHidden(object); setContextMenu(null); }}>{hiddenKeys.has(object.key) ? "Показать" : "Скрыть"}</button>
                <button type="button" role="menuitem" onClick={() => { onToggleLocked(object); setContextMenu(null); }}>{lockedKeys.has(object.key) ? "Разблокировать" : "Заблокировать"}</button>
                {groupedKeys.has(object.key) ? (
                  <button type="button" role="menuitem" onClick={() => { onReparentObjects([object.key]); setContextMenu(null); }}>Переместить в Scene Root</button>
                ) : null}
              </>
            );
          })()}
        </div>
      ) : null}

      <footer className="ember-outliner__foot">
        <span>{visibleObjects.length} объектов</span>
        <span>Ctrl / Shift — мультивыбор</span>
      </footer>
    </aside>
  );
}
