import { useEffect, useState } from "react";
import {
  formatEmberLibraryTags,
  normalizeEmberLibraryTags,
} from "../../../game/content/libraryTags";
import type { EmberAssetReference } from "../../../game/editor/emberLibraryIndex";
import { summarizeLibraryReferences } from "../../../game/editor/emberLibraryIndex";

export function EmberLibraryTagsField({
  tags,
  onCommit,
  disabled,
}: {
  tags?: ReadonlyArray<string>;
  onCommit: (next: string[] | undefined) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState(formatEmberLibraryTags(tags));
  useEffect(() => {
    setText(formatEmberLibraryTags(tags));
  }, [tags]);

  return (
    <label className="ember-map-inspector__row ember-map-inspector__row--stack">
      <span>Теги</span>
      <input
        type="text"
        value={text}
        disabled={disabled}
        placeholder="village, street"
        title="Через запятую. Префиксы vox_vil_ / vox_fan_ ищутся и без явных тегов"
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onCommit(normalizeEmberLibraryTags(text))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
    </label>
  );
}

export function EmberLibraryUsageLine({
  refs,
  currentMapId,
  onFocus,
}: {
  refs: ReadonlyArray<EmberAssetReference>;
  currentMapId?: string;
  onFocus?: (ref: EmberAssetReference) => void;
}) {
  const summary = summarizeLibraryReferences(refs, currentMapId);
  if (summary.total === 0) {
    return (
      <p className="muted ember-lib-usage">На картах не используется</p>
    );
  }
  const firstHere = refs.find(
    (ref) =>
      ref.mapId === currentMapId &&
      ref.objectId &&
      (ref.kind === "voxelProp" ||
        ref.kind === "sprite" ||
        ref.kind === "chestModel" ||
        ref.kind === "chestScene"),
  );
  const other =
    summary.otherMaps.length > 0
      ? ` · ещё: ${summary.otherMaps.join(", ")}`
      : "";
  return (
    <div className="ember-lib-usage">
      <p className="muted ember-lib-usage__text">
        Используется: {summary.total}
        {currentMapId ? ` (${summary.onCurrent} здесь)` : ""}
        {other}
      </p>
      {firstHere && onFocus ? (
        <button
          type="button"
          className="ghost ember-lib-usage__jump"
          onClick={() => onFocus(firstHere)}
        >
          К размещению
        </button>
      ) : null}
    </div>
  );
}
