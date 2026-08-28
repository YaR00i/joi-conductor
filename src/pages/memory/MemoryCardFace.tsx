/**
 * Face-up side of a memory card / trophy picture. Still images and gifs both
 * render as a plain <img>; videos never enter the pool (see memoryAssets).
 */

interface Props {
  url: string;
  label: string;
}

export function MemoryCardFace({ url, label }: Props) {
  return <img src={url} alt={label} draggable={false} loading="lazy" />;
}
