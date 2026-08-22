import type { ChatChip } from "../lib/soul/control/dispatch";

type Props = {
  chips: ChatChip[];
  disabled?: boolean;
  onChip: (chip: ChatChip) => void;
};

export function ChatFunctionChips({ chips, disabled, onChip }: Props) {
  if (chips.length === 0) return null;
  return (
    <div className="chat-page__chips" role="toolbar" aria-label="Действия госпожи">
      {chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          className="chat-page__chip"
          disabled={disabled}
          onClick={() => onChip(chip)}
        >
          {chip.labelRu}
        </button>
      ))}
    </div>
  );
}
