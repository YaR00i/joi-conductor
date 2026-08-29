import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NavId } from "../components/SideNav";
import { MistressImg } from "../components/MistressImg";
import { TagTypePickerModal } from "../components/TagTypePickerModal";
import { TypewriterText } from "../components/TypewriterText";
import { useTagTypeCatalog } from "../components/useTagTypeCatalog";
import { getActiveMistress } from "../lib/mistress";
import {
  shopClickLine,
  shopGreetLine,
  shopIdleLine,
  shopPurchaseFailLine,
  shopPurchaseLine,
} from "../lib/shopDialogue";
import { consumeShopFocusTag } from "../lib/shopFocus";
import {
  shopFavoritesShelfEmptyHintRu,
  shopFavoritesShelfEmptyRu,
  shopOfferFromLikesRu,
  shopTasteLoopCtas,
} from "../lib/tasteLoopDisplay";
import {
  getTagType,
  groupTagsByType,
  setTagType,
  TAG_TYPE_META,
  tagTypeMeta,
  tagTypeSectionClass,
  getNativeTagType,
  type TagTypeId,
} from "../lib/tagTypes";
import { playUiNav, primeUiAudio } from "../lib/uiSound";
import {
  dynamicTagShopItem,
  isShopOwned,
  resolveShopItem,
  SHOP_CATALOG,
  TAG_PACKS,
  type ShopItem,
  type WalletState,
} from "../lib/wallet";

type BuyResult = boolean | "pending";

interface ShopPageProps {
  wallet: WalletState;
  /** Returns true when purchase succeeded. */
  onPurchase: (itemId: string) => boolean;
  onApplyTagPack: (packId: string) => void;
  onLoadMoreFavorites: () => Promise<{ loaded: number; hasMore: boolean }>;
  /** Search favorites beyond the loaded shelf; merges hits into wallet. */
  onSearchFavorites: (query: string) => Promise<number>;
  favoritesHasMore: boolean;
  /** Total likes in IndexedDB — for empty-shelf CTAs / copy. */
  favoritesCount?: number;
  onNavigate?: (id: NavId) => void;
}

type ShopTab = "favorites" | "premium";

const IDLE_MS_MIN = 14_000;
const IDLE_MS_MAX = 22_000;

const PREMIUM_KIND_ORDER: ShopItem["kind"][] = [
  "tag_pack",
  "mode",
  "mood",
  "function",
  "pattern",
  "feature",
  "character",
  "media_type",
  "fetish",
  "beg_bonus",
  "cum_boost",
];

