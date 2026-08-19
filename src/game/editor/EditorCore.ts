import { EditorCommandStack } from "./EditorCommandStack";
import { EditorDocumentStore } from "./EditorDocumentStore";
import { EditorSelectionService } from "./EditorSelectionService";
import {
  EditorToolRegistry,
  type EditorToolDefinition,
} from "./EditorToolRegistry";

export type EditorCoreOptions<
  TDocument,
  TSelection,
  TToolId extends string,
> = Readonly<{
  document: TDocument;
  tools: readonly EditorToolDefinition<TToolId>[];
  initialTool: TToolId;
  historyLimit?: number;
  selectionEquals?: (left: TSelection, right: TSelection) => boolean;
}>;

/** Shared headless services for one open editor document. */
export class EditorCore<
  TDocument,
  TSelection,
  TToolId extends string,
> {
  readonly documents: EditorDocumentStore<TDocument>;
  readonly commands: EditorCommandStack<TDocument>;
  readonly selection: EditorSelectionService<TSelection>;
  readonly tools: EditorToolRegistry<TToolId>;

  constructor(options: EditorCoreOptions<TDocument, TSelection, TToolId>) {
    this.documents = new EditorDocumentStore(options.document);
    this.commands = new EditorCommandStack(options.historyLimit ?? 30);
    this.selection = new EditorSelectionService(options.selectionEquals);
    this.tools = new EditorToolRegistry(options.tools, options.initialTool);
  }

  /** Open another document without leaking undo or scene selection into it. */
  resetDocument(document: TDocument): void {
    this.commands.clear();
    this.selection.clear();
    this.documents.syncExternal(document);
    this.documents.markSaved();
  }
}
