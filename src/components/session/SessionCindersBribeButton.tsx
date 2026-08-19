import { PROMPT_BRIBE_COST } from "../../lib/wallet";
import { getActiveMistress } from "../../lib/mistress";

export function SessionCindersBribeButton({
  cindersBalance,
  onBribe,
}: {
  cindersBalance: number;
  onBribe: () => void;
}) {
  const canBribe = cindersBalance >= PROMPT_BRIBE_COST;
  return (
    <button
      type="button"
      className="confirm-dock__btn confirm-dock__btn--prompt confirm-dock__btn--bribe"
      disabled={!canBribe}
      title={
        canBribe
          ? `Откупиться угольками — ${getActiveMistress().displayNameRu} не злится`
          : `Нужно ${PROMPT_BRIBE_COST} угольков`
      }
      onClick={onBribe}
    >
      Откупиться · {PROMPT_BRIBE_COST} ★
    </button>
  );
}
