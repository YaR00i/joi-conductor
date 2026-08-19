export type EditorSelectionMode = "replace" | "add" | "toggle";

export type EditorSelectionState<TSelection> = Readonly<{
  items: readonly TSelection[];
  primary: TSelection | null;
  revision: number;
}>;

type Listener = () => void;

/** Selection is independent from tools, panels and asset browsing. */
export class EditorSelectionService<TSelection> {
  private listeners = new Set<Listener>();
  private state: EditorSelectionState<TSelection> = {
    items: [],
    primary: null,
    revision: 0,
  };

  constructor(
    private readonly equals: (
      left: TSelection,
      right: TSelection,
    ) => boolean = Object.is,
  ) {}

  readonly getState = (): EditorSelectionState<TSelection> => this.state;

  getPrimary(): TSelection | null {
    return this.state.primary;
  }

  setPrimary(selection: TSelection | null): void {
    if (selection == null) {
      this.clear();
      return;
    }
    if (
      this.state.items.length === 1 &&
      this.state.primary != null &&
      this.equals(this.state.primary, selection)
    ) {
      return;
    }
    this.setItems([selection], selection);
  }

  updatePrimary(
    updater: (current: TSelection | null) => TSelection | null,
  ): void {
    this.setPrimary(updater(this.state.primary));
  }

  select(selection: TSelection, mode: EditorSelectionMode = "replace"): void {
    if (mode === "replace") {
      this.setPrimary(selection);
      return;
    }
    const index = this.state.items.findIndex((item) =>
      this.equals(item, selection),
    );
    if (mode === "toggle" && index >= 0) {
      const items = this.state.items.filter((_, itemIndex) => itemIndex !== index);
      this.setItems(items, items[items.length - 1] ?? null);
      return;
    }
    if (index >= 0) {
      this.setItems(this.state.items, selection);
      return;
    }
    this.setItems([...this.state.items, selection], selection);
  }

  /** Atomically replaces the selection, preserving one explicit primary item. */
  replaceMany(
    selections: readonly TSelection[],
    primary: TSelection | null = selections[selections.length - 1] ?? null,
  ): void {
    const unique = selections.filter(
      (selection, index, all) =>
        all.findIndex((candidate) => this.equals(candidate, selection)) === index,
    );
    const resolvedPrimary =
      primary == null
        ? null
        : unique.find((selection) => this.equals(selection, primary)) ??
          unique[unique.length - 1] ??
          null;
    const unchanged =
      unique.length === this.state.items.length &&
      unique.every((selection, index) =>
        this.equals(selection, this.state.items[index]),
      ) &&
      ((resolvedPrimary == null && this.state.primary == null) ||
        (resolvedPrimary != null &&
          this.state.primary != null &&
          this.equals(resolvedPrimary, this.state.primary)));
    if (unchanged) return;
    this.setItems(unique, resolvedPrimary);
  }

  clear(): void {
    if (this.state.items.length === 0 && this.state.primary == null) return;
    this.setItems([], null);
  }

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private setItems(
    items: readonly TSelection[],
    primary: TSelection | null,
  ): void {
    this.state = {
      items,
      primary,
      revision: this.state.revision + 1,
    };
    for (const listener of this.listeners) listener();
  }
}
