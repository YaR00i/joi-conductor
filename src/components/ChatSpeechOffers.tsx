import type { ChatProposal } from "../lib/soul/control/proposals";
import { playUiClick, primeUiAudio } from "../lib/uiSound";

type Props = {
  offers: ChatProposal[];
  disabled?: boolean;
  onAccept: (offer: ChatProposal) => void;
  onDismiss: (offer: ChatProposal) => void;
};

export function ChatSpeechOffers({
  offers,
  disabled = false,
  onAccept,
  onDismiss,
}: Props) {
  if (offers.length === 0) return null;
  return (
    <div className="chat-speech-offers" aria-label="Варианты от системы">
      {offers.map((offer) => (
        <article key={offer.id} className="chat-speech-offers__card">
          <p className="chat-speech-offers__kicker">Система</p>
          <p className="chat-speech-offers__title">{offer.titleRu}</p>
          <p className="chat-speech-offers__hint">{offer.hintRu}</p>
          <div className="chat-speech-offers__acts">
            <button
              type="button"
              className="chat-page__send"
              disabled={disabled}
              onClick={() => {
                void primeUiAudio();
                playUiClick();
                onAccept(offer);
              }}
            >
              {offer.confirmRu}
            </button>
            <button
              type="button"
              className="chat-page__ghost"
              disabled={disabled}
              onClick={() => {
                void primeUiAudio();
                playUiClick();
                onDismiss(offer);
              }}
            >
              {offer.refuseRu}
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
