import { describe, expect, it, vi } from "vitest";
import {
  EditorCommandStack,
  EditorCore,
  EditorDocumentStore,
  EditorSelectionService,
  EditorToolRegistry,
  createDocumentReplaceCommand,
} from ".";

type TestDocument = { value: number; title?: string };

const cloneDocument = (document: TestDocument): TestDocument => ({
  ...document,
});

describe("EditorDocumentStore", () => {
  it("tracks revisions, dirty state and external synchronization", () => {
    const store = new EditorDocumentStore<TestDocument>({ value: 1 });
    const listener = vi.fn();
    store.subscribe(listener);

    store.replace({ value: 2 }, { source: "command" });
    expect(store.getState()).toMatchObject({
      document: { value: 2 },
      dirty: true,
      source: "command",
      revision: 1,
    });

    store.markSaved();
    expect(store.getState().dirty).toBe(false);
    store.syncExternal({ value: 3 });
    expect(store.getState()).toMatchObject({
      document: { value: 3 },
      dirty: false,
      source: "external",
    });
    expect(listener).toHaveBeenCalledTimes(3);
  });
});

describe("EditorCommandStack", () => {
  it("executes, undoes and redoes explicit commands", () => {
    const store = new EditorDocumentStore<TestDocument>({ value: 1 });
    const stack = new EditorCommandStack<TestDocument>();
    const command = createDocumentReplaceCommand({
      id: "set-two",
      label: "Set value",
      before: { value: 1 },
      after: { value: 2 },
    });

    expect(stack.execute(command, store)).toEqual({ value: 2 });
    expect(stack.getState()).toMatchObject({ canUndo: true, canRedo: false });
    expect(stack.undo(store)).toEqual({ value: 1 });
    expect(stack.redo(store)).toEqual({ value: 2 });
  });

  it("groups streamed legacy updates behind one snapshot boundary", () => {
    const store = new EditorDocumentStore<TestDocument>({ value: 0 });
    const stack = new EditorCommandStack<TestDocument>();
    stack.pushSnapshotBoundary("Brush stroke", store.getDocument(), cloneDocument);
    store.replace({ value: 1 });
    store.replace({ value: 2 });
    store.replace({ value: 3 });

    expect(stack.getState().undoDepth).toBe(1);
    expect(stack.undo(store)).toEqual({ value: 0 });
    expect(stack.redo(store)).toEqual({ value: 3 });
  });

  it("clears redo when a new command starts", () => {
    const store = new EditorDocumentStore<TestDocument>({ value: 0 });
    const stack = new EditorCommandStack<TestDocument>();
    stack.pushSnapshotBoundary("First", store.getDocument(), cloneDocument);
    store.replace({ value: 1 });
    stack.undo(store);
    stack.pushSnapshotBoundary("Second", store.getDocument(), cloneDocument);
    expect(stack.getState().canRedo).toBe(false);
  });
});

describe("EditorSelectionService", () => {
  it("keeps primary and multi-selection independent from UI", () => {
    const selection = new EditorSelectionService<string>();
    selection.setPrimary("lamp");
    selection.select("trigger", "add");
    expect(selection.getState()).toMatchObject({
      items: ["lamp", "trigger"],
      primary: "trigger",
    });
    selection.select("trigger", "toggle");
    expect(selection.getState()).toMatchObject({
      items: ["lamp"],
      primary: "lamp",
    });
  });

  it("replaces a range atomically and removes semantic duplicates", () => {
    const selection = new EditorSelectionService<{ id: string }>(
      (left, right) => left.id === right.id,
    );
    const listener = vi.fn();
    selection.subscribe(listener);
    selection.replaceMany(
      [{ id: "lamp" }, { id: "trigger" }, { id: "lamp" }],
      { id: "lamp" },
    );
    expect(selection.getState()).toMatchObject({
      items: [{ id: "lamp" }, { id: "trigger" }],
      primary: { id: "lamp" },
    });
    expect(listener).toHaveBeenCalledOnce();
  });
});

describe("EditorToolRegistry", () => {
  it("owns active tool and runs lifecycle hooks", () => {
    const deactivate = vi.fn();
    const activate = vi.fn();
    const registry = new EditorToolRegistry(
      [
        { id: "select", label: "Select", onDeactivate: deactivate },
        { id: "brush", label: "Brush", onActivate: activate },
      ] as const,
      "select",
    );

    expect(registry.activate("brush")).toBe(true);
    expect(registry.getActiveId()).toBe("brush");
    expect(deactivate).toHaveBeenCalledOnce();
    expect(activate).toHaveBeenCalledOnce();
  });
});

describe("EditorCore", () => {
  it("resets document-scoped history and selection together", () => {
    const core = new EditorCore<TestDocument, string, "select" | "brush">({
      document: { value: 1 },
      tools: [
        { id: "select", label: "Select" },
        { id: "brush", label: "Brush" },
      ],
      initialTool: "select",
    });
    core.selection.setPrimary("lamp");
    core.commands.pushSnapshotBoundary(
      "Edit",
      core.documents.getDocument(),
      cloneDocument,
    );
    core.documents.replace({ value: 2 });

    core.resetDocument({ value: 10 });
    expect(core.documents.getState()).toMatchObject({
      document: { value: 10 },
      dirty: false,
    });
    expect(core.commands.getState().canUndo).toBe(false);
    expect(core.selection.getPrimary()).toBeNull();
  });
});
