import { useEffect, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import { splitMediaTags, type MediaItem } from "../lib/media";
import { revealFavoriteOnDisk } from "../lib/mediaFavorites";
import { playUiClick, primeUiAudio } from "../lib/uiSound";
import { FavLightboxMedia } from "./FavLightboxMedia";

type Props = {
  item: MediaItem;
  videoRef?: Ref<HTMLVideoElement>;
  label?: string;
  counter?: string | null;
  canPrev: boolean;
  canNext: boolean;
  saved: boolean;
  listed?: boolean;
  saveBusy?: boolean;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onToggleSave: () => void;
  onOpenLists?: () => void;
  runHud?: ReactNode;
};

type WebkitEl = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

function isLightboxFullscreen(root: HTMLElement | null): boolean {
  if (!root) return false;
  const active = document.fullscreenElement;
  return active === root || root.contains(active);
}

async function toggleLightboxFullscreen(root: HTMLElement): Promise<void> {
  if (isLightboxFullscreen(root)) {
    if (document.fullscreenElement) await document.exitFullscreen();
    return;
  }
  const webkit = root as WebkitEl;
  if (root.requestFullscreen) {
    await root.requestFullscreen();
    return;
  }
  webkit.webkitRequestFullscreen?.();
}

export function FavLightbox({
  item,
  videoRef,
  label = "Просмотр поста",
  counter,
  canPrev,
  canNext,
  saved,
  listed = false,
  saveBusy = false,
  onClose,
  onPrev,
  onNext,
  onToggleSave,
  onOpenLists,
  runHud = null,
}: Props) {
  const [tagsOpen, setTagsOpen] = useState(false);
  const [diskBusy, setDiskBusy] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const tagsRef = useRef<HTMLDivElement>(null);
  const tags = useMemo(() => splitMediaTags(item.tags), [item.tags]);

  useEffect(() => {
    function sync() {
      setFullscreen(isLightboxFullscreen(rootRef.current));
    }
    document.addEventListener("fullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      const root = rootRef.current;
      if (root && document.fullscreenElement === root) {
        void document.exitFullscreen();
      }
    };
  }, []);

  async function toggleFullscreen() {
    const root = rootRef.current;
    if (!root) return;
    void primeUiAudio();
    playUiClick();
    if (fullscreen) {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
      } catch {
        /* already left */
      }
      setFullscreen(false);
      return;
    }
    try {
      await toggleLightboxFullscreen(root);
      setFullscreen(true);
    } catch {
      setFullscreen(true);
    }
  }

  useEffect(() => {
    setTagsOpen(false);
  }, [item.id]);

  useEffect(() => {
    if (!tagsOpen) return;
    function onPtr(e: PointerEvent) {
      const root = tagsRef.current;
      if (root && !root.contains(e.target as Node)) setTagsOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setTagsOpen(false);
    }
    document.addEventListener("pointerdown", onPtr);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPtr);
      window.removeEventListener("keydown", onKey);
    };
  }, [tagsOpen]);

  async function revealOnDisk() {
    if (diskBusy) return;
    setDiskBusy(true);
    try {
      const res = await revealFavoriteOnDisk(item);
      if (!res.ok) return;
    } finally {
      setDiskBusy(false);
    }
  }

  return (
    <div
      ref={rootRef}
      className={"fav-lightbox" + (fullscreen ? " is-fullscreen" : "")}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        if (document.fullscreenElement || fullscreen) return;
        onClose();
      }}
    >
      <div
        className="fav-lightbox__toolbar"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className={"fav-lightbox__tool" + (fullscreen ? " is-on" : "")}
          title={fullscreen ? "Окно" : "Полный экран"}
          aria-label={fullscreen ? "Окно" : "Полный экран"}
          aria-pressed={fullscreen}
          onClick={() => void toggleFullscreen()}
        >
          <FullscreenIcon expanded={fullscreen} />
        </button>
        <button
          type="button"
          className="fav-lightbox__tool fav-lightbox__tool--close"
          title="Закрыть"
          aria-label="Закрыть"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <button
        type="button"
        className="fav-lightbox__nav fav-lightbox__nav--prev"
        title="Предыдущая (←)"
        aria-label="Предыдущая"
        disabled={!canPrev}
        onClick={(e) => {
          e.stopPropagation();
          onPrev();
        }}
      >
        ‹
      </button>
      <button
        type="button"
        className="fav-lightbox__nav fav-lightbox__nav--next"
        title="Следующая (→)"
        aria-label="Следующая"
        disabled={!canNext}
        onClick={(e) => {
          e.stopPropagation();
          onNext();
        }}
      >
        ›
      </button>
      <div className="fav-lightbox__stage">
        <div className="fav-lightbox__cluster">
          <div className="fav-lightbox__media-wrap">
            <FavLightboxMedia item={item} videoRef={videoRef}>
              <div ref={tagsRef} className="fav-lightbox__chrome">
                {tagsOpen && tags.length > 0 ? (
                  <div
                    className="fav-lightbox__tagfly"
                    role="dialog"
                    aria-label="Теги"
                  >
                    <ul>
                      {tags.map((tag) => (
                        <li key={tag}>
                          <span>{tag.replace(/_/g, " ")}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="fav-lightbox__actions">
                <button
                  type="button"
                  className="fav-lightbox__tool"
                  disabled={!item.gelbooruId}
                  title="На сайте"
                  aria-label="На сайте"
                  onClick={() => openGelbooruSite(item)}
                >
                  <SiteIcon />
                </button>
                <button
                  type="button"
                  className={"fav-lightbox__tool" + (saved ? " is-on" : "")}
                  disabled={saveBusy}
                  title={saved ? "Убрать с полки" : "На полку"}
                  aria-label={saved ? "Убрать с полки" : "На полку"}
                  onClick={onToggleSave}
                >
                  <HeartIcon filled={saved} />
                </button>
                {onOpenLists ? (
                  <button
                    type="button"
                    className={"fav-lightbox__tool" + (listed ? " is-on" : "")}
                    title={listed ? "Списки" : "Добавить в список"}
                    aria-label={listed ? "Списки" : "Добавить в список"}
                    onClick={onOpenLists}
                  >
                    <BookmarkIcon filled={listed} />
                  </button>
                ) : null}
                {tags.length > 0 ? (
                  <button
                    type="button"
                    className={"fav-lightbox__tool" + (tagsOpen ? " is-on" : "")}
                    title="Показать теги"
                    aria-label="Показать теги"
                    aria-expanded={tagsOpen}
                    onClick={() => setTagsOpen((open) => !open)}
                  >
                    <TagsIcon />
                  </button>
                ) : null}
                {saved ? (
                  <button
                    type="button"
                    className="fav-lightbox__tool"
                    disabled={diskBusy}
                    title="Показать на диске"
                    aria-label="Показать на диске"
                    onClick={() => void revealOnDisk()}
                  >
                    <FolderIcon />
                  </button>
                ) : null}
              </div>
              </div>
            </FavLightboxMedia>
          </div>
          {counter ? (
            <p className="fav-lightbox__counter" aria-live="polite">
              {counter}
            </p>
          ) : null}
        </div>
      </div>
      {runHud ? (
        <div
          className="fav-lightbox__run"
          onClick={(e) => e.stopPropagation()}
        >
          {runHud}
        </div>
      ) : null}
    </div>
  );
}

export function openGelbooruSite(item: Pick<MediaItem, "gelbooruId">): void {
  const gid = item.gelbooruId?.trim();
  if (!gid) return;
  void primeUiAudio();
  playUiClick();
  const url = `https://gelbooru.com/index.php?page=post&s=view&id=${gid}`;
  const desktop = window.joiDesktop?.shell?.openExternal;
  if (desktop) {
    void desktop(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden>
      <path
        d="M8 13.55S2.7 10.1 2.7 6.55A2.85 2.85 0 0 1 8 4.2a2.85 2.85 0 0 1 5.3 2.35C13.3 10.1 8 13.55 8 13.55z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={filled ? 0 : 1.35}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden>
      <path
        d="M4.2 2.4h7.6c.44 0 .8.36.8.8v10.2l-4.6-2.35L3.4 13.4V3.2c0-.44.36-.8.8-.8z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={filled ? 0 : 1.35}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SelectIcon({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden>
      <rect
        x="2.5"
        y="2.5"
        width="11"
        height="11"
        rx="2.2"
        fill={on ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.35"
      />
      {on ? (
        <path
          d="M5.15 8.15 7.1 10.05 11 5.7"
          fill="none"
          stroke="#1a0d08"
          strokeWidth="1.55"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
    </svg>
  );
}

export function CardSelectButton({
  selected,
  onClick,
}: {
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={"doujin-card__select" + (selected ? " is-on" : "")}
      aria-pressed={selected}
      title={selected ? "Убрать из выбранных" : "Выбрать"}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      <SelectIcon on={selected} />
    </button>
  );
}

function FullscreenIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden>
      {expanded ? (
        <path
          d="M6.2 3.2H3.4v2.8M9.8 3.2h2.8v2.8M6.2 12.8H3.4V10M9.8 12.8h2.8V10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="M3.4 6.2V3.4h2.8M9.8 3.4h2.8v2.8M3.4 9.8v2.8h2.8M12.6 9.8v2.8H9.8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden>
      <path
        d="M2.3 4.1h4.2l1.15 1.35H13.7v6.9H2.3z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TagsIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden>
      <path
        d="M3.1 8.4 8.4 3.1h4.5v4.5L7.6 12.9z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
      <circle cx="10.7" cy="5.3" r="0.85" fill="currentColor" />
    </svg>
  );
}

function SiteIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden>
      <path
        d="M6.6 3.2H3.7A1.5 1.5 0 0 0 2.2 4.7v7.6A1.5 1.5 0 0 0 3.7 13.8h7.6a1.5 1.5 0 0 0 1.5-1.5V9.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
      <path
        d="M9.2 2.8h4v4M13.2 2.8 8 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
