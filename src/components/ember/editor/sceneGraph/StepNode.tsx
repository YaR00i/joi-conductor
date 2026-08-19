import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import {
  optionHandleId,
  STEP_HANDLE_IN,
  STEP_HANDLE_OUT,
  type StepNodeData,
} from "./sceneGraphModel";

export type StepNodeActions = {
  onEdit: (stepId: string) => void;
  onDelete: (stepId: string) => void;
  onSetStart: (stepId: string) => void;
};

export type StepFlowNode = Node<
  StepNodeData & { actions?: StepNodeActions },
  "step"
>;

type Props = NodeProps<StepFlowNode>;

export function StepNode({ data, selected }: Props) {
  const { step, label, preview, isStart, optionLabels, actions } = data;
  const isEnd = step.type === "end";
  const isChoice = step.type === "choice";
  const optCount = optionLabels?.length ?? 0;

  return (
    <div
      className={`ember-graph-node ember-graph-node--${step.type}${selected ? " is-selected" : ""}${isStart ? " is-start" : ""}`}
    >
      <Handle
        type="target"
        id={STEP_HANDLE_IN}
        position={Position.Left}
        className="ember-graph-handle ember-graph-handle--in"
      />

      <div className="ember-graph-node__head">
        <strong>{label}</strong>
        {isStart ? <span className="ember-graph-node__badge">start</span> : null}
      </div>
      <p className="ember-graph-node__preview">{preview}</p>

      {isChoice && optionLabels?.length ? (
        <ul className="ember-graph-node__options">
          {optionLabels.map((opt) => (
            <li key={opt.id}>
              <span className="ember-graph-node__opt-label">{opt.label}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="ember-graph-node__actions">
        {!isEnd ? (
          <button
            type="button"
            className="ember-graph-node__btn"
            onClick={(e) => {
              e.stopPropagation();
              actions?.onEdit(step.id);
            }}
          >
            Редактировать
          </button>
        ) : null}
        {!isEnd && !isStart ? (
          <button
            type="button"
            className="ember-graph-node__btn ghost"
            onClick={(e) => {
              e.stopPropagation();
              actions?.onSetStart(step.id);
            }}
            title="Сделать стартовым"
          >
            Start
          </button>
        ) : null}
        {!isEnd ? (
          <button
            type="button"
            className="ember-graph-node__btn ember-graph-node__btn--danger"
            onClick={(e) => {
              e.stopPropagation();
              actions?.onDelete(step.id);
            }}
            title="Удалить"
          >
            ×
          </button>
        ) : null}
      </div>

      {!isEnd && !isChoice ? (
        <Handle
          type="source"
          id={STEP_HANDLE_OUT}
          position={Position.Right}
          className="ember-graph-handle ember-graph-handle--out"
        />
      ) : null}

      {isChoice && optionLabels
        ? optionLabels.map((opt, i) => {
            const topPct =
              optCount <= 1 ? 50 : 28 + (i / Math.max(1, optCount - 1)) * 44;
            return (
              <Handle
                key={opt.id}
                type="source"
                id={optionHandleId(opt.id)}
                position={Position.Right}
                className="ember-graph-handle ember-graph-handle--opt"
                style={{ top: `${topPct}%` }}
                title={opt.label}
              />
            );
          })
        : null}
    </div>
  );
}
