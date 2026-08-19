import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type OnConnect,
  type OnEdgesChange,
  type OnNodesChange,
  type OnSelectionChangeFunc,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { EmberScene, SceneEditorLayout } from "../../../../game";
import { SelectionToolbar, type SelectionBulkActions } from "./SelectionToolbar";
import { StepNode, type StepFlowNode, type StepNodeActions } from "./StepNode";
import {
  applyBgToSteps,
  applyConnect,
  applyDisconnect,
  duplicateStepsInGraph,
  removeStepsFromGraph,
  resolveEditorLayout,
  sceneToFlow,
} from "./sceneGraphModel";

type Props = {
  scene: EmberScene;
  onSceneChange: (scene: EmberScene) => void;
  actions: StepNodeActions;
  selectedStepId: string | null;
  onSelectStep: (stepId: string | null) => void;
  defaultBgArtId?: string;
};

const nodeTypes = { step: StepNode };

function SceneGraphCanvasInner({
  scene,
  onSceneChange,
  actions,
  selectedStepId,
  onSelectStep,
  defaultBgArtId,
}: Props) {
  const layout = useMemo(() => resolveEditorLayout(scene), [scene]);
  const layoutSeeded = useRef(false);
  const selectedIdsRef = useRef<Set<string>>(new Set());

  const built = useMemo(() => {
    const { nodes, edges } = sceneToFlow(scene, layout);
    return {
      nodes: nodes.map((n) => ({
        ...n,
        selected: selectedIdsRef.current.has(n.id),
        data: { ...n.data, actions },
      })) as StepFlowNode[],
      edges,
    };
  }, [scene, layout, actions]);

  const [nodes, setNodes, onNodesChangeInternal] = useNodesState<StepFlowNode>(
    built.nodes,
  );
  const [edges, setEdges, onEdgesChangeInternal] = useEdgesState(built.edges);

  // Sync from scene; keep multi-selection
  useEffect(() => {
    setNodes((prev) => {
      const selected = new Set(
        prev.filter((n) => n.selected).map((n) => n.id),
      );
      if (selected.size === 0 && selectedStepId) selected.add(selectedStepId);
      selectedIdsRef.current = selected;
      return built.nodes.map((n) => ({
        ...n,
        selected: selected.has(n.id),
        data: { ...n.data, actions },
      }));
    });
    setEdges(built.edges);
  }, [built, setNodes, setEdges, selectedStepId, actions]);

  useEffect(() => {
    layoutSeeded.current = false;
  }, [scene.id]);

  useEffect(() => {
    if (layoutSeeded.current) return;
    const hasAll =
      scene.steps.length > 0 &&
      scene.steps.every((s) => scene.editorLayout?.[s.id]);
    layoutSeeded.current = true;
    if (hasAll) return;
    onSceneChange({ ...scene, editorLayout: layout });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene.id, scene.steps.map((s) => s.id).join("|")]);

  const onNodesChange: OnNodesChange<StepFlowNode> = useCallback(
    (changes: NodeChange<StepFlowNode>[]) => {
      onNodesChangeInternal(changes);
      for (const c of changes) {
        if (c.type === "select") {
          if (c.selected) selectedIdsRef.current.add(c.id);
          else selectedIdsRef.current.delete(c.id);
        }
      }
      const ended = changes.filter(
        (
          c,
        ): c is NodeChange<StepFlowNode> & {
          type: "position";
          dragging: false;
          position: { x: number; y: number };
        } =>
          c.type === "position" &&
          c.dragging === false &&
          c.position != null,
      );
      if (!ended.length) return;
      const editorLayout: SceneEditorLayout = {
        ...(scene.editorLayout ?? {}),
      };
      for (const c of ended) {
        editorLayout[c.id] = { x: c.position.x, y: c.position.y };
      }
      onSceneChange({ ...scene, editorLayout });
    },
    [onNodesChangeInternal, onSceneChange, scene],
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes: EdgeChange<Edge>[]) => {
      const removed = changes.filter((c) => c.type === "remove");
      if (removed.length) {
        let steps = scene.steps;
        for (const ch of removed) {
          if (ch.type !== "remove") continue;
          const edge = edges.find((e) => e.id === ch.id);
          if (!edge) continue;
          steps = applyDisconnect(steps, {
            source: edge.source,
            sourceHandle: edge.sourceHandle ?? null,
            target: edge.target,
          });
        }
        onSceneChange({ ...scene, steps });
        return;
      }
      onEdgesChangeInternal(changes);
    },
    [edges, onEdgesChangeInternal, onSceneChange, scene],
  );

  const onConnect: OnConnect = useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target) return;
      const steps = applyConnect(scene.steps, {
        source: conn.source,
        sourceHandle: conn.sourceHandle ?? null,
        target: conn.target,
        targetHandle: conn.targetHandle ?? null,
      });
      onSceneChange({ ...scene, steps });
    },
    [onSceneChange, scene],
  );

  const onReconnect = useCallback(
    (oldEdge: Edge, conn: Connection) => {
      if (!conn.source || !conn.target) return;
      let steps = applyDisconnect(scene.steps, {
        source: oldEdge.source,
        sourceHandle: oldEdge.sourceHandle ?? null,
        target: oldEdge.target,
      });
      steps = applyConnect(steps, {
        source: conn.source,
        sourceHandle: conn.sourceHandle ?? null,
        target: conn.target,
        targetHandle: conn.targetHandle ?? null,
      });
      onSceneChange({ ...scene, steps });
    },
    [onSceneChange, scene],
  );

  const onSelectionChange: OnSelectionChangeFunc = useCallback(
    ({ nodes: sel }) => {
      const ids = sel.map((n) => n.id);
      selectedIdsRef.current = new Set(ids);
      onSelectStep(ids[0] ?? null);
    },
    [onSelectStep],
  );

  const bulkActions: SelectionBulkActions = useMemo(
    () => ({
      hasDefaultBg: Boolean(defaultBgArtId),
      onDelete: (ids) => {
        const next = removeStepsFromGraph(scene, ids);
        selectedIdsRef.current = new Set();
        onSceneChange(next);
        onSelectStep(null);
      },
      onDuplicate: (ids) => {
        const { scene: next, newIds } = duplicateStepsInGraph(scene, ids);
        selectedIdsRef.current = new Set(newIds);
        onSceneChange(next);
        onSelectStep(newIds[0] ?? null);
      },
      onApplyBg: (ids) => {
        if (!defaultBgArtId) return;
        onSceneChange(applyBgToSteps(scene, ids, defaultBgArtId));
      },
      onSetStart: (id) => {
        onSceneChange({ ...scene, startStepId: id });
      },
    }),
    [defaultBgArtId, onSceneChange, onSelectStep, scene],
  );

  const onNodesDelete = useCallback(
    (deleted: StepFlowNode[]) => {
      const ids = deleted.map((n) => n.id);
      const next = removeStepsFromGraph(scene, ids);
      selectedIdsRef.current = new Set();
      onSceneChange(next);
      onSelectStep(null);
    },
    [onSceneChange, onSelectStep, scene],
  );

  const hostRef = useRef<HTMLDivElement>(null);

  return (
    <div className="ember-graph-canvas" ref={hostRef}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onReconnect={onReconnect}
        onSelectionChange={onSelectionChange}
        onNodesDelete={onNodesDelete}
        onNodeClick={(_, node) => onSelectStep(node.id)}
        onPaneClick={() => onSelectStep(null)}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        deleteKeyCode={["Backspace", "Delete"]}
        multiSelectionKeyCode={["Shift", "Meta", "Control"]}
        selectionOnDrag
        selectionMode={SelectionMode.Partial}
        panOnDrag={[1, 2]}
        zoomOnScroll
        zoomOnPinch
        panOnScroll={false}
        proOptions={{ hideAttribution: true }}
        colorMode="dark"
        edgesReconnectable
        elevateEdgesOnSelect
        defaultEdgeOptions={{
          type: "smoothstep",
          animated: false,
        }}
      >
        <Background gap={18} size={1} color="#2a2018" />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          nodeColor={(n) => {
            const t = (n.data as StepFlowNode["data"] | undefined)?.step.type;
            switch (t) {
              case "choice":
                return "#c45c26";
              case "end":
                return "#5a4030";
              case "dialogue":
                return "#8a6048";
              default:
                return "#4a3428";
            }
          }}
        />
      </ReactFlow>
      <SelectionToolbar actions={bulkActions} hostRef={hostRef} />
    </div>
  );
}

export function SceneGraphCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <SceneGraphCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
