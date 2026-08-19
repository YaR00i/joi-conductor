import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  getActiveMistress,
  listMistressCatalog,
  mistressUnlockHintRu,
  mistressUnlockProgress,
  setActiveMistress,
  subscribeActiveMistress,
  type MistressPack,
} from "../lib/mistress";
import type { MistressUnlockSnapshot } from "../lib/mistress/mistressUnlocks";
import { playUiClick, playUiConfirm, primeUiAudio } from "../lib/uiSound";
import { MistressImg } from "./MistressImg";

/** Face thumb for picker / evening route — same moodPortrait crop as speech faces. */
function mistressFaceSrc(pack: MistressPack): string {
  return pack.assets.moodPortrait.calm.src;
}

interface MistressPickerProps {
  locked?: boolean;
  unlocks?: MistressUnlockSnapshot | null;
  onSwitched?: (pack: MistressPack) => void;
  /**
   * `dropdown` — compact select under roulette avatar.
   * `faces` — inline moodPortrait thumbs (evening route step 1).
   */
  variant?: "dropdown" | "faces";
}

type DropDir = "up" | "down";

export function MistressPicker({
  locked,
  unlocks = null,
  onSwitched,
  variant = "dropdown",
}: MistressPickerProps) {
  const [activeId, setActiveId] = useState(() => getActiveMistress().id);
  const [open, setOpen] = useState(false);
  const [dropDir, setDropDir] = useState<DropDir>("down");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listId = useId();
  const catalog = useMemo(
    () => listMistressCatalog(unlocks),
    [unlocks],
  );
  const active =
    catalog.find((e) => e.id === activeId) ?? getActiveMistress();

  useEffect(() => {
    return subscribeActiveMistress((pack) => setActiveId(pack.id));
  }, []);

  function resolveDropDir(): DropDir {
    const el = rootRef.current;
    if (!el) return "down";
    const rect = el.getBoundingClientRect();
    const spaceAbove = Math.max(0, rect.top);
    const spaceBelow = Math.max(0, window.innerHeight - rect.bottom);
    const need = Math.min(window.innerHeight * 0.45, 22 * 16);
    // Open toward the side with more room. Roulette footer still gets "up".
    if (spaceBelow >= need && spaceBelow >= spaceAbove) return "down";
    if (spaceAbove >= need && spaceAbove > spaceBelow) return "up";
    return spaceBelow >= spaceAbove ? "down" : "up";
  }

  useEffect(() => {
    if (!open || variant !== "dropdown") return;
    const onDoc = (e: MouseEvent) => {
      const el = rootRef.current;
      if (!el || !(e.target instanceof Node) || el.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onReposition = () => setDropDir(resolveDropDir());
    onReposition();
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, variant]);

  function select(entry: MistressPack) {
    void primeUiAudio();
    if (!entry.unlocked || locked) {
      playUiClick();
      return;
    }
    if (entry.id === activeId) {
      playUiClick();
      setOpen(false);
      return;
    }
    const pack = setActiveMistress(entry.id, unlocks);
    if (!pack) return;
    playUiConfirm();
    setActiveId(pack.id);
    setOpen(false);
    onSwitched?.(pack);
  }

  if (variant === "faces") {
    return (
      <div
        className={`mistress-faces${locked ? " is-locked" : ""}`}
        role="listbox"
        aria-label="Госпожа"
      >
        {catalog.map((entry) => {
          const isActive = entry.id === activeId;
          const isLocked = !entry.unlocked;
          const hint = isLocked ? mistressUnlockHintRu(entry.id) : "";
          const progress =
            isLocked && unlocks
              ? mistressUnlockProgress(entry.id, unlocks)
              : null;
          const title = isLocked
            ? progress?.detailRu || hint || entry.taglineRu
            : entry.taglineRu;
          return (
            <button
              key={entry.id}
              type="button"
              role="option"
              aria-selected={isActive}
              className={`mistress-faces__chip mistress-faces__chip--${entry.id}${
                isActive ? " is-active" : ""
              }${isLocked ? " is-locked" : ""}`}
              disabled={isLocked || locked}
              title={title}
              onClick={() => select(entry)}
            >
              <span className="mistress-faces__thumb" aria-hidden>
                <MistressImg
                  className="mistress-faces__img"
                  src={mistressFaceSrc(entry)}
                  alt=""
                />
              </span>
              <span className="mistress-faces__copy">
                <span className="mistress-faces__name">
                  {entry.displayNameRu}
                  {isLocked ? " · ✕" : ""}
                </span>
                <span className="mistress-faces__blurb">{entry.taglineRu}</span>
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={`mistress-dd${open ? " is-open" : ""} is-drop-${dropDir}${
        locked ? " is-locked" : ""
      }`}
    >
      <button
        type="button"
        className="mistress-dd__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={locked}
        title={
          locked
            ? "Смена недоступна во время сессии"
            : "Выбрать Госпожу"
        }
        onClick={() => {
          void primeUiAudio();
          playUiClick();
          if (locked) return;
          if (!open) setDropDir(resolveDropDir());
          setOpen((v) => !v);
        }}
      >
        <span className="mistress-dd__face" aria-hidden>
          <MistressImg
            className="mistress-dd__face-img"
            src={mistressFaceSrc(active)}
            alt=""
          />
        </span>
        <span className="mistress-dd__label">Госпожа</span>
        <span className="mistress-dd__value">{active.displayNameRu}</span>
        <span className="mistress-dd__chev" aria-hidden>
          {dropDir === "up" ? "▴" : "▾"}
        </span>
      </button>

      {open ? (
        <ul
          id={listId}
          className="mistress-dd__list"
          role="listbox"
          aria-label="Госпожа"
        >
          {catalog.map((entry) => {
            const isActive = entry.id === activeId;
            const isLocked = !entry.unlocked;
            const hint = isLocked ? mistressUnlockHintRu(entry.id) : "";
            const progress =
              isLocked && unlocks
                ? mistressUnlockProgress(entry.id, unlocks)
                : null;
            return (
              <li key={entry.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  className={`mistress-dd__option mistress-dd__option--${entry.id}${
                    isActive ? " is-active" : ""
                  }${isLocked ? " is-locked" : ""}`}
                  disabled={isLocked}
                  title={hint || entry.taglineRu}
                  onClick={() => select(entry)}
                >
                  <span className="mistress-dd__option-face" aria-hidden>
                    <MistressImg
                      className="mistress-dd__option-face-img"
                      src={mistressFaceSrc(entry)}
                      alt=""
                    />
                  </span>
                  <span className="mistress-dd__option-copy">
                    <span className="mistress-dd__option-name">
                      {entry.displayNameRu}
                      {isLocked ? " · закрыто" : ""}
                    </span>
                    <span className="mistress-dd__option-meta">
                      {isLocked
                        ? progress?.detailRu || hint || entry.taglineRu
                        : entry.taglineRu}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
