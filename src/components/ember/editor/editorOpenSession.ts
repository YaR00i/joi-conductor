/**
 * Per-browser-tab session: whether the user already opened an object
 * in voxel / tile / sprite editors, and which id to restore on revisit.
 */

export type EmberEditorOpenKind = "voxel" | "tile" | "sprite";

type SessionEntry = {
  opened: boolean;
  id: string | null;
};

function storageKey(kind: EmberEditorOpenKind): string {
  return `ember-ed-open:${kind}`;
}

function readEntry(kind: EmberEditorOpenKind): SessionEntry {
  try {
    const raw = sessionStorage.getItem(storageKey(kind));
    if (!raw) return { opened: false, id: null };
    const parsed = JSON.parse(raw) as Partial<SessionEntry>;
    return {
      opened: Boolean(parsed.opened),
      id: typeof parsed.id === "string" ? parsed.id : null,
    };
  } catch {
    return { opened: false, id: null };
  }
}

function writeEntry(kind: EmberEditorOpenKind, entry: SessionEntry): void {
  try {
    sessionStorage.setItem(storageKey(kind), JSON.stringify(entry));
  } catch {
    /* private mode / quota */
  }
}

export function hasOpenedEditor(kind: EmberEditorOpenKind): boolean {
  return readEntry(kind).opened;
}

export function getLastOpenedId(kind: EmberEditorOpenKind): string | null {
  const e = readEntry(kind);
  return e.opened ? e.id : null;
}

export function markEditorOpened(
  kind: EmberEditorOpenKind,
  id: string | null,
): void {
  writeEntry(kind, { opened: true, id });
}
