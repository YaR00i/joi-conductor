import { useEffect, useState } from "react";
import { getActiveMistress, subscribeActiveMistress } from "../lib/mistress";
import { MistressImg } from "./MistressImg";

/**
 * Face thumb of the active mistress for minigame hub / start screens.
 * Pack art only — no speech, chat, or mood system.
 */

type FaceSize = "sm" | "md";

interface Props {
  size?: FaceSize;
  className?: string;
}

export function MinigameMistressFace({ size = "sm", className }: Props) {
  const [pack, setPack] = useState(getActiveMistress);
  useEffect(() => subscribeActiveMistress(setPack), []);

  const src = pack.assets.moodPortrait.calm.src;
  const cls = [
    "minigame-mistress-face",
    `minigame-mistress-face--${size}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <MistressImg className={cls} src={src} alt={pack.displayNameRu} />;
}
