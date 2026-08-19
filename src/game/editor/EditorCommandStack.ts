import {
  EditorDocumentStore,
  type EditorDocumentChangeSource,
} from "./EditorDocumentStore";

export type EditorCommand<TDocument> = Readonly<{
  id: string;
  label: string;
  execute(document: TDocument): TDocument;
  undo(document: TDocument): TDocument;
  redo?(document: TDocument): TDocument;
}>;

export type EditorCommandStackState = Readonly<{
  undoDepth: number;
  redoDepth: number;
  canUndo: boolean;
  canRedo: boolean;
  lastUndoLabel: string | null;
  lastRedoLabel: string | null;
  revision: number;
}>;

type Listener = () => void;

type StoredCommand<TDocument> = {
  command: EditorCommand<TDocument>;
};

/** Command that replaces a complete serializable document. */
export function createDocumentReplaceCommand<TDocument>(options: {
  id: string;
  label: string;
  before: TDocument;
  after: TDocument;
}): EditorCommand<TDocument> {
  return {
    id: options.id,
    label: options.label,
    execute: () => options.after,
    undo: () => options.before,
    redo: () => options.after,
  };
}

/**
 * Snapshot boundary used while legacy tools stream several preview updates.
 * The final state is captured lazily on the first undo, so one drag remains
 * one history entry. New tools should prefer explicit granular commands.
 */
function createDeferredDocumentCommand<TDocument>(options: {
  id: string;
  label: string;
  before: TDocument;
  clone: (document: TDocument) => TDocument;
}): EditorCommand<TDocument> {
  let after: TDocument | null = null;
  return {
    id: options.id,
    label: options.label,
    execute: (document) => document,
    undo: (document) => {
      if (after == null) after = options.clone(document);
      return options.clone(options.before);
    },
    redo: (document) => (after == null ? document : options.clone(after)),
  };
}

/**
 * Central undo/redo pipeline. It is UI-agnostic and updates a DocumentStore,
 * making command execution identical for the viewport, Inspector and future
 * Creative mode.
 */
export class EditorCommandStack<TDocument> {
  private undoEntries: StoredCommand<TDocument>[] = [];
  private redoEntries: StoredCommand<TDocument>[] = [];
  private listeners = new Set<Listener>();
  private revision = 0;
  private sequence = 0;
  private state: EditorCommandStackState = {
    undoDepth: 0,
    redoDepth: 0,
    canUndo: false,
    canRedo: false,
    lastUndoLabel: null,
    lastRedoLabel: null,
    revision: 0,
  };

  constructor(private readonly maxDepth = 30) {}

  readonly getState = (): EditorCommandStackState => this.state;

  execute(
    command: EditorCommand<TDocument>,
    store: EditorDocumentStore<TDocument>,
  ): TDocument {
    const next = command.execute(store.getDocument());
    this.pushUndo(command);
    store.replace(next, { source: "command", dirty: true });
    return next;
  }

  /** Transitional adapter for tools that already mutate after pushHistory. */
  pushSnapshotBoundary(
    label: string,
    before: TDocument,
    clone: (document: TDocument) => TDocument,
  ): void {
    this.pushUndo(
      createDeferredDocumentCommand({
        id: `snapshot:${++this.sequence}`,
        label,
        before: clone(before),
        clone,
      }),
    );
  }

  undo(store: EditorDocumentStore<TDocument>): TDocument | null {
    const entry = this.undoEntries.pop();
    if (!entry) return null;
    const next = entry.command.undo(store.getDocument());
    this.redoEntries = this.trim([...this.redoEntries, entry]);
    store.replace(next, { source: "undo", dirty: true });
    this.refreshState();
    return next;
  }

  redo(store: EditorDocumentStore<TDocument>): TDocument | null {
    const entry = this.redoEntries.pop();
    if (!entry) return null;
    const redo = entry.command.redo ?? entry.command.execute;
    const next = redo(store.getDocument());
    this.undoEntries = this.trim([...this.undoEntries, entry]);
    store.replace(next, { source: "redo", dirty: true });
    this.refreshState();
    return next;
  }

  discardLatestUndo(): void {
    if (this.undoEntries.length === 0) return;
    this.undoEntries.pop();
    this.refreshState();
  }

  clear(): void {
    if (this.undoEntries.length === 0 && this.redoEntries.length === 0) return;
    this.undoEntries = [];
    this.redoEntries = [];
    this.refreshState();
  }

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private pushUndo(command: EditorCommand<TDocument>): void {
    this.undoEntries = this.trim([...this.undoEntries, { command }]);
    this.redoEntries = [];
    this.refreshState();
  }

  private trim(
    entries: StoredCommand<TDocument>[],
  ): StoredCommand<TDocument>[] {
    return entries.slice(-Math.max(1, this.maxDepth));
  }

  private refreshState(): void {
    this.revision += 1;
    this.state = {
      undoDepth: this.undoEntries.length,
      redoDepth: this.redoEntries.length,
      canUndo: this.undoEntries.length > 0,
      canRedo: this.redoEntries.length > 0,
      lastUndoLabel:
        this.undoEntries[this.undoEntries.length - 1]?.command.label ?? null,
      lastRedoLabel:
        this.redoEntries[this.redoEntries.length - 1]?.command.label ?? null,
      revision: this.revision,
    };
    for (const listener of this.listeners) listener();
  }
}

export function commandSourceForHistoryAction(
  action: "execute" | "undo" | "redo",
): EditorDocumentChangeSource {
  if (action === "undo") return "undo";
  if (action === "redo") return "redo";
  return "command";
}
