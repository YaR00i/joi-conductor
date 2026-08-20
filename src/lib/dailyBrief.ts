import {
  countOpenContracts,
  ensureDailyContractBoard,
  type ContractInstance,
  type DailyContractBoard,
} from "./contracts/dailyBoard";
import { isHabitContractId } from "./contracts/catalog";
import {
  dynamicTagShopItem,
  isShopOwned,
  SHOP_CATALOG,
  type ShopItem,
  type WalletState,
} from "./wallet";

export type RecommendedUnlock = {
  id: string;
  nameRu: string;
  cost: number;
  /** True when balance covers cost */
  affordable: boolean;
};

function isDurableShopItem(item: ShopItem): boolean {
  switch (item.kind) {
    case "beg_bonus":
    case "cum_boost":
      return false;
    case "function":
    case "pattern":
    case "tag_pack":
    case "fetish":
    case "dyn_tag":
    case "mode":
    case "mood":
    case "character":
    case "media_type":
    case "feature":
      return true;
    default: {
      const _exhaustive: never = item.kind;
      return _exhaustive;
    }
  }
}

/** Open contracts still due today, sorted seedable-first then by reward. */
export function listOpenContractsToday(
  board: DailyContractBoard | null = ensureDailyContractBoard(),
  nowMs = Date.now(),
): ContractInstance[] {
  if (!board) return [];
  return board.contracts
    .filter((c) => c.status === "open" && nowMs <= c.deadlineMs)
    .sort((a, b) => {
      const ah = isHabitContractId(a.defId) ? 0 : 1;
      const bh = isHabitContractId(b.defId) ? 0 : 1;
      if (ah !== bh) return ah - bh;
      if (b.reward !== a.reward) return b.reward - a.reward;
      return a.titleRu.localeCompare(b.titleRu, "ru");
    });
}

export function openContractsCountToday(
  board: DailyContractBoard | null = ensureDailyContractBoard(),
): number {
  return countOpenContracts(board);
}

/**
 * Cheapest durable unlock not yet owned.
 * Prefers something affordable; otherwise the next cheapest tease.
 */
export function recommendNextUnlock(
  wallet: WalletState,
): RecommendedUnlock | null {
  const catalog: ShopItem[] = [
    ...SHOP_CATALOG,
    ...wallet.shopOfferTags.map(dynamicTagShopItem),
  ];
  const unowned = catalog
    .filter((item) => isDurableShopItem(item) && !isShopOwned(wallet, item))
    .sort((a, b) => a.cost - b.cost || a.nameRu.localeCompare(b.nameRu, "ru"));
  if (unowned.length === 0) return null;
  const affordable = unowned.find((item) => item.cost <= wallet.balance);
  const pick = affordable ?? unowned[0]!;
  return {
    id: pick.id,
    nameRu: pick.nameRu,
    cost: pick.cost,
    affordable: pick.cost <= wallet.balance,
  };
}
