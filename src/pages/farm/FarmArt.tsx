/**
 * Farm art for the naughty farm, built on Twemoji vector assets
 * (https://twemoji.twitter.com/, graphics licensed CC-BY 4.0 — see the
 * copied files under public/farm). Served as static SVGs so they stay crisp
 * at any DPI and match the flat colorful style across crops and weeds.
 *
 * Components keep the same surface the game was built against: CropArt by
 * farmField crop id plus SproutArt / WeedArt / DropArt / HeelArt.
 */

import type { CSSProperties } from "react";

interface ArtProps {
  className?: string;
  style?: CSSProperties;
}

const ART_BASE = "farm";

function Art({ src, className, style }: ArtProps & { src: string }) {
  return (
    <img
      src={src}
      className={className}
      style={style}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}

/** Ripe crop by farmField crop id. */
export function CropArt({ id, className, style }: ArtProps & { id: string }) {
  return <Art src={`${ART_BASE}/${id}.svg`} className={className} style={style} />;
}

/** Young plant shown while a crop is small (early growth). */
export function SproutArt({ className }: ArtProps) {
  return <Art src={`${ART_BASE}/sprout.svg`} className={className} />;
}

/** The weed herb — spiky stalks, clearly unlike any crop. */
export function WeedArt({ className }: ArtProps) {
  return <Art src={`${ART_BASE}/weed.svg`} className={className} />;
}

/** Thirst badge droplet. */
export function DropArt({ className }: ArtProps) {
  return <Art src={`${ART_BASE}/drop.svg`} className={className} />;
}

/** Mistress stiletto heel (inspection rule icon). */
export function HeelArt({ className }: ArtProps) {
  return <Art src={`${ART_BASE}/heel.svg`} className={className} />;
}
