import { useCallback, useMemo, useState } from "react";
import { writeEmberJson } from "../../../game/content/io";
import {
  SHOP_CATALOG_REL,
  shopsFileFromPack,
} from "../../../game/content/emberShop";
import { itemDisplayName } from "../../../game/content/emberItem";
import type {
  EmberItemDef,
  EmberPack,
  EmberShopDef,
  EmberShopListing,
} from "../../../game/content/types";
import {
  createBlankListing,
  createBlankShop,
  duplicateShop,
  removeListing,
  renameShopId,
  upsertListing,
} from "./shopEditorHelpers";

type Props = {
  pack: EmberPack;
  onChangePack: (pack: EmberPack) => void;
  onSaved: (msg: string) => void;
};

function sortedShops(pack: EmberPack): EmberShopDef[] {
  return Object.values(pack.shops ?? {}).sort((a, b) =>
    a.nameRu.localeCompare(b.nameRu, "ru"),
  );
}

function sortedItems(pack: EmberPack): EmberItemDef[] {
  return Object.values(pack.items ?? {}).sort((a, b) =>
    a.nameRu.localeCompare(b.nameRu, "ru"),
  );
}

export function ShopsEditorPanel({ pack, onChangePack, onSaved }: Props) {
  const shops = pack.shops ?? {};
  const list = useMemo(() => sortedShops(pack), [pack]);
  const items = useMemo(() => sortedItems(pack), [pack]);
  const [selectedId, setSelectedId] = useState<string | null>(
    () => list[0]?.id ?? null,
  );
  const [query, setQuery] = useState("");

  const selected = selectedId ? shops[selectedId] : undefined;
  const filtered = list.filter((shop) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return `${shop.id} ${shop.nameRu}`.toLowerCase().includes(q);
  });

  const commit = useCallback(
    (nextShops: Record<string, EmberShopDef>, focusId?: string | null) => {
      onChangePack({ ...pack, shops: nextShops });
      if (focusId !== undefined) setSelectedId(focusId);
    },
    [onChangePack, pack],
  );

  const patchSelected = (next: EmberShopDef) => {
    if (!selected) return;
    if (next.id !== selected.id) {
      const renamed = { ...shops };
      delete renamed[selected.id];
      renamed[next.id] = next;
      commit(renamed, next.id);
      return;
    }
    commit({ ...shops, [next.id]: next }, next.id);
  };

  const save = async () => {
    const file = shopsFileFromPack(shops);
    const res = await writeEmberJson(SHOP_CATALOG_REL, file);
    onSaved(
      res.ok
        ? `Каталог магазинов сохранён (${Object.keys(shops).length})`
        : `Магазины: ${"error" in res ? res.error : "?"}`,
    );
  };

  const create = () => {
    const shop = createBlankShop(Object.keys(shops));
    commit({ ...shops, [shop.id]: shop }, shop.id);
  };

  const duplicate = () => {
    if (!selected) return;
    const copy = duplicateShop(selected, Object.keys(shops));
    commit({ ...shops, [copy.id]: copy }, copy.id);
  };

  const remove = () => {
    if (!selected) return;
    if (
      !window.confirm(`Удалить магазин «${selected.nameRu}» (${selected.id})?`)
    ) {
      return;
    }
    const next = { ...shops };
    delete next[selected.id];
    commit(next, Object.keys(next)[0] ?? null);
  };

  const patchListing = (index: number, patch: Partial<EmberShopListing>) => {
    if (!selected) return;
    const current = selected.listings[index];
    if (!current) return;
    const merged: EmberShopListing = { ...current, ...patch };
    if (patch.stock === undefined && "stock" in patch) {
      delete merged.stock;
    }
    patchSelected(upsertListing(selected, merged, current.itemId));
  };

  return (
    <div className="ember-items-root">
      <aside className="ember-sprite-list ember-items-list">
        <div className="ember-sprite-list__head">
          <h3 className="ember-sprite-list__title">Магазины</h3>
          <div className="ember-items-list__ops">
            <button
              type="button"
              className="ember-chip ember-chip--sm"
              onClick={create}
              title="Создать магазин"
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
            filtered.map((shop) => (
              <button
                key={shop.id}
                type="button"
                className={`ember-items-row ${shop.id === selectedId ? "is-active" : ""}`}
                onClick={() => setSelectedId(shop.id)}
              >
                <span className="ember-items-row__text">
                  <strong>{shop.nameRu}</strong>
                  <span className="muted">
                    {shop.id} · {shop.listings.length} поз.
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      </aside>

      <div className="ember-sprite-editor ember-items-editor">
        {!selected ? (
          <p className="muted ember-sprite-editor__empty">
            Выберите магазин слева или создайте новый.
          </p>
        ) : (
          <>
            <div className="ember-sprite-chrome">
              <label className="ember-sprite-chrome__name">
                <span className="muted">Имя</span>
                <input
                  value={selected.nameRu}
                  onChange={(e) =>
                    patchSelected({ ...selected, nameRu: e.target.value })
                  }
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
                    const renamed = renameShopId(
                      selected,
                      e.target.value,
                      Object.keys(shops),
                    );
                    if (!renamed || renamed.id === selected.id) return;
                    patchSelected(renamed);
                  }}
                />
              </label>
            </div>

            <div className="ember-shops-listings">
              <div className="ember-shops-listings__head">
                <h4 className="ember-sprite-list__title">Ассортимент</h4>
                <button
                  type="button"
                  className="ember-chip ember-chip--sm"
                  onClick={() => {
                    const taken = new Set(selected.listings.map((row) => row.itemId));
                    const nextItem =
                      items.find((item) => !taken.has(item.id))?.id ?? "herb";
                    patchSelected(
                      upsertListing(selected, createBlankListing(nextItem)),
                    );
                  }}
                >
                  + товар
                </button>
              </div>
              {selected.listings.length === 0 ? (
                <p className="muted ember-hint">Нет позиций — добавьте товар.</p>
              ) : (
                <table className="ember-shops-table">
                  <thead>
                    <tr>
                      <th>Предмет</th>
                      <th>Покупка</th>
                      <th>Продажа</th>
                      <th>Сток</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {selected.listings.map((row, index) => (
                      <tr key={`${row.itemId}-${index}`}>
                        <td>
                          <select
                            value={row.itemId}
                            onChange={(e) =>
                              patchListing(index, { itemId: e.target.value })
                            }
                          >
                            {!items.some((item) => item.id === row.itemId) ? (
                              <option value={row.itemId}>{row.itemId}</option>
                            ) : null}
                            {items.map((item) => (
                              <option key={item.id} value={item.id}>
                                {itemDisplayName(item, item.id)}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            type="number"
                            min={0}
                            value={row.buyPrice}
                            onChange={(e) =>
                              patchListing(index, {
                                buyPrice: Number(e.target.value) || 0,
                              })
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min={0}
                            value={row.sellPrice ?? ""}
                            placeholder="½"
                            onChange={(e) =>
                              patchListing(index, {
                                sellPrice:
                                  e.target.value === ""
                                    ? undefined
                                    : Number(e.target.value),
                              })
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min={0}
                            value={row.stock ?? ""}
                            placeholder="∞"
                            onChange={(e) =>
                              patchListing(index, {
                                stock:
                                  e.target.value === ""
                                    ? undefined
                                    : Number(e.target.value),
                              })
                            }
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="ghost ember-danger"
                            onClick={() =>
                              patchSelected(removeListing(selected, row.itemId))
                            }
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="muted ember-hint">
                Пустой сток = безлимит. Пустая продажа = половина покупки.
                Сохраняет <code>shops/catalog.json</code>. Не зона Shop —
                киоск на карте с interactivity shop + shopId.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
