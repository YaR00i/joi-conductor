import { useStore, useStoreApi } from "@xyflow/react";
import {
  useLayoutEffect,
  useMemo,
  useState,
  type RefObject,
} from "react";
import type { StepFlowNode } from "./StepNode";

export type SelectionBulkActions = {
  onDelete: (ids: string[]) => void;
  onDuplicate: (ids: string[]) => void;
  onApplyBg: (ids: string[]) => void;
  onSetStart?: (id: string) => void;
  hasDefaultBg: boolean;
};

type Props = {
  actions: SelectionBulkActions;
  /** Element that is `position: relative` for the overlay (graph canvas). */
  hostRef: RefObject<HTMLElement | null>;
};

type Box = { left: number; top: number; width: number; height: number };

function boxesEqual(a: Box | null, b: Box | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.left === b.left &&
    a.top === b.top &&
    a.width === b.width &&
    a.height === b.height
  );
}

/**
 * Toolbar above multi-selection. Anchors to RF's own
 * `.react-flow__nodesselection-rect` so the frame never drifts.
 */
export function SelectionToolbar({ actions, hostRef }: Props) {
  const storeApi = useStoreApi();
  /** Stable primitive — avoid `filter()` arrays that break Object.is equality. */
  const selectionKey = useStore((s) =>
    s.nodes
      .filter((n) => n.selected)
      .map((n) => n.id)
      .join("\0"),
  );
  const transformKey = useStore((s) => {
    const [x, y, z] = s.transform;
    return `${x},${y},${z}`;
  });
  const [box, setBox] = useState<Box | null>(null);

  const actionable = useMemo(() => {
    if (!selectionKey) return [] as StepFlowNode[];
    const nodes = storeApi.getState().nodes as StepFlowNode[];
    return nodes.filter(
      (n) => n.selected && n.data.step.type !== "end",
    );
  }, [selectionKey, storeApi]);

  const actionableKey = useMemo(
    () => actionable.map((n) => n.id).join("\0"),
    [actionable],
  );

  useLayoutEffect(() => {
    if (!actionableKey) {
      setBox((prev) => (prev == null ? prev : null));
      return;
    }

    const measure = () => {
      const host = hostRef.current;
      const domNode = storeApi.getState().domNode;
      if (!host || !domNode) {
        setBox((prev) => (prev == null ? prev : null));
        return;
      }
      const selRect = domNode.querySelector(
        ".react-flow__nodesselection-rect",
      ) as HTMLElement | null;
      if (!selRect) {
        setBox((prev) => (prev == null ? prev : null));
        return;
      }
      const a = selRect.getBoundingClientRect();
      const b = host.getBoundingClientRect();
      if (a.width < 2 || a.height < 2) {
        setBox((prev) => (prev == null ? prev : null));
        return;
      }
      const next: Box = {
        left: a.left - b.left,
        top: a.top - b.top,
        width: a.width,
        height: a.height,
      };
      setBox((prev) => (boxesEqual(prev, next) ? prev : next));
    };

    measure();
    const raf = requestAnimationFrame(measure);
    const host = hostRef.current;
    const ro =
      typeof ResizeObserver !== "undefined" && host
        ? new ResizeObserver(measure)
        : null;
    if (host && ro) ro.observe(host);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [actionableKey, hostRef, storeApi, transformKey]);

  if (!box || actionable.length === 0) return null;

  const ids = actionable.map((n) => n.id);
  const single = ids.length === 1 ? ids[0]! : null;

  const clearSelection = () => {
    const { addSelectedNodes } = storeApi.getState();
    addSelectedNodes([]);
  };

  return (
    <div
      className="ember-graph-sel"
      style={{
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
      }}
    >
      <div
        className="ember-graph-sel__bar"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <span className="ember-graph-sel__count">{ids.length}</span>
        <button
          type="button"
          className="ember-graph-sel__btn"
          title="Дублировать"
          onClick={() => actions.onDuplicate(ids)}
        >
          <SelIconDup />
        </button>
        {actions.hasDefaultBg ? (
          <button
            type="button"
            className="ember-graph-sel__btn"
            title="Применить фон сцены"
            onClick={() => actions.onApplyBg(ids)}
          >
            <SelIconBg />
          </button>
        ) : null}
        {single && actions.onSetStart ? (
          <button
            type="button"
            className="ember-graph-sel__btn"
            title="Сделать start"
            onClick={() => actions.onSetStart?.(single)}
          >
            <SelIconStart />
          </button>
        ) : null}
        <button
          type="button"
          className="ember-graph-sel__btn ember-graph-sel__btn--danger"
          title="Удалить"
          onClick={() => actions.onDelete(ids)}
        >
          <SelIconTrash />
        </button>
        <button
          type="button"
          className="ember-graph-sel__btn"
          title="Снять выделение"
          onClick={clearSelection}
        >
          <SelIconClear />
        </button>
      </div>
    </div>
  );
}

function SelIconDup() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
      <rect
        x="5"
        y="5"
        width="9"
        height="9"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect
        x="2"
        y="2"
        width="9"
        height="9"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function SelIconBg() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
      <rect
        x="2"
        y="3"
        width="12"
        height="10"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="6" cy="7" r="1.2" fill="currentColor" />
      <path
        d="M3.5 12.5 L7 8.5 L9.5 10.5 L12.5 6.5 L14 12.5Z"
        fill="currentColor"
        opacity="0.85"
      />
    </svg>
  );
}

function SelIconStart() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
      <path d="M4 3.5 L13 8 L4 12.5 Z" fill="currentColor" />
    </svg>
  );
}

function SelIconTrash() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
      <path
        d="M3 4.5h10M6 4.5V3.2A1.2 1.2 0 0 1 7.2 2h1.6A1.2 1.2 0 0 1 10 3.2V4.5m-5.5 0V13a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1V4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SelIconClear() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
      <path
        d="M4 4 L12 12 M12 4 L4 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
