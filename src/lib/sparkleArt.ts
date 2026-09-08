/** Sparkle / Iskra portraits (public/sparkle). Two faces: Искорка vs Искра. */

import type { SessionMood } from "./types";

/** Roulette idle — весёлая (sweet), both girls. */
export const SPARKLE_AVATAR_SRC = "/sparkle/avatar-full.png?v=5";

/** Shop-side portrait — same dual card, taller crop. */
export const SPARKLE_SHOP_AVATAR_SRC = "/sparkle/shop-avatar.png?v=4";

/**
 * Square speech thumbs — same slot as Ху Тао.
 * Right/dark Искорка (sparkle) on sweet/calm/bored.
 * Left/white Искра (sparxie) on cruel/chaotic/horny.
 */
export const SPARKLE_MOOD_PORTRAIT: Record<
  SessionMood,
  { labelRu: string; src: string }
> = {
  sweet: { labelRu: "Искорка", src: "/sparkle/mood/sweet.png?v=4" },
  calm: { labelRu: "Маска", src: "/sparkle/mood/calm.png?v=4" },
  bored: { labelRu: "Пустая", src: "/sparkle/mood/bored.png?v=4" },
  cruel: { labelRu: "Искра", src: "/sparkle/mood/cruel.png?v=4" },
  chaotic: { labelRu: "Хаос", src: "/sparkle/mood/chaotic.png?v=4" },
  horny: { labelRu: "Глючная", src: "/sparkle/mood/horny.png?v=4" },
};

/** Full dual-persona mood art for the side avatar. */
export const SPARKLE_MOOD_AVATAR: Record<SessionMood, string> = {
  sweet: "/sparkle/mood/full/sweet.png?v=4",
  calm: "/sparkle/mood/full/calm.png?v=4",
  bored: "/sparkle/mood/full/bored.png?v=4",
  cruel: "/sparkle/mood/full/cruel.png?v=4",
  chaotic: "/sparkle/mood/full/chaotic.png?v=4",
  horny: "/sparkle/mood/full/horny.png?v=4",
};
