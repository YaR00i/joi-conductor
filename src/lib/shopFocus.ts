const STORAGE_KEY = "joi-shop-focus-tag";

/** Stash a gelbooru tag so ShopPage can open with search prefilled. */
export function setShopFocusTag(tag: string): void {
  const key = tag.trim();
  if (!key) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, key);
  } catch {
    /* ignore quota / private mode */
  }
}

/** Read-and-clear focus tag. Returns null if none. */
export function consumeShopFocusTag(): string | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(STORAGE_KEY);
    const tag = raw.trim();
    return tag || null;
  } catch {
    return null;
  }
}
