export type EditorDocumentChangeSource =
  | "external"
  | "command"
  | "undo"
  | "redo"
  | "normalization";

export type EditorDocumentState<TDocument> = Readonly<{
  document: TDocument;
  revision: number;
  dirty: boolean;
  source: EditorDocumentChangeSource;
}>;

export type EditorDocumentReplaceOptions = Readonly<{
  source?: EditorDocumentChangeSource;
  dirty?: boolean;
}>;

type Listener = () => void;

/**
 * Headless owner for an editor document.
 *
 * React components subscribe to state, while commands and tools work directly
 * with the store. The authored document remains serializable and contains no
 * UI/runtime state.
 */
export class EditorDocumentStore<TDocument> {
  private listeners = new Set<Listener>();
  private state: EditorDocumentState<TDocument>;

  constructor(initialDocument: TDocument) {
    this.state = {
      document: initialDocument,
      revision: 0,
      dirty: false,
      source: "external",
    };
  }

  readonly getState = (): EditorDocumentState<TDocument> => this.state;

  getDocument(): TDocument {
    return this.state.document;
  }

  replace(
    document: TDocument,
    options: EditorDocumentReplaceOptions = {},
  ): EditorDocumentState<TDocument> {
    const source = options.source ?? "command";
    const dirty = options.dirty ?? source !== "external";
    if (
      Object.is(document, this.state.document) &&
      dirty === this.state.dirty &&
      source === this.state.source
    ) {
      return this.state;
    }
    this.state = {
      document,
      revision: this.state.revision + 1,
      dirty,
      source,
    };
    this.emit();
    return this.state;
  }

  syncExternal(document: TDocument): EditorDocumentState<TDocument> {
    if (Object.is(document, this.state.document)) return this.state;
    return this.replace(document, { source: "external", dirty: false });
  }

  markSaved(): EditorDocumentState<TDocument> {
    if (!this.state.dirty) return this.state;
    this.state = {
      ...this.state,
      revision: this.state.revision + 1,
      dirty: false,
    };
    this.emit();
    return this.state;
  }

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
