import { useCallback, useMemo, useRef, useState } from "react";
import { writeEmberJson } from "../../../game/content/io";
import {
  EMBER_ITEM_KIND_LABELS_RU,
  EMBER_ITEM_RARITY_LABELS_RU,
  EMBER_ITEM_SLOT_LABELS_RU,
  EMBER_ITEM_USE_IN_LABELS_RU,
  ITEM_CATALOG_REL,
  ITEM_ICON_SIZE,
  emptyIconPixels,
  itemsFileFromPack,
  resolveItemIconPixels,
  slotAllowedForKind,
} from "../../../game/content/emberItem";
import {
  EMBER_ITEM_KINDS,
  EMBER_ITEM_RARITIES,
  EMBER_ITEM_SLOTS,
  EMBER_ITEM_USE_IN,
  type EmberItemDef,
  type EmberItemIcon,
  type EmberItemKind,
  type EmberItemRarity,
  type EmberItemSlot,
  type EmberItemUseIn,
  type EmberPack,
} from "../../../game/content/types";
import {
  applyItemKind,
  createBlankItem,
  duplicateItem,
  renameItemId,
} from "./itemEditorHelpers";
import {
  ITEM_ICON_PALETTE,
  ItemIconPainter,
  ItemIconPreview,
  downsampleImageToIcon,
} from "./ItemIconPreview";

type Props = {
  pack: EmberPack;
  onChangePack: (pack: EmberPack) => void;
  onSaved: (msg: string) => void;
};

function sortedItems(pack: EmberPack): EmberItemDef[] {
  return Object.values(pack.items ?? {}).sort((a, b) =>
    a.nameRu.localeCompare(b.nameRu, "ru"),
  );
}

