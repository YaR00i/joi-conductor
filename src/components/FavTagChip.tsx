import type { TagPurchaseStatus } from "../lib/contentUnlocks";

type Props = {
  tag: string;
  count: number;
  active: boolean;
  purchase: TagPurchaseStatus;
  onToggle: () => void;
  onEdit: () => void;
  onBuy?: () => void;
};

export function FavTagChip({
  tag,
  count,
  active,
  purchase,
  onToggle,
  onEdit,
  onBuy,
}: Props) {
  const locked = purchase === "locked";
  const unlocked = purchase === "unlocked";

  return (
    <span
      className={`fav-tag fav-tag--with-gear${active ? " is-active" : ""}${
        locked ? " fav-tag--locked" : ""
      }${unlocked ? " fav-tag--bought" : ""}`}
    >
      {unlocked ? (
        <span className="fav-tag__ok" title="Куплено / открыто" aria-hidden>
          ✓
        </span>
      ) : null}
      {locked ? (
        <span className="fav-tag__lock">
          <span className="fav-tag__x" aria-hidden>
            ✗
          </span>
          <button
            type="button"
            className="fav-tag__shop"
            title={`Купить «${tag}» в магазине`}
            aria-label={`Купить тег ${tag}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onBuy?.();
            }}
          >
            🛍
          </button>
        </span>
      ) : null}
      <button
        type="button"
        className="fav-tag__main"
        onClick={onToggle}
        title={`${count} шт.`}
      >
        {tag}
      </button>
      <span className="fav-tag__slot">
        <span className="fav-tag__n" aria-hidden>
          {count}
        </span>
        <button
          type="button"
          className="fav-tag__gear"
          title="Настройки тега"
          aria-label={`Настройки тега ${tag}`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onEdit();
          }}
        >
          ⚙
        </button>
      </span>
    </span>
  );
}
