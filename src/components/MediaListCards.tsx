import { useEffect, useState } from "react";
import type { GelbooruListOption } from "../lib/gelbooruLists";
import { getActiveMistress, subscribeActiveMistress } from "../lib/mistress";
import { moodFromScore } from "../lib/moodEngine";
import {
  CONTROL_CHANGED_EVENT,
  loadControlState,
} from "../lib/soul/control";
import { playUiClick, playUiConfirm, primeUiAudio } from "../lib/uiSound";
import { DoujinListDeck } from "../pages/doujin/DoujinListDeck";
import "./mediaListCards.css";

type Props = {
  lists: ReadonlyArray<GelbooruListOption>;
  selectedId: string;
  onSelect: (listId: string) => void;
  onAssemble?: () => void;
  assembling?: boolean;
  keyed: boolean;
};

function postsLabel(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} пост`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${n} поста`;
  }
  return `${n} постов`;
}

function mistressPortrait(): { src: string; name: string } {
  const pack = getActiveMistress();
  const mood = moodFromScore(loadControlState(pack.id).moodScore);
  return {
    src: pack.assets.moodAvatar[mood] ?? pack.assets.avatarFull,
    name: pack.displayNameRu,
  };
}

export function MediaListCards({
  lists,
  selectedId,
  onSelect,
  onAssemble,
  assembling = false,
  keyed,
}: Props) {
  const [portrait, setPortrait] = useState(mistressPortrait);
  useEffect(() => {
    const sync = () => setPortrait(mistressPortrait());
    window.addEventListener(CONTROL_CHANGED_EVENT, sync);
    const unsub = subscribeActiveMistress(sync);
    return () => {
      window.removeEventListener(CONTROL_CHANGED_EVENT, sync);
      unsub();
    };
  }, []);

  return (
    <ul className="hub-media__list-grid" role="listbox" aria-label="Список">
      <li className="doujin-lists__tile doujin-lists__tile--assemble hub-media__list-card">
        <div className="doujin-lists__tile-hit">
          <div className="doujin-lists__assemble-face">
            <img
              className="doujin-lists__assemble-portrait"
              src={portrait.src}
              alt=""
            />
            <p className="doujin-lists__assemble-name">{portrait.name}</p>
            <div className="doujin-lists__assemble-dock">
              <button
                type="button"
                className="doujin-lists__tile-play"
                disabled={assembling || !keyed || !onAssemble}
                onClick={() => {
                  void primeUiAudio();
                  playUiConfirm();
                  onAssemble?.();
                }}
              >
                {assembling
                  ? "Собираю…"
                  : keyed
                    ? `Выбор ${portrait.name}`
                    : "Нужен ключ"}
              </button>
            </div>
          </div>
        </div>
      </li>
      {lists.map((row, index) => {
        const on = row.id === selectedId;
        return (
          <li
            key={row.id}
            className={
              "doujin-lists__tile hub-media__list-card" + (on ? " is-on" : "")
            }
          >
            <button
              type="button"
              role="option"
              aria-selected={on}
              className="hub-media__list-hit"
              onClick={() => {
                void primeUiAudio();
                playUiClick();
                onSelect(row.id);
              }}
            >
              <DoujinListDeck
                urls={row.previewUrls}
                stagger={`${(index % 4) * 0.55}s`}
              />
              <span className="hub-media__list-name">{row.name}</span>
              <span className="hub-media__list-count">
                {row.count > 0 ? postsLabel(row.count) : "пусто"}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