export function ItemsEditorPanel({ pack, onChangePack, onSaved }: Props) {
  const items = pack.items ?? {};
  const icons = pack.itemIcons ?? {};
  const list = useMemo(() => sortedItems(pack), [pack]);
  const [selectedId, setSelectedId] = useState<string | null>(
    () => list[0]?.id ?? null,
  );
  const [query, setQuery] = useState("");
  const [paintColor, setPaintColor] = useState("#d4b44a");
  const fileRef = useRef<HTMLInputElement>(null);

  const selected = selectedId ? items[selectedId] : undefined;
  const filtered = list.filter((item) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [
      item.id,
      item.nameRu,
      item.name,
      item.kind,
      ...(item.tags ?? []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(q);
  });

  const commit = useCallback(
    (
      nextItems: Record<string, EmberItemDef>,
      nextIcons = icons,
      focusId?: string | null,
    ) => {
      onChangePack({ ...pack, items: nextItems, itemIcons: nextIcons });
      if (focusId !== undefined) setSelectedId(focusId);
    },
    [icons, onChangePack, pack],
  );

  const patchSelected = (patch: Partial<EmberItemDef>) => {
    if (!selected) return;
    let next: EmberItemDef = { ...selected, ...patch };
    if (patch.kind && patch.kind !== selected.kind) {
      next = applyItemKind(selected, patch.kind);
    }
    commit({ ...items, [selected.id]: next }, icons, selected.id);
  };

  const save = async () => {
    const file = itemsFileFromPack(items, icons);
    const res = await writeEmberJson(ITEM_CATALOG_REL, file);
    onSaved(
      res.ok
        ? `Каталог предметов сохранён (${Object.keys(items).length})`
        : `Предметы: ${"error" in res ? res.error : "?"}`,
    );
  };

  const create = (kind: EmberItemKind = "material") => {
    const item = createBlankItem(Object.keys(items), kind);
    commit({ ...items, [item.id]: item }, icons, item.id);
  };

  const duplicate = () => {
    if (!selected) return;
    const copy = duplicateItem(selected, Object.keys(items));
    commit({ ...items, [copy.id]: copy }, icons, copy.id);
  };

  const remove = () => {
    if (!selected) return;
    if (!window.confirm(`Удалить предмет «${selected.nameRu}» (${selected.id})?`)) {
      return;
    }
    const next = { ...items };
    delete next[selected.id];
    const fallback = Object.keys(next)[0] ?? null;
    commit(next, icons, fallback);
  };

  const applyIconId = (iconId: string) => {
    if (!selected) return;
    patchSelected({ iconId: iconId || undefined, iconPixels: undefined });
  };

  const paintPixels = (pixels: string[]) => {
    if (!selected) return;
    patchSelected({ iconPixels: pixels, iconId: selected.iconId });
  };

  const clearCustomPixels = () => {
    if (!selected) return;
    patchSelected({ iconPixels: undefined });
  };

  const onUploadPng = (file: File) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const pixels = downsampleImageToIcon(image, ITEM_ICON_SIZE);
      URL.revokeObjectURL(url);
      paintPixels(pixels);
    };
    image.onerror = () => URL.revokeObjectURL(url);
    image.src = url;
  };

  const iconPreview = selected
    ? resolveItemIconPixels(selected, icons)
    : null;
  const painterPixels =
    selected?.iconPixels ??
    iconPreview?.pixels ??
    emptyIconPixels(ITEM_ICON_SIZE);

  const allowedSlots: EmberItemSlot[] = selected
    ? EMBER_ITEM_SLOTS.filter((slot) => slotAllowedForKind(selected.kind, slot))
    : [...EMBER_ITEM_SLOTS];

  return (
    <div className="ember-items-root">
      <aside className="ember-sprite-list ember-items-list">
        <div className="ember-sprite-list__head">
          <h3 className="ember-sprite-list__title">Предметы</h3>
          <div className="ember-items-list__ops">
            <button
              type="button"
              className="ember-chip ember-chip--sm"
              onClick={() => create()}
              title="Создать предмет"
            >
              +
            </button>
          </div>
        </div>
        <input
          className="ember-items-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск…"
        />
        <div className="ember-items-list__scroll">
          {filtered.length === 0 ? (
            <p className="muted ember-hint">Пока пусто — нажмите +</p>
          ) : (
            filtered.map((item) => {
              const thumb = resolveItemIconPixels(item, icons);
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`ember-items-row ${item.id === selectedId ? "is-active" : ""}`}
                  onClick={() => setSelectedId(item.id)}
                >
                  <ItemIconPreview
                    pixels={thumb?.pixels}
                    size={thumb?.size ?? ITEM_ICON_SIZE}
                    display={28}
                  />
                  <span className="ember-items-row__text">
                    <strong>{item.nameRu}</strong>
                    <span className="muted">
                      {item.id} · {EMBER_ITEM_KIND_LABELS_RU[item.kind]}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      </aside>

      <div className="ember-sprite-editor ember-items-editor">
        {!selected ? (
          <p className="muted ember-sprite-editor__empty">
            Выберите предмет слева или создайте новый.
          </p>
        ) : (
          <>
            <div className="ember-sprite-chrome">
              <label className="ember-sprite-chrome__name">
                <span className="muted">Имя</span>
                <input
                  value={selected.nameRu}
                  onChange={(e) => patchSelected({ nameRu: e.target.value })}
                />
              </label>
              <div className="ember-sprite-chrome__actions">
                <button type="button" className="ghost" onClick={duplicate}>
                  Дублировать
                </button>
                <button type="button" className="primary" onClick={() => void save()}>
                  Сохранить
                </button>
                <button
                  type="button"
                  className="ghost ember-danger"
                  onClick={remove}
                >
                  Удалить
                </button>
              </div>
            </div>

            <div className="ember-items-form">
              <label>
                <span>id</span>
                <input
                  defaultValue={selected.id}
                  key={selected.id}
                  onBlur={(e) => {
                    const renamed = renameItemId(
                      selected,
                      e.target.value,
                      Object.keys(items),
                    );
                    if (!renamed || renamed.id === selected.id) return;
                    const next = { ...items };
                    delete next[selected.id];
                    next[renamed.id] = renamed;
                    commit(next, icons, renamed.id);
                  }}
                />
              </label>
              <label>
                <span>name</span>
                <input
                  value={selected.name ?? ""}
                  onChange={(e) =>
                    patchSelected({ name: e.target.value || undefined })
                  }
                />
              </label>
              <label>
                <span>Тип</span>
                <select
                  value={selected.kind}
                  onChange={(e) =>
                    patchSelected({ kind: e.target.value as EmberItemKind })
                  }
                >
                  {EMBER_ITEM_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {EMBER_ITEM_KIND_LABELS_RU[kind]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Слот</span>
                <select
                  value={selected.slot}
                  onChange={(e) =>
                    patchSelected({ slot: e.target.value as EmberItemSlot })
                  }
                >
                  {allowedSlots.map((slot) => (
                    <option key={slot} value={slot}>
                      {EMBER_ITEM_SLOT_LABELS_RU[slot]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Редкость</span>
                <select
                  value={selected.rarity}
                  onChange={(e) =>
                    patchSelected({ rarity: e.target.value as EmberItemRarity })
                  }
                >
                  {EMBER_ITEM_RARITIES.map((rarity) => (
                    <option key={rarity} value={rarity}>
                      {EMBER_ITEM_RARITY_LABELS_RU[rarity]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Где</span>
                <select
                  value={selected.useIn}
                  onChange={(e) =>
                    patchSelected({ useIn: e.target.value as EmberItemUseIn })
                  }
                >
                  {EMBER_ITEM_USE_IN.map((useIn) => (
                    <option key={useIn} value={useIn}>
                      {EMBER_ITEM_USE_IN_LABELS_RU[useIn]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Стек</span>
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={selected.stackMax}
                  onChange={(e) =>
                    patchSelected({
                      stackMax: Number(e.target.value) || 1,
                    })
                  }
                />
              </label>
              <label>
                <span>atk</span>
                <input
                  type="number"
                  value={selected.atk ?? ""}
                  placeholder="—"
                  onChange={(e) =>
                    patchSelected({
                      atk: e.target.value === "" ? undefined : Number(e.target.value),
                    })
                  }
                />
              </label>
              <label>
                <span>def</span>
                <input
                  type="number"
                  value={selected.def ?? ""}
                  placeholder="—"
                  onChange={(e) =>
                    patchSelected({
                      def: e.target.value === "" ? undefined : Number(e.target.value),
                    })
                  }
                />
              </label>
              <label>
                <span>HP</span>
                <input
                  type="number"
                  value={selected.hpRestore ?? ""}
                  placeholder="—"
                  onChange={(e) =>
                    patchSelected({
                      hpRestore:
                        e.target.value === "" ? undefined : Number(e.target.value),
                    })
                  }
                />
              </label>
              <label>
                <span>Продажа</span>
                <input
                  type="number"
                  min={0}
                  value={selected.sellPrice ?? ""}
                  placeholder="—"
                  onChange={(e) =>
                    patchSelected({
                      sellPrice:
                        e.target.value === ""
                          ? undefined
                          : Number(e.target.value),
                    })
                  }
                />
              </label>
              <label>
                <span>Не продаётся</span>
                <input
                  type="checkbox"
                  checked={selected.unsellable === true}
                  onChange={(e) =>
                    patchSelected({
                      unsellable: e.target.checked ? true : undefined,
                    })
                  }
                />
              </label>
              <label className="ember-items-form__wide">
                <span>Теги</span>
                <input
                  value={(selected.tags ?? []).join(", ")}
                  placeholder="currency, village"
                  onChange={(e) =>
                    patchSelected({
                      tags: e.target.value
                        .split(/[,;\s]+/)
                        .map((t) => t.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </label>
              <label className="ember-items-form__wide">
                <span>Заметка</span>
                <input
                  value={selected.notesRu ?? ""}
                  onChange={(e) =>
                    patchSelected({ notesRu: e.target.value || undefined })
                  }
                />
              </label>
            </div>

            <div className="ember-items-icons">
              <div className="ember-items-icons__pick">
                <h4 className="ember-sprite-list__title">Иконка</h4>
                <div className="ember-items-icons__grid">
                  {Object.values(icons).map((icon: EmberItemIcon) => (
                    <button
                      key={icon.id}
                      type="button"
                      className={`ember-items-icon-btn ${selected.iconId === icon.id ? "is-active" : ""}`}
                      title={icon.nameRu ?? icon.id}
                      onClick={() => applyIconId(icon.id)}
                    >
                      <ItemIconPreview
                        pixels={icon.pixels}
                        size={icon.size}
                        display={32}
                      />
                    </button>
                  ))}
                </div>
                <div className="ember-items-icons__ops">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => fileRef.current?.click()}
                  >
                    PNG 16×16
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={clearCustomPixels}
                    disabled={!selected.iconPixels}
                  >
                    Сброс рисунка
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/webp,image/jpeg"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) onUploadPng(file);
                    }}
                  />
                </div>
              </div>
              <div className="ember-items-icons__paint">
                <h4 className="ember-sprite-list__title">Рисунок 16×16</h4>
                <ItemIconPainter
                  pixels={painterPixels}
                  color={paintColor === "#00000000" ? "" : paintColor}
                  onChange={paintPixels}
                />
                <div className="ember-items-palette">
                  {ITEM_ICON_PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`ember-items-swatch ${paintColor === c ? "is-active" : ""}`}
                      style={{
                        background:
                          c === "#00000000"
                            ? "repeating-conic-gradient(#3a2a22 0 25%, #1a120e 0 50%) 0 0 / 8px 8px"
                            : c,
                      }}
                      title={c === "#00000000" ? "Ластик" : c}
                      onClick={() => setPaintColor(c)}
                    />
                  ))}
                </div>
                <p className="muted ember-hint">
                  ЛКМ — цвет, ПКМ — стереть. Оружие арены и JRPG — разные kind.
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
