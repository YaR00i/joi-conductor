import type { HubKindFilter } from "../lib/mediaTypeFilter";
import { playUiClick, primeUiAudio } from "../lib/uiSound";

const OPTIONS: ReadonlyArray<{ id: HubKindFilter; label: string }> = [
  { id: "all", label: "Все" },
  { id: "image", label: "Картинки" },
  { id: "gif", label: "Гифки" },
  { id: "video", label: "Видео" },
];

type Props = {
  value: HubKindFilter;
  onChange: (next: HubKindFilter) => void;
  className?: string;
};

export function MediaKindFilter({ value, onChange, className }: Props) {
  return (
    <div
      className={
        "favorites-page__kind" + (className ? ` ${className}` : "")
      }
      role="group"
      aria-label="Тип медиа"
    >
      {OPTIONS.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          className={
            "favorites-page__kind-btn" + (value === id ? " is-active" : "")
          }
          aria-pressed={value === id}
          onClick={() => {
            if (id === value) return;
            void primeUiAudio();
            playUiClick();
            onChange(id);
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