function kindLabel(kind: ShopItem["kind"]): string {
  switch (kind) {
    case "function":
      return "Функция";
    case "pattern":
      return "Паттерн";
    case "tag_pack":
      return "Пак тегов";
    case "beg_bonus":
    case "cum_boost":
      return "Бонус";
    case "fetish":
    case "dyn_tag":
      return "Фетиш";
    case "mode":
      return "Режим";
    case "mood":
      return "Настроение";
    case "character":
      return "Архетип";
    case "media_type":
      return "Медиа";
    case "feature":
      return "Механика";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

function premiumSectionTitle(kind: ShopItem["kind"]): string {
  switch (kind) {
    case "tag_pack":
      return "Пакеты тегов";
    case "mode":
      return "Режимы";
    case "mood":
      return "Настроения";
    case "function":
      return "Функции";
    case "pattern":
      return "Паттерны";
    case "feature":
      return "Механики";
    case "character":
      return "Архетипы";
    case "media_type":
      return "Типы медиа";
    case "beg_bonus":
    case "cum_boost":
      return "Расходники";
    default:
      return kindLabel(kind);
  }
}

function isPremiumConsumable(item: ShopItem): boolean {
  return item.kind === "beg_bonus" || item.kind === "cum_boost";
}

function ShopCard({
  item,
  wallet,
  onBuy,
  onApplyTagPack,
  typeHint,
  likeCount,
}: {
  item: ShopItem;
  wallet: WalletState;
  onBuy: (item: ShopItem) => BuyResult;
  onApplyTagPack: (packId: string) => void;
  typeHint?: string;
  /** Favorite hit count for dyn_tag offers. */
  likeCount?: number;
}) {
  const owned = isShopOwned(wallet, item);
  const consumable = isPremiumConsumable(item);
  const tooPoor = wallet.balance < item.cost;
  const packMeta = item.kind === "tag_pack" ? TAG_PACKS[item.payload] : null;
  const packUnlocked =
    item.kind === "tag_pack" &&
    wallet.unlocks.tagPacks.includes(item.payload);
  const [flash, setFlash] = useState<"ok" | "no" | null>(null);
  const flashTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (flashTimerRef.current != null) {
        window.clearTimeout(flashTimerRef.current);
      }
    };
  }, []);

  function triggerFlash(kind: "ok" | "no") {
    if (flashTimerRef.current != null) {
      window.clearTimeout(flashTimerRef.current);
    }
    setFlash(kind);
    flashTimerRef.current = window.setTimeout(() => {
      setFlash(null);
      flashTimerRef.current = null;
    }, 700);
  }

  const fromLikes =
    item.kind === "dyn_tag" && likeCount != null && likeCount > 0
      ? shopOfferFromLikesRu(likeCount)
      : null;

  return (
    <article
      className={[
        "shop-card",
        owned && !consumable ? "is-owned" : "",
        flash === "ok" ? "is-flash-ok" : "",
        flash === "no" ? "is-flash-no" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="shop-card__meta">
        <span className="shop-card__kind">
          {typeHint ?? kindLabel(item.kind)}
        </span>
        <span className="shop-card__cost">{item.cost} ★</span>
      </div>
      <h2 className="shop-card__name">{item.nameRu}</h2>
      {fromLikes ? (
        <p className="shop-card__from-likes">{fromLikes}</p>
      ) : null}
      <p className="shop-card__desc">{item.descriptionRu}</p>
      {packMeta ? (
        <p className="shop-card__pack-tags" title={packMeta.tags}>
          {packMeta.tags.split(/\s+/).filter(Boolean).join(" · ")}
        </p>
      ) : null}
      <div className="shop-card__actions">
        {owned && !consumable ? (
          <span className="shop-card__owned">
            {item.kind === "dyn_tag" ? "Уже открыто" : "Куплено"}
          </span>
        ) : (
          <button
            type="button"
            className={`shop-card__buy${tooPoor ? " is-pricey" : ""}`}
            aria-label={
              tooPoor
                ? `Купить (не хватает угольков, нужно ${item.cost})`
                : "Купить"
            }
            onClick={() => {
              const result = onBuy(item);
              if (result === "pending") return;
              triggerFlash(result ? "ok" : "no");
            }}
          >
            Купить
          </button>
        )}
        {packUnlocked && packMeta ? (
          <button
            type="button"
            className="shop-card__apply"
            onClick={() => onApplyTagPack(item.payload)}
          >
            В теги Today
          </button>
        ) : null}
      </div>
    </article>
  );
}

export function ShopPage({
  wallet,
  onPurchase,
  onApplyTagPack,
  onLoadMoreFavorites,
  onSearchFavorites,
  favoritesHasMore,
  favoritesCount = 0,
  onNavigate,
}: ShopPageProps) {
  const [tab, setTab] = useState<ShopTab>("favorites");
  const [loadingMore, setLoadingMore] = useState(false);
  const [searching, setSearching] = useState(false);
  const [hasMore, setHasMore] = useState(favoritesHasMore);
  const [search, setSearch] = useState("");
  const [showOwned, setShowOwned] = useState(false);
  const [line, setLine] = useState(() => shopGreetLine());
  const [bubbleKey, setBubbleKey] = useState(0);
  const [pendingTagBuy, setPendingTagBuy] = useState<ShopItem | null>(null);
  const idleTimerRef = useRef<number | null>(null);
  const searchTimerRef = useRef<number | null>(null);

  const speak = useCallback((next: string) => {
    setLine(next);
    setBubbleKey((k) => k + 1);
  }, []);

  const scheduleIdle = useCallback(() => {
    if (idleTimerRef.current != null) {
      window.clearTimeout(idleTimerRef.current);
    }
    const wait =
      IDLE_MS_MIN + Math.floor(Math.random() * (IDLE_MS_MAX - IDLE_MS_MIN));
    idleTimerRef.current = window.setTimeout(() => {
      speak(shopIdleLine());
      scheduleIdle();
    }, wait);
  }, [speak]);

  useEffect(() => {
    const focus = consumeShopFocusTag();
    if (!focus) return;
    setTab("favorites");
    setSearch(focus);
  }, []);

  useEffect(() => {
    scheduleIdle();
    return () => {
      if (idleTimerRef.current != null) {
        window.clearTimeout(idleTimerRef.current);
      }
      if (searchTimerRef.current != null) {
        window.clearTimeout(searchTimerRef.current);
      }
    };
  }, [scheduleIdle]);

  useEffect(() => {
    setHasMore(favoritesHasMore);
  }, [favoritesHasMore, wallet.shopOfferTags.length]);

  const fetishOffers = useMemo(
    () => wallet.shopOfferTags.map((offer) => dynamicTagShopItem(offer)),
    [wallet.shopOfferTags],
  );
  const shopHydrateTags = useMemo(
    () => fetishOffers.slice(0, 120).map((item) => item.payload),
    [fetishOffers],
  );
  const { typeMap, nativeMap, refresh } =
    useTagTypeCatalog(shopHydrateTags);

  const offerCountByTag = useMemo(() => {
    const map = new Map<string, number>();
    for (const offer of wallet.shopOfferTags) {
      map.set(offer.tag.toLowerCase(), offer.count);
    }
    return map;
  }, [wallet.shopOfferTags]);

  const shelfCtas = useMemo(
    () =>
      shopTasteLoopCtas({
        shelfEmpty: fetishOffers.length === 0,
        likeCount: favoritesCount,
      }),
    [fetishOffers.length, favoritesCount],
  );

  const filteredFetishOffers = useMemo(() => {
    const q = search.trim().toLowerCase();
    const available = fetishOffers.filter(
      (item) => !isShopOwned(wallet, item),
    );
    if (!q) return available;
    return available.filter((item) => {
      const tag = item.payload.toLowerCase();
      const name = item.nameRu.toLowerCase();
      const desc = item.descriptionRu.toLowerCase();
      return tag.includes(q) || name.includes(q) || desc.includes(q);
    });
  }, [fetishOffers, search, wallet]);

  const fetishGroups = useMemo(() => {
    const rows = filteredFetishOffers.map((item) => ({
      tag: item.payload,
      item,
    }));
    return groupTagsByType(rows, typeMap, nativeMap);
  }, [filteredFetishOffers, typeMap, nativeMap]);

  const premiumUnownedCount = useMemo(
    () =>
      SHOP_CATALOG.filter(
        (item) => isPremiumConsumable(item) || !isShopOwned(wallet, item),
      ).length,
    [wallet],
  );

  const premiumGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const items = SHOP_CATALOG.filter((item) => {
      if (
        !showOwned &&
        !isPremiumConsumable(item) &&
        isShopOwned(wallet, item)
      ) {
        return false;
      }
      if (!q) return true;
      return (
        item.nameRu.toLowerCase().includes(q) ||
        item.descriptionRu.toLowerCase().includes(q) ||
        item.payload.toLowerCase().includes(q) ||
        kindLabel(item.kind).toLowerCase().includes(q)
      );
    }).sort(
      (a, b) =>
        a.cost - b.cost || a.nameRu.localeCompare(b.nameRu, "ru"),
    );
    return PREMIUM_KIND_ORDER.map((kind) => ({
      kind,
      title: premiumSectionTitle(kind),
      items: items.filter((i) => i.kind === kind),
    })).filter((g) => g.items.length > 0);
  }, [search, showOwned, wallet]);

  useEffect(() => {
    if (tab !== "favorites") return;
    const q = search.trim();
    if (q.length < 2) return;
    if (searchTimerRef.current != null) {
      window.clearTimeout(searchTimerRef.current);
    }
    searchTimerRef.current = window.setTimeout(() => {
      setSearching(true);
      void onSearchFavorites(q)
        .catch(() => 0)
        .finally(() => setSearching(false));
    }, 320);
    return () => {
      if (searchTimerRef.current != null) {
        window.clearTimeout(searchTimerRef.current);
      }
    };
  }, [search, tab, onSearchFavorites]);

  const loadMore = useCallback(async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const { hasMore: more } = await onLoadMoreFavorites();
      setHasMore(more);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, onLoadMoreFavorites]);

  const completePurchase = useCallback(
    (item: ShopItem): boolean => {
      const ok = onPurchase(item.id);
      if (ok) {
        speak(shopPurchaseLine(item));
        refresh();
      } else {
        const fresh = resolveShopItem(wallet, item.id);
        const reason =
          wallet.balance < item.cost
            ? "Мало угольков"
            : isShopOwned(wallet, fresh ?? item)
              ? "Уже куплено"
              : "Не вышло";
        speak(shopPurchaseFailLine(reason));
      }
      scheduleIdle();
      return ok;
    },
    [onPurchase, scheduleIdle, speak, wallet],
  );

  const handleBuy = useCallback(
    (item: ShopItem): BuyResult => {
      if (item.kind === "dyn_tag") {
        if (wallet.balance < item.cost) {
          speak(shopPurchaseFailLine("Мало угольков"));
          scheduleIdle();
          return false;
        }
        if (isShopOwned(wallet, item)) {
          speak(shopPurchaseFailLine("Уже куплено"));
          scheduleIdle();
          return false;
        }
        setPendingTagBuy(item);
        return "pending";
      }
      return completePurchase(item);
    },
    [completePurchase, scheduleIdle, speak, wallet],
  );

  const confirmTagType = useCallback(
    (type: TagTypeId) => {
      const item = pendingTagBuy;
      setPendingTagBuy(null);
      if (!item) return;
      setTagType(item.payload, type);
      refresh();
      completePurchase(item);
    },
    [completePurchase, pendingTagBuy],
  );

  const handleAvatarClick = useCallback(() => {
    speak(shopClickLine());
    scheduleIdle();
  }, [scheduleIdle, speak]);

  const visibleCount =
    tab === "favorites"
      ? filteredFetishOffers.length
      : premiumGroups.reduce((n, g) => n + g.items.length, 0);

  return (
    <div className="shop-page">
      <div className="shop-page__layout">
        <div className="shop-page__main">
          <header className="shop-page__hero">
            <div className="shop-page__hero-text">
              <p className="shop-page__eyebrow">
                {getActiveMistress().displayNameRu} · ночная лавка
              </p>
              <h1 className="shop-page__title">Магазин</h1>
              <p className="shop-page__sub">
                Фетиши из избранного — по группам, как в библиотеке тегов.
                Пакеты уже открывают входящие теги: повторно покупать не нужно.
              </p>
            </div>
            <div className="shop-page__balance" title="Угольки">
              <span className="shop-page__balance-label">Угольки</span>
              <span className="shop-page__balance-num">{wallet.balance}</span>
            </div>
          </header>

          {wallet.pendingBegBonus > 0 || wallet.pendingCumBoost > 0 ? (
            <p className="shop-page__pending">
              В запасе:
              {wallet.pendingBegBonus > 0
                ? ` +${wallet.pendingBegBonus} beg`
                : ""}
              {wallet.pendingCumBoost > 0
                ? ` +${wallet.pendingCumBoost}× шанс кончить`
                : ""}{" "}
              на следующую сессию
            </p>
          ) : null}

          <div
            className="shop-page__tabs"
            role="tablist"
            aria-label="Разделы магазина"
          >
            <button
              type="button"
              role="tab"
              id="shop-tab-favorites"
              aria-selected={tab === "favorites"}
              aria-controls="shop-panel-favorites"
              className={`shop-page__tab${tab === "favorites" ? " is-active" : ""}`}
              onClick={() => setTab("favorites")}
            >
              Из избранного
              {fetishOffers.length > 0 ? (
                <span className="shop-page__tab-count">
                  {
                    fetishOffers.filter((i) => !isShopOwned(wallet, i)).length
                  }
                </span>
              ) : null}
            </button>
            <button
              type="button"
              role="tab"
              id="shop-tab-premium"
              aria-selected={tab === "premium"}
              aria-controls="shop-panel-premium"
              className={`shop-page__tab${tab === "premium" ? " is-active" : ""}`}
              onClick={() => setTab("premium")}
            >
              Премиум
              <span className="shop-page__tab-count">{premiumUnownedCount}</span>
            </button>
          </div>

          <div className="shop-page__toolbar">
            <label className="shop-page__search-wrap">
              <span className="shop-page__search-label">Поиск</span>
              <input
                className="shop-page__search"
                type="search"
                placeholder={
                  tab === "favorites"
                    ? "Найти тег для покупки… hu_tao, chastity…"
                    : "Найти в премиуме…"
                }
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Поиск в магазине"
              />
            </label>
            {search.trim() ? (
              <button
                type="button"
                className="shop-page__search-clear"
                onClick={() => setSearch("")}
              >
                Сбросить
              </button>
            ) : null}
            {tab === "premium" ? (
              <button
                type="button"
                className={`shop-page__owned-toggle${showOwned ? " is-on" : ""}`}
                aria-pressed={showOwned}
                onClick={() => setShowOwned((v) => !v)}
              >
                {showOwned ? "Скрыть купленное" : "Показать купленное"}
              </button>
            ) : null}
            {searching ? (
              <span className="shop-page__search-status">Ищем…</span>
            ) : search.trim().length >= 2 && tab === "favorites" ? (
              <span className="shop-page__search-status">
                {visibleCount} на витрине
              </span>
            ) : null}
          </div>

          {tab === "favorites" ? (
            <div
              id="shop-panel-favorites"
              role="tabpanel"
              aria-labelledby="shop-tab-favorites"
              className="shop-page__panel"
            >
              <p className="shop-page__panel-hint">
                Группы как в избранном (
                {TAG_TYPE_META.map((m) => m.nameRu).slice(0, 4).join(", ")}
                …). Цена растёт с частотой в сохранениях.
              </p>
              {fetishOffers.length === 0 ? (
                <div className="shop-page__empty-block">
                  <p className="shop-page__empty">
                    {shopFavoritesShelfEmptyRu()}
                  </p>
                  <p className="shop-page__empty-hint">
                    {shopFavoritesShelfEmptyHintRu()}
                  </p>
                  {onNavigate ? (
                    <div className="page-empty-ctas">
                      {shelfCtas.map((cta) => (
                        <button
                          key={cta.id}
                          type="button"
                          className={`page-empty-cta${
                            cta.ghost ? " page-empty-cta--ghost" : ""
                          }`}
                          onClick={() => {
                            void primeUiAudio();
                            playUiNav();
                            onNavigate(cta.id);
                          }}
                        >
                          {cta.labelRu}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : filteredFetishOffers.length === 0 ? (
                <p className="shop-page__empty">
                  {search.trim()
                    ? "Ничего не найдено по запросу — или тег уже открыт пакетом."
                    : "Все доступные теги с витрины уже открыты."}
                </p>
              ) : (
                <>
                  {onNavigate ? (
                    <div className="shop-page__taste-links page-empty-ctas">
                      {shelfCtas.map((cta) => (
                        <button
                          key={cta.id}
                          type="button"
                          className={`page-empty-cta${
                            cta.ghost ? " page-empty-cta--ghost" : ""
                          }`}
                          onClick={() => {
                            void primeUiAudio();
                            playUiNav();
                            onNavigate(cta.id);
                          }}
                        >
                          {cta.labelRu}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div className="shop-page__groups">
                    {fetishGroups.map((group) => (
                      <section
                        key={group.type}
                        className={`shop-page__group tag-type-section ${tagTypeSectionClass(group.type)}`}
                      >
                        <header className="tag-type-section__head">
                          <h3 className="tag-type-section__title">
                            {group.meta.nameRu}
                            <span className="shop-page__group-count">
                              {group.items.length}
                            </span>
                          </h3>
                          <p className="tag-type-section__desc">
                            {group.meta.descriptionRu}
                          </p>
                        </header>
                        <div className="shop-page__grid">
                          {group.items.map(({ item }) => (
                            <ShopCard
                              key={item.id}
                              item={item}
                              wallet={wallet}
                              onBuy={handleBuy}
                              onApplyTagPack={onApplyTagPack}
                              likeCount={offerCountByTag.get(
                                item.payload.toLowerCase(),
                              )}
                              typeHint={
                                tagTypeMeta(
                                  getTagType(item.payload, typeMap, nativeMap),
                                ).nameRu
                              }
                            />
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                  {hasMore && !search.trim() ? (
                    <div className="shop-page__load-more-wrap">
                      <button
                        type="button"
                        className="shop-page__load-more"
                        disabled={loadingMore}
                        onClick={() => void loadMore()}
                      >
                        {loadingMore ? "Загрузка…" : "Загрузить больше"}
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          ) : (
            <div
              id="shop-panel-premium"
              role="tabpanel"
              aria-labelledby="shop-tab-premium"
              className="shop-page__panel"
            >
              <p className="shop-page__panel-hint">
                Режимы, пакеты, функции и плюшки. Купленный пакет снимает его
                теги с витрины «Из избранного».
              </p>
              {premiumGroups.length === 0 ? (
                <p className="shop-page__empty">
                  {search.trim()
                    ? "Ничего не найдено по запросу."
                    : showOwned
                      ? "Каталог пуст."
                      : "Всё уже куплено. Нажми «Показать купленное», если хочешь пересмотреть."}
                </p>
              ) : (
                <div className="shop-page__groups">
                  {premiumGroups.map((group) => (
                    <section
                      key={group.kind}
                      className="shop-page__group tag-type-section"
                    >
                      <header className="tag-type-section__head">
                        <h3 className="tag-type-section__title">
                          {group.title}
                          <span className="shop-page__group-count">
                            {group.items.length}
                          </span>
                        </h3>
                      </header>
                      <div className="shop-page__grid">
                        {group.items.map((item) => (
                          <ShopCard
                            key={item.id}
                            item={item}
                            wallet={wallet}
                            onBuy={handleBuy}
                            onApplyTagPack={onApplyTagPack}
                          />
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <aside
          className="shop-avatar"
          aria-label={getActiveMistress().displayNameRu}
        >
          <button
            type="button"
            className="shop-avatar__hit"
            onClick={handleAvatarClick}
            aria-label={`Поговорить с ${getActiveMistress().displayNameRu}`}
          >
            <div className="shop-avatar__frame">
              <div className="shop-avatar__glow" aria-hidden />
              <MistressImg
                className="shop-avatar__img"
                src={getActiveMistress().assets.shopAvatar}
                alt={getActiveMistress().displayNameRu}
                draggable={false}
              />
            </div>
          </button>
          <div
            key={bubbleKey}
            className="shop-avatar__bubble"
            role="status"
            aria-live="polite"
          >
            <p className="shop-avatar__bubble-text">
              <TypewriterText text={line} charMs={24} />
            </p>
          </div>
          <p className="shop-avatar__caption">
            {getActiveMistress().displayNameRu} · магазин
          </p>
        </aside>
      </div>

      {pendingTagBuy ? (
        <TagTypePickerModal
          tag={pendingTagBuy.payload}
          labelRu={pendingTagBuy.nameRu}
          initialType={getTagType(
            pendingTagBuy.payload,
            typeMap,
            nativeMap,
          )}
          nativeType={getNativeTagType(pendingTagBuy.payload, nativeMap)}
          titleRu="Куда положить тег?"
          confirmRu="Купить"
          onCancel={() => setPendingTagBuy(null)}
          onConfirm={confirmTagType}
        />
      ) : null}
    </div>
  );
}
