export type EditorToolDefinition<TToolId extends string> = Readonly<{
  id: TToolId;
  label: string;
  shortcut?: string;
  metadata?: Readonly<Record<string, unknown>>;
  canActivate?: () => boolean;
  onActivate?: () => void;
  onDeactivate?: () => void;
}>;

export type EditorToolRegistryState<TToolId extends string> = Readonly<{
  activeId: TToolId;
  tools: readonly EditorToolDefinition<TToolId>[];
  revision: number;
}>;

type Listener = () => void;

/** Central source of truth for editor modes/tools and their lifecycle. */
export class EditorToolRegistry<TToolId extends string> {
  private listeners = new Set<Listener>();
  private definitions = new Map<TToolId, EditorToolDefinition<TToolId>>();
  private state: EditorToolRegistryState<TToolId>;

  constructor(
    tools: readonly EditorToolDefinition<TToolId>[],
    activeId: TToolId,
  ) {
    for (const tool of tools) this.definitions.set(tool.id, tool);
    if (!this.definitions.has(activeId)) {
      throw new Error(`Unknown initial editor tool: ${activeId}`);
    }
    this.state = {
      activeId,
      tools: [...this.definitions.values()],
      revision: 0,
    };
  }

  readonly getState = (): EditorToolRegistryState<TToolId> => this.state;

  getActiveId(): TToolId {
    return this.state.activeId;
  }

  get(id: TToolId): EditorToolDefinition<TToolId> | null {
    return this.definitions.get(id) ?? null;
  }

  register(tool: EditorToolDefinition<TToolId>): void {
    this.definitions.set(tool.id, tool);
    this.refresh(this.state.activeId);
  }

  activate(id: TToolId): boolean {
    const next = this.definitions.get(id);
    if (!next || next.canActivate?.() === false) return false;
    if (id === this.state.activeId) return true;
    this.definitions.get(this.state.activeId)?.onDeactivate?.();
    next.onActivate?.();
    this.refresh(id);
    return true;
  }

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private refresh(activeId: TToolId): void {
    this.state = {
      activeId,
      tools: [...this.definitions.values()],
      revision: this.state.revision + 1,
    };
    for (const listener of this.listeners) listener();
  }
}
