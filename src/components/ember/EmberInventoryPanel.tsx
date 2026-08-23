import { useState } from "react";
import type { EmberItemDef, EmberItemIcon } from "../../game/content/types";
import {
  EMBER_ITEM_KIND_LABELS_RU,
  resolveItemIconPixels,
} from "../../game/content/emberItem";
import {
  EMBER_EQUIP_SLOTS,
  EMBER_EQUIP_SLOT_LABELS_RU,
  type EmberEquipSlot,
  type EmberEquipment,
  type InventoryItemView,
} from "../../game/content/emberEquipment";
import { ItemIconPreview } from "./editor/ItemIconPreview";

export type EmberInventoryPanelState = {
  items: InventoryItemView[];
  equipment: EmberEquipment;
  atk: number;
  def: number;
  arenaAtk: number;
  errorRu: string | null;
};

type Props = {
  inventory: EmberInventoryPanelState;
  items: Record<string, EmberItemDef> | undefined;
  itemIcons: Record<string, EmberItemIcon> | undefined;
  onEquip: (itemId: string) => void;
  onUnequip: (slot: EmberEquipSlot) => void;
  onUse: (itemId: string) => void;
  onClose: () => void;
};

function itemTooltip(row: InventoryItemView): string {
  const parts = [row.nameRu, EMBER_ITEM_KIND_LABELS_RU[row.kind]];
  if (row.atk != null) parts.push(`atk ${row.atk}`);
  if (row.def != null) parts.push(`def ${row.def}`);
  if (row.hpRestore != null && row.hpRestore > 0) {
    parts.push(`HP +${row.hpRestore}`);
  }
  if (row.arenaOnly) parts.push("только арена");
  return parts.join(" · ");
}

function EquippedSlot({
  slot,
  itemId,
  items,
  itemIcons,
  onUnequip,
}: {
  slot: EmberEquipSlot;
  itemId: string | null;
  items: Record<string, EmberItemDef> | undefined;
  itemIcons: Record<string, EmberItemIcon> | undefined;
  onUnequip: (slot: EmberEquipSlot) => void;
}) {
  const def = itemId ? items?.[itemId] : undefined;
  const icon = resolveItemIconPixels(def, itemIcons);
  const name = def?.nameRu ?? itemId;
  return (
    <li className="ember-inv-slot">
      <span className="ember-inv-slot__label">
        {EMBER_EQUIP_SLOT_LABELS_RU[slot]}
      </span>
      <button
        type="button"
        className="ember-inv-slot__body"
        disabled={!itemId}
        title={itemId ? `${name} — снять` : "Пусто"}
        onClick={() => {
          if (itemId) onUnequip(slot);
        }}
      >
        <ItemIconPreview
          pixels={icon?.pixels}
          size={icon?.size}
          display={32}
          title={name ?? slot}
        />
        <span className={itemId ? "" : "muted"}>
          {itemId ? name : "—"}
        </span>
      </button>
    </li>
  );
}

export function EmberInventoryPanel({
  inventory,
  items,
  itemIcons,
  onEquip,
  onUnequip,
  onUse,
  onClose,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(
    inventory.items[0]?.itemId ?? null,
  );
  const selected =
    inventory.items.find((row) => row.itemId === selectedId) ??
    inventory.items[0] ??
    null;
  return (
    <div
      className="ember-inv-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Инвентарь"
    >
      <div className="ember-inv-card">
        <header className="ember-inv-card__head">
          <div>
            <p className="ember-play__kicker muted">Сумка</p>
            <h2>Инвентарь</h2>
          </div>
          <p
            className="ember-inv-card__stats"
            title="JRPG atk/def · арена atk (без оружия: 4 / 0)"
          >
            atk {inventory.atk} · def {inventory.def} · арена {inventory.arenaAtk}
          </p>
        </header>
        <ul className="ember-inv-slots">
          {EMBER_EQUIP_SLOTS.map((slot) => (
            <EquippedSlot
              key={slot}
              slot={slot}
              itemId={inventory.equipment[slot]}
              items={items}
              itemIcons={itemIcons}
              onUnequip={onUnequip}
            />
          ))}
        </ul>
        {inventory.errorRu ? (
          <p className="ember-inv-card__error" role="status">
            {inventory.errorRu}
          </p>
        ) : null}
        {inventory.items.length === 0 ? (
          <p className="muted ember-inv-card__empty">Сумка пуста</p>
        ) : (
          <ul className="ember-inv-grid">
            {inventory.items.map((row) => {
              const icon = resolveItemIconPixels(items?.[row.itemId], itemIcons);
              return (
                <li key={row.itemId}>
                  <button
                    type="button"
                    className={
                      row.itemId === selected?.itemId
                        ? "ember-inv-cell is-on"
                        : "ember-inv-cell"
                    }
                    title={itemTooltip(row)}
                    onClick={() => setSelectedId(row.itemId)}
                  >
                    <ItemIconPreview
                      pixels={icon?.pixels}
                      size={icon?.size}
                      display={32}
                      title={row.nameRu}
                    />
                    <span className="ember-inv-cell__name">{row.nameRu}</span>
                    <span className="ember-inv-cell__count">×{row.count}</span>
                    {row.arenaOnly ? (
                      <span className="ember-inv-cell__tag">арена</span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {selected ? (
          <div className="ember-inv-detail">
            <p>
              <strong>{selected.nameRu}</strong>
              <span className="muted">
                {" "}
                · {EMBER_ITEM_KIND_LABELS_RU[selected.kind]}
                {selected.atk != null ? ` · atk ${selected.atk}` : ""}
                {selected.def != null ? ` · def ${selected.def}` : ""}
                {selected.hpRestore != null && selected.hpRestore > 0
                  ? ` · HP +${selected.hpRestore}`
                  : ""}
                {selected.arenaOnly ? " · только арена" : ""}
              </span>
            </p>
            <div className="ember-inv-detail__actions">
              {selected.canEquip ? (
                <button
                  type="button"
                  className="primary"
                  onClick={() => onEquip(selected.itemId)}
                >
                  Надеть
                </button>
              ) : null}
              {selected.canUse ? (
                <button
                  type="button"
                  className="primary"
                  onClick={() => onUse(selected.itemId)}
                >
                  Использовать
                </button>
              ) : null}
              {selected.arenaOnly ? (
                <span className="muted">Слот «Арена» — для выживания</span>
              ) : null}
            </div>
          </div>
        ) : null}
        <button type="button" className="ghost ember-inv-card__close" onClick={onClose}>
          Закрыть
        </button>
        <p className="muted ember-inv-card__hint">I или Esc закрывает сумку</p>
      </div>
    </div>
  );
}
