/** Hu Tao roulette reaction stickers (public/hu-tao/emoji). */

import type { SessionMood } from "./types";

export type MistressEmojiId =
  | "angry"
  | "dizzy"
  | "shy"
  | "cheer"
  | "smug"
  | "shock"
  | "yawn"
  | "pout"
  | "sleep";

export const HU_TAO_EMOJI_META: Record<
  MistressEmojiId,
  { labelRu: string; src: string }
> = {
  angry: { labelRu: "Злится", src: "/hu-tao/emoji/angry.png" },
  dizzy: { labelRu: "Кружится", src: "/hu-tao/emoji/dizzy.png" },
  shy: { labelRu: "Смущается", src: "/hu-tao/emoji/shy.png" },
  cheer: { labelRu: "Радуется", src: "/hu-tao/emoji/cheer.png" },
  smug: { labelRu: "Хитрит", src: "/hu-tao/emoji/smug.png" },
  shock: { labelRu: "Шок", src: "/hu-tao/emoji/shock.png" },
  yawn: { labelRu: "Скучает", src: "/hu-tao/emoji/yawn.png" },
  pout: { labelRu: "Дуется", src: "/hu-tao/emoji/pout.png" },
  sleep: { labelRu: "Ждёт", src: "/hu-tao/emoji/sleep.png" },
};

/** Full-body side avatar (idle / default). */
export const HU_TAO_AVATAR_SRC = "/hu-tao/avatar-full.png?v=8";

/** Shop-side portrait (ember / night-out look). */
export const HU_TAO_SHOP_AVATAR_SRC = "/hu-tao/shop-avatar.png?v=1";

/** Face-only portraits for «Её приговор». */
export const HU_TAO_MOOD_PORTRAIT: Record<
  SessionMood,
  { labelRu: string; src: string }
> = {
  sweet: { labelRu: "Добрая", src: "/hu-tao/mood/sweet.png?v=2" },
  calm: { labelRu: "Спокойная", src: "/hu-tao/mood/calm.png?v=2" },
  bored: { labelRu: "Скучающая", src: "/hu-tao/mood/bored.png?v=2" },
  cruel: { labelRu: "Злая", src: "/hu-tao/mood/cruel.png?v=2" },
  chaotic: { labelRu: "Хаос", src: "/hu-tao/mood/chaotic.png?v=2" },
  horny: { labelRu: "Похотливая", src: "/hu-tao/mood/horny.png?v=2" },
};

/** Full mood art for the right-side character avatar. */
export const HU_TAO_MOOD_AVATAR: Record<SessionMood, string> = {
  sweet: "/hu-tao/mood/full/sweet.png?v=1",
  calm: "/hu-tao/mood/full/calm.png?v=1",
  bored: "/hu-tao/mood/full/bored.png?v=1",
  cruel: "/hu-tao/mood/full/cruel.png?v=1",
  chaotic: "/hu-tao/mood/full/chaotic.png?v=1",
  horny: "/hu-tao/mood/full/horny.png?v=1",
};

export function huTaoMoodPortraitSrc(mood: SessionMood): string {
  return HU_TAO_MOOD_PORTRAIT[mood].src;
}

export function huTaoMoodAvatarSrc(mood: SessionMood): string {
  return HU_TAO_MOOD_AVATAR[mood];
}

export function huTaoEmojiSrc(id: MistressEmojiId): string {
  return HU_TAO_EMOJI_META[id].src;
}
