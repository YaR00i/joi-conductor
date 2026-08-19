export type EditorSceneStateSnapshot = Readonly<{
  revision: number;
  hiddenKeys: readonly string[];
  lockedKeys: readonly string[];
}>;

type Listener = () => void;

/** Transient editor-only state for scene objects; never mutates the document. */
export class EditorSceneState {
  private hidden = new Set<string>();
  private locked = new Set<string>();
  private listeners = new Set<Listener>();
  private revision = 0;
  private snapshot: EditorSceneStateSnapshot = {
    revision: 0,
    hiddenKeys: [],
    lockedKeys: [],
  };

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): EditorSceneStateSnapshot => this.snapshot;

  isHidden(key: string): boolean {
    return this.hidden.has(key);
  }

  isLocked(key: string): boolean {
    return this.locked.has(key);
  }

  setHidden(key: string, hidden: boolean): void {
    this.updateSet(this.hidden, key, hidden);
  }

  setLocked(key: string, locked: boolean): void {
    this.updateSet(this.locked, key, locked);
  }

  setHiddenMany(keys: Iterable<string>, hidden: boolean): void {
    this.updateMany(this.hidden, keys, hidden);
  }

  setLockedMany(keys: Iterable<string>, locked: boolean): void {
    this.updateMany(this.locked, keys, locked);
  }

  toggleHidden(key: string): boolean {
    const next = !this.hidden.has(key);
    this.setHidden(key, next);
    return next;
  }

  toggleLocked(key: string): boolean {
    const next = !this.locked.has(key);
    this.setLocked(key, next);
    return next;
  }

  prune(validKeys: Iterable<string>): void {
    const valid = new Set(validKeys);
    const hidden = new Set([...this.hidden].filter((key) => valid.has(key)));
    const locked = new Set([...this.locked].filter((key) => valid.has(key)));
    if (
      hidden.size === this.hidden.size &&
      locked.size === this.locked.size &&
      [...hidden].every((key) => this.hidden.has(key)) &&
      [...locked].every((key) => this.locked.has(key))
    ) {
      return;
    }
    this.hidden = hidden;
    this.locked = locked;
    this.publish();
  }

  clear(): void {
    if (this.hidden.size === 0 && this.locked.size === 0) return;
    this.hidden.clear();
    this.locked.clear();
    this.publish();
  }

  private updateSet(target: Set<string>, key: string, enabled: boolean): void {
    const changed = enabled ? !target.has(key) : target.has(key);
    if (!changed) return;
    if (enabled) target.add(key);
    else target.delete(key);
    this.publish();
  }

  private updateMany(
    target: Set<string>,
    keys: Iterable<string>,
    enabled: boolean,
  ): void {
    let changed = false;
    for (const key of keys) {
      if (enabled ? !target.has(key) : target.has(key)) {
        changed = true;
        if (enabled) target.add(key);
        else target.delete(key);
      }
    }
    if (changed) this.publish();
  }

  private publish(): void {
    this.revision += 1;
    this.snapshot = {
      revision: this.revision,
      hiddenKeys: [...this.hidden].sort(),
      lockedKeys: [...this.locked].sort(),
    };
    for (const listener of this.listeners) listener();
  }
}
