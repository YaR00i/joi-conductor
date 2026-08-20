import { playUiClick, primeUiAudio } from "../lib/uiSound";

type Props = {
  disabled?: boolean;
  onRegenerate: () => void;
  onEdit: () => void;
  onSpeak: () => void;
  speakDisabled?: boolean;
};

export function ChatMessageActions({
  disabled = false,
  onRegenerate,
  onEdit,
  onSpeak,
  speakDisabled = false,
}: Props) {
  function tap(fn: () => void) {
    if (disabled) return;
    void primeUiAudio();
    playUiClick();
    fn();
  }

  return (
    <div className="chat-msg-acts">
      <button
        type="button"
        className="chat-msg-acts__btn"
        title="Сгенерировать заново"
        disabled={disabled}
        onClick={() => tap(onRegenerate)}
      >
        <RegenerateIcon />
      </button>
      <button
        type="button"
        className="chat-msg-acts__btn"
        title="Редактировать"
        disabled={disabled}
        onClick={() => tap(onEdit)}
      >
        <EditIcon />
      </button>
      <button
        type="button"
        className="chat-msg-acts__btn"
        title="Озвучить"
        disabled={disabled || speakDisabled}
        onClick={() => tap(onSpeak)}
      >
        <SpeakIcon />
      </button>
    </div>
  );
}

function RegenerateIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path
        d="M4.5 12a7.5 7.5 0 0 1 12.7-5.4L20 9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M20 4.5V9h-4.5" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M19.5 12a7.5 7.5 0 0 1-12.7 5.4L4 15"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M4 19.5V15h4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path
        d="M4 20h4.2L19 9.2a1.8 1.8 0 0 0 0-2.5l-1.7-1.7a1.8 1.8 0 0 0-2.5 0L4 15.8V20Z"
        strokeLinejoin="round"
      />
      <path d="m13.2 6.8 4 4" strokeLinecap="round" />
    </svg>
  );
}

function SpeakIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M4 10v4h3.2L12 18.5V5.5L7.2 10H4Z" strokeLinejoin="round" />
      <path d="M16 9.2a3.4 3.4 0 0 1 0 5.6M18.6 7a6 6 0 0 1 0 10" strokeLinecap="round" />
    </svg>
  );
}
