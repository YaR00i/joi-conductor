import { useState } from "react";
import type { EmberItemDef, EmberItemIcon } from "../../game/content/types";
import { resolveItemIconPixels } from "../../game/content/emberItem";
import type { ShopListingView } from "../../game/content/emberShop";
import { ItemIconPreview } from "./editor/ItemIconPreview";

export type EmberShopPanelState = {
  shopId: string;
  nameRu: string;
  wallet: number;
  listings: ShopListingView[];
  sellable: Array<{
    itemId: string;
    nameRu: string;
    count: number;
    sellPrice: number;
  }>;
  errorRu: string | null;
};

type Props = {
  shop: EmberShopPanelState;
  items: Record<string, EmberItemDef> | undefined;
  itemIcons: Record<string, EmberItemIcon> | undefined;
  onBuy: (itemId: string) => void;
  onSell: (itemId: string) => void;
  onClose: () => void;
};

export function EmberShopPanel({
  shop,
  items,
  itemIcons,
  onBuy,
  onSell,
  onClose,
}: Props) {
  const [tab, setTab] = useState<"buy" | "sell">("buy");
  return (
    <div className="ember-shop-overlay" role="dialog" aria-modal="true" aria-label={shop.nameRu}>
      <div className="ember-shop-card">
        <header className="ember-shop-card__head">
          <div>
            <p className="ember-play__kicker muted">Лавка</p>
            <h2>{shop.nameRu}</h2>
          </div>
          <p className="ember-shop-card__wallet" title="Монеты">
            {shop.wallet} монет
          </p>
        </header>
        <div className="ember-shop-card__tabs">
          <button
            type="button"
            className={tab === "buy" ? "is-on" : ""}
            onClick={() => setTab("buy")}
          >
            Купить
          </button>
          <button
            type="button"
            className={tab === "sell" ? "is-on" : ""}
            onClick={() => setTab("sell")}
          >
            Продать
          </button>
        </div>
        {shop.errorRu ? (
          <p className="ember-shop-card__error" role="status">
            {shop.errorRu}
          </p>
        ) : null}
        <ul className="ember-shop-list">
          {tab === "buy"
            ? shop.listings.map((row) => {
                const icon = resolveItemIconPixels(items?.[row.itemId], itemIcons);
                const soldOut = row.stock === 0;
                const broke = shop.wallet < row.buyPrice;
                return (
                  <li key={row.itemId} className="ember-shop-row">
                    <ItemIconPreview
                      pixels={icon?.pixels}
                      size={icon?.size}
                      display={32}
                      title={row.nameRu}
                    />
                    <div className="ember-shop-row__meta">
                      <strong>{row.nameRu}</strong>
                      <span className="muted">
                        {row.buyPrice} монет
                        {row.stock == null ? "" : ` · остаток ${row.stock}`}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="primary"
                      disabled={soldOut || broke}
                      onClick={() => onBuy(row.itemId)}
                    >
                      Купить
                    </button>
                  </li>
                );
              })
            : shop.sellable.map((row) => {
                const icon = resolveItemIconPixels(items?.[row.itemId], itemIcons);
                return (
                  <li key={row.itemId} className="ember-shop-row">
                    <ItemIconPreview
                      pixels={icon?.pixels}
                      size={icon?.size}
                      display={32}
                      title={row.nameRu}
                    />
                    <div className="ember-shop-row__meta">
                      <strong>{row.nameRu}</strong>
                      <span className="muted">
                        ×{row.count} · {row.sellPrice} монет
                      </span>
                    </div>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => onSell(row.itemId)}
                    >
                      Продать
                    </button>
                  </li>
                );
              })}
        </ul>
        {tab === "sell" && shop.sellable.length === 0 ? (
          <p className="muted ember-shop-card__empty">Нечего продать этой лавке</p>
        ) : null}
        <button type="button" className="ghost ember-shop-card__close" onClick={onClose}>
          Закрыть
        </button>
        <p className="muted ember-shop-card__hint">Esc закрывает лавку</p>
      </div>
    </div>
  );
}
