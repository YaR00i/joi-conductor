import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  getActiveMistress,
  mistressThemeCssVars,
} from "../lib/mistress";
import { diaryEntryHasReplayablePlan } from "../lib/diaryPlanReplay";
import {
  clearDiaryEntrySouvenir,
  diaryCumplayNameRu,
  diaryPlanFactRows,
  entryCumFate,
  formatCumFate,
  formatDiaryDuration,
  formatDiaryWhen,
  formatFinaleOutcome,
  loadDiaryEntries,
  resolveDiaryMistressPack,
  type DiaryEntry,
} from "../lib/sessionDiary";
import { playUiClick, playUiConfirm, playUiNav, primeUiAudio } from "../lib/uiSound";

function diaryLeafThemeStyle(entry: DiaryEntry | null): CSSProperties {
  const pack = entry ? resolveDiaryMistressPack(entry) : getActiveMistress();
  return mistressThemeCssVars(pack) as CSSProperties;
}

type Props = {
  /** When this changes, reload from storage (e.g. after a new session). */
  revision?: number;
  /** Seed Roulette with this entry's plan (session-replay lite). */
  onRepeatPlan?: (entry: DiaryEntry) => void;
};

type FlipDir = "next" | "prev";

/** Blank spreads so an empty diary can still be leafed through. */
const EMPTY_BOOK_SPREADS = 8;
/** Extra blank spreads after the last written entry. */
const TRAILING_BLANK_SPREADS = 3;
const FLIP_MS = 720;
const DRAG_COMMIT = 0.28;

type SpreadPair = [DiaryEntry | null, DiaryEntry | null];

/** Frozen turning sheet so theme/content stay stable through finish. */
type FlipLayer = {
  dir: FlipDir;
  front: DiaryEntry | null;
  back: DiaryEntry | null;
  frontNo: number;
  backNo: number;
  frontIntro: boolean;
  backIntro: boolean;
};

function buildSpreads(entries: DiaryEntry[]): SpreadPair[] {
  // Chronological book: oldest → newest (newest near the end).
  const chronological = [...entries].reverse();
  const pages: SpreadPair[] = [];
  for (let i = 0; i < chronological.length; i += 2) {
    pages.push([chronological[i] ?? null, chronological[i + 1] ?? null]);
  }
  const target =
    entries.length === 0
      ? EMPTY_BOOK_SPREADS
      : pages.length + TRAILING_BLANK_SPREADS;
  while (pages.length < target) {
    pages.push([null, null]);
  }
  return pages;
}

function lastWrittenSpreadIndex(spreads: SpreadPair[]): number {
  for (let i = spreads.length - 1; i >= 0; i--) {
    const pair = spreads[i];
    if (pair?.[0] || pair?.[1]) return i;
  }
  return 0;
}

export function DiaryPage({ revision = 0, onRepeatPlan }: Props) {
  const [entries, setEntries] = useState<DiaryEntry[]>(() => loadDiaryEntries());
  const spreads = useMemo(() => buildSpreads(entries), [entries]);
  const maxSpread = Math.max(0, spreads.length - 1);
  const lastWritten = useMemo(
    () => lastWrittenSpreadIndex(spreads),
    [spreads],
  );
  const [spread, setSpread] = useState(() => lastWritten);
  const [flip, setFlip] = useState<FlipDir | null>(null);
  const [flipLayer, setFlipLayer] = useState<FlipLayer | null>(null);
  /** Hold landed angle for a frame so clearing drag doesn't restart flip keyframes. */
  const [flipHold, setFlipHold] = useState<FlipDir | null>(null);
  const [outgoing, setOutgoing] = useState<{
    dir: FlipDir;
    left: DiaryEntry | null;
    right: DiaryEntry | null;
    pageNoLeft: number;
    pageNoRight: number;
    introLeft: boolean;
  } | null>(null);
  const [drag, setDrag] = useState<{
    dir: FlipDir;
    progress: number;
    settling?: boolean;
  } | null>(null);
  const dragRef = useRef<{
    dir: FlipDir;
    pointerId: number;
    originX: number;
    originY: number;
    progress: number;
  } | null>(null);
  const flippingRef = useRef(false);
  const settleTimerRef = useRef<number | null>(null);
  const finishRafRef = useRef<number | null>(null);
  const spreadRef = useRef(spread);
  spreadRef.current = spread;
  const flipDirRef = useRef<FlipDir | null>(null);

  useEffect(() => {
    const next = loadDiaryEntries();
    setEntries(next);
    const nextSpreads = buildSpreads(next);
    setSpread(lastWrittenSpreadIndex(nextSpreads));
  }, [revision]);

  useEffect(() => {
    return () => {
      if (settleTimerRef.current != null) {
        window.clearTimeout(settleTimerRef.current);
      }
      if (finishRafRef.current != null) {
        window.cancelAnimationFrame(finishRafRef.current);
      }
    };
  }, []);

  const safeSpread = Math.min(spread, maxSpread);
  const left = spreads[safeSpread]?.[0] ?? null;
  const right = spreads[safeSpread]?.[1] ?? null;
  const peekNext = spreads[safeSpread + 1] ?? null;
  const peekPrev = spreads[safeSpread - 1] ?? null;
  const canNext =
    safeSpread < maxSpread &&
    flip == null &&
    outgoing == null &&
    flipLayer == null &&
    flipHold == null;
  const canPrev =
    safeSpread > 0 &&
    flip == null &&
    outgoing == null &&
    flipLayer == null &&
    flipHold == null;

  const finishFlip = useCallback(() => {
    if (settleTimerRef.current != null) {
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    // Sync static leaves under the sheet, hold the landed angle (no keyframe
    // restart when drag clears), then remove the overlay next frame.
    const holdDir = flipDirRef.current;
    if (holdDir) setFlipHold(holdDir);
    setOutgoing(null);
    setDrag(null);
    if (finishRafRef.current != null) {
      window.cancelAnimationFrame(finishRafRef.current);
    }
    finishRafRef.current = window.requestAnimationFrame(() => {
      finishRafRef.current = window.requestAnimationFrame(() => {
        finishRafRef.current = null;
        setFlipLayer(null);
        setFlip(null);
        setFlipHold(null);
        flipDirRef.current = null;
        flippingRef.current = false;
      });
    });
  }, []);

  /** Advance spread immediately so page numbers bind during the turn. */
  const beginFlip = useCallback(
    (dir: FlipDir) => {
      const from = Math.min(spreadRef.current, maxSpread);
      if (dir === "next" && from >= maxSpread) return false;
      if (dir === "prev" && from <= 0) return false;
      const pair = spreads[from] ?? [null, null];
      const destIdx = dir === "next" ? from + 1 : from - 1;
      const dest = spreads[destIdx] ?? [null, null];
      flipDirRef.current = dir;
      if (dir === "next") {
        setFlipLayer({
          dir: "next",
          front: pair[1],
          back: dest[0],
          frontNo: from * 2 + 2,
          backNo: destIdx * 2 + 1,
          frontIntro: false,
          backIntro: false,
        });
      } else {
        setFlipLayer({
          dir: "prev",
          front: pair[0],
          back: dest[1],
          frontNo: from * 2 + 1,
          backNo: destIdx * 2 + 2,
          frontIntro: from === 0 && entries.length === 0,
          backIntro: false,
        });
      }
      setOutgoing({
        dir,
        left: pair[0],
        right: pair[1],
        pageNoLeft: from * 2 + 1,
        pageNoRight: from * 2 + 2,
        introLeft: from === 0 && entries.length === 0,
      });
      setSpread(destIdx);
      setFlip(dir);
      return true;
    },
    [entries.length, maxSpread, spreads],
  );

  const go = useCallback(
    (dir: FlipDir) => {
      if (flippingRef.current || flip || drag) return;
      if (dir === "next" && safeSpread >= maxSpread) return;
      if (dir === "prev" && safeSpread <= 0) return;
      flippingRef.current = true;
      void primeUiAudio();
      playUiNav();
      if (!beginFlip(dir)) {
        flippingRef.current = false;
        return;
      }
      settleTimerRef.current = window.setTimeout(() => finishFlip(), FLIP_MS);
    },
    [beginFlip, drag, finishFlip, flip, maxSpread, safeSpread],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        go("next");
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        go("prev");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  const onCornerPointerDown = useCallback(
    (dir: FlipDir, e: ReactPointerEvent<HTMLButtonElement>) => {
      if (flippingRef.current || flip || drag?.settling) return;
      if (dir === "next" && safeSpread >= maxSpread) return;
      if (dir === "prev" && safeSpread <= 0) return;
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = {
        dir,
        pointerId: e.pointerId,
        originX: e.clientX,
        originY: e.clientY,
        progress: 0,
      };
      setDrag({ dir, progress: 0 });
    },
    [drag?.settling, flip, maxSpread, safeSpread],
  );

  const onCornerPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      const d = dragRef.current;
      if (!d || d.pointerId !== e.pointerId) return;
      const dx = e.clientX - d.originX;
      const dy = e.clientY - d.originY;
      const raw =
        d.dir === "next"
          ? (-dx * 0.55 + -dy * 0.25) / 180
          : (dx * 0.55 + -dy * 0.25) / 180;
      const progress = Math.max(0, Math.min(0.92, raw));
      d.progress = progress;
      setDrag({ dir: d.dir, progress });
    },
    [],
  );

  const onCornerPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      const d = dragRef.current;
      if (!d || d.pointerId !== e.pointerId) return;
      dragRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      if (d.progress >= DRAG_COMMIT) {
        flippingRef.current = true;
        void primeUiAudio();
        playUiNav();
        if (!beginFlip(d.dir)) {
          flippingRef.current = false;
          setDrag(null);
          return;
        }
        const from = d.progress;
        const remain = Math.max(0.18, 1 - from);
        const ms = Math.round(remain * 520);
        setDrag({ dir: d.dir, progress: from, settling: true });
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setDrag({ dir: d.dir, progress: 1, settling: true });
          });
        });
        settleTimerRef.current = window.setTimeout(() => finishFlip(), ms);
      } else {
        setDrag(null);
      }
    },
    [beginFlip, finishFlip],
  );

  const pageNoLeft = safeSpread * 2 + 1;
  const pageNoRight = safeSpread * 2 + 2;
  const turning =
    flipHold ?? flipLayer?.dir ?? outgoing?.dir ?? flip ?? drag?.dir ?? null;
  const dragProgress = drag && !outgoing ? drag.progress : null;
  const flipStyle =
    dragProgress != null && turning
      ? ({ "--diary-drag": String(dragProgress) } as CSSProperties)
      : (outgoing || flipLayer) && drag?.settling
        ? ({ "--diary-drag": String(drag.progress) } as CSSProperties)
        : undefined;

  const clearSouvenir = useCallback((entryId: string) => {
    void primeUiAudio();
    playUiConfirm();
    setEntries(clearDiaryEntrySouvenir(entryId));
  }, []);

  const repeatPlan = useCallback(
    (entry: DiaryEntry) => {
      if (!onRepeatPlan || !diaryEntryHasReplayablePlan(entry)) return;
      void primeUiAudio();
      playUiClick();
      onRepeatPlan(entry);
    },
    [onRepeatPlan],
  );

  const sub =
    entries.length === 0
      ? "Пока пусто — тяни уголок или ← →"
      : `${entries.length} ${ruSessions(entries.length)} · разворот ${safeSpread + 1} из ${maxSpread + 1}`;

  const showNextFlip =
    flipLayer?.dir === "next" ||
    (turning === "next" &&
      flipLayer == null &&
      (peekNext != null || drag != null));
  const showPrevFlip =
    flipLayer?.dir === "prev" ||
    (turning === "prev" &&
      flipLayer == null &&
      (peekPrev != null || drag != null));

  const nextFront =
    flipLayer?.dir === "next" ? flipLayer.front : right;
  const nextFrontNo =
    flipLayer?.dir === "next" ? flipLayer.frontNo : pageNoRight;
  const nextBack =
    flipLayer?.dir === "next" ? flipLayer.back : (peekNext?.[0] ?? null);
  const nextBackNo =
    flipLayer?.dir === "next" ? flipLayer.backNo : pageNoLeft + 2;
  const nextBackIntro =
    flipLayer?.dir === "next"
      ? flipLayer.backIntro
      : safeSpread + 1 === 0 && entries.length === 0;

  const prevFront =
    flipLayer?.dir === "prev" ? flipLayer.front : left;
  const prevFrontNo =
    flipLayer?.dir === "prev" ? flipLayer.frontNo : pageNoLeft;
  const prevFrontIntro =
    flipLayer?.dir === "prev"
      ? flipLayer.frontIntro
      : safeSpread === 0 && entries.length === 0;
  const prevBack =
    flipLayer?.dir === "prev" ? flipLayer.back : (peekPrev?.[1] ?? null);
  const prevBackNo =
    flipLayer?.dir === "prev" ? flipLayer.backNo : pageNoRight - 2;

  // Under the turning sheet show the destination page immediately
  // (including during drag before commit). Keep the opposite leaf on the
  // outgoing snapshot until the turn finishes.
  const dragPreviewNext = drag?.dir === "next" && flipLayer == null;
  const dragPreviewPrev = drag?.dir === "prev" && flipLayer == null;

  const displayLeft = outgoing?.dir === "next"
    ? outgoing.left
    : dragPreviewPrev
      ? (peekPrev?.[0] ?? null)
      : left;
  const displayLeftNo = outgoing?.dir === "next"
    ? outgoing.pageNoLeft
    : dragPreviewPrev
      ? pageNoLeft - 2
      : pageNoLeft;
  const displayLeftIntro = outgoing?.dir === "next"
    ? outgoing.introLeft
    : dragPreviewPrev
      ? safeSpread - 1 === 0 && entries.length === 0
      : safeSpread === 0 && entries.length === 0;

  const displayRight = outgoing?.dir === "prev"
    ? outgoing.right
    : dragPreviewNext
      ? (peekNext?.[1] ?? null)
      : right;
  const displayRightNo = outgoing?.dir === "prev"
    ? outgoing.pageNoRight
    : dragPreviewNext
      ? pageNoRight + 2
      : pageNoRight;

  /** Hide dog-ears while a turn is committed so old accent doesn't sit above the flip. */
  const cornersTurning =
    outgoing != null || flip != null || flipLayer != null || flipHold != null;

  return (
    <div className="diary-page page--diary">
      <header className="diary-page__head">
        <div>
          <p className="diary-page__eyebrow">Личный журнал</p>
          <h1 className="diary-page__title">Дневник</h1>
          <p className="diary-page__sub">{sub}</p>
        </div>
      </header>

      <div className="diary-stage" aria-label="Дневник сессий">
        <div
          className={[
            "diary-book",
            flipHold === "next"
              ? "is-flip-hold-next"
              : flip === "next" && !drag?.settling
                ? "is-flip-next"
                : "",
            flipHold === "prev"
              ? "is-flip-hold-prev"
              : flip === "prev" && !drag?.settling
                ? "is-flip-prev"
                : "",
            !flipHold && drag?.dir === "next" && !flipLayer
              ? "is-drag-next"
              : "",
            !flipHold && drag?.dir === "prev" && !flipLayer
              ? "is-drag-prev"
              : "",
            !flipHold && drag?.settling && drag.dir === "next"
              ? "is-drag-next"
              : "",
            !flipHold && drag?.settling && drag.dir === "prev"
              ? "is-drag-prev"
              : "",
            !flipHold && drag?.settling ? "is-drag-settling" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          style={flipStyle}
        >
          <div className="diary-book__spine" aria-hidden />
          <div className="diary-book__shadow" aria-hidden />

          <article
            className="diary-leaf diary-leaf--left"
            style={diaryLeafThemeStyle(displayLeft)}
          >
            <div className="diary-leaf__inner">
              {displayLeft ? (
                <DiaryEntryPage
                  entry={displayLeft}
                  pageNo={displayLeftNo}
                  side="left"
                  onClearSouvenir={clearSouvenir}
                  onRepeatPlan={onRepeatPlan ? repeatPlan : undefined}
                />
              ) : (
                <DiaryEmptyPage
                  side="left"
                  pageNo={displayLeftNo}
                  intro={displayLeftIntro}
                />
              )}
            </div>
            <button
              type="button"
              className={`diary-corner diary-corner--prev ${
                canPrev ? "" : "is-disabled"
              }${cornersTurning ? " is-turning" : ""}`}
              aria-label="Листнуть назад — потяни уголок"
              disabled={!canPrev || cornersTurning}
              onPointerDown={(e) => onCornerPointerDown("prev", e)}
              onPointerMove={onCornerPointerMove}
              onPointerUp={onCornerPointerUp}
              onPointerCancel={onCornerPointerUp}
            />
          </article>

          <article
            className="diary-leaf diary-leaf--right"
            style={diaryLeafThemeStyle(displayRight)}
          >
            <div className="diary-leaf__inner">
              {displayRight ? (
                <DiaryEntryPage
                  entry={displayRight}
                  pageNo={displayRightNo}
                  side="right"
                  onClearSouvenir={clearSouvenir}
                  onRepeatPlan={onRepeatPlan ? repeatPlan : undefined}
                />
              ) : (
                <DiaryEmptyPage side="right" pageNo={displayRightNo} />
              )}
            </div>
            <button
              type="button"
              className={`diary-corner diary-corner--next ${
                canNext ? "" : "is-disabled"
              }${cornersTurning ? " is-turning" : ""}`}
              aria-label="Листнуть вперёд — потяни уголок"
              disabled={!canNext || cornersTurning}
              onPointerDown={(e) => onCornerPointerDown("next", e)}
              onPointerMove={onCornerPointerMove}
              onPointerUp={onCornerPointerUp}
              onPointerCancel={onCornerPointerUp}
            />
          </article>

          {showNextFlip ? (
            <div
              className={`diary-flip diary-flip--next ${
                drag && !outgoing
                  ? "is-dragging"
                  : drag?.settling
                    ? "is-settling"
                    : ""
              }`}
              aria-hidden
            >
              <div
                className="diary-flip__face diary-flip__face--front"
                style={diaryLeafThemeStyle(nextFront)}
              >
                <div className="diary-leaf__inner">
                  {nextFront ? (
                    <DiaryEntryPage
                      entry={nextFront}
                      pageNo={nextFrontNo}
                      side="right"
                      onClearSouvenir={clearSouvenir}
                      onRepeatPlan={onRepeatPlan ? repeatPlan : undefined}
                    />
                  ) : (
                    <DiaryEmptyPage side="right" pageNo={nextFrontNo} />
                  )}
                </div>
              </div>
              <div
                className="diary-flip__face diary-flip__face--back"
                style={diaryLeafThemeStyle(nextBack)}
              >
                <div className="diary-leaf__inner">
                  {nextBack ? (
                    <DiaryEntryPage
                      entry={nextBack}
                      pageNo={nextBackNo}
                      side="left"
                      onClearSouvenir={clearSouvenir}
                      onRepeatPlan={onRepeatPlan ? repeatPlan : undefined}
                    />
                  ) : (
                    <DiaryEmptyPage
                      side="left"
                      pageNo={nextBackNo}
                      intro={nextBackIntro}
                    />
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {showPrevFlip ? (
            <div
              className={`diary-flip diary-flip--prev ${
                drag && !outgoing
                  ? "is-dragging"
                  : drag?.settling
                    ? "is-settling"
                    : ""
              }`}
              aria-hidden
            >
              <div
                className="diary-flip__face diary-flip__face--front"
                style={diaryLeafThemeStyle(prevFront)}
              >
                <div className="diary-leaf__inner">
                  {prevFront ? (
                    <DiaryEntryPage
                      entry={prevFront}
                      pageNo={prevFrontNo}
                      side="left"
                      onClearSouvenir={clearSouvenir}
                      onRepeatPlan={onRepeatPlan ? repeatPlan : undefined}
                    />
                  ) : (
                    <DiaryEmptyPage
                      side="left"
                      pageNo={prevFrontNo}
                      intro={prevFrontIntro}
                    />
                  )}
                </div>
              </div>
              <div
                className="diary-flip__face diary-flip__face--back"
                style={diaryLeafThemeStyle(prevBack)}
              >
                <div className="diary-leaf__inner">
                  {prevBack ? (
                    <DiaryEntryPage
                      entry={prevBack}
                      pageNo={prevBackNo}
                      side="right"
                      onClearSouvenir={clearSouvenir}
                      onRepeatPlan={onRepeatPlan ? repeatPlan : undefined}
                    />
                  ) : (
                    <DiaryEmptyPage side="right" pageNo={prevBackNo} />
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ruSessions(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "запись";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "записи";
  return "записей";
}

function DiaryEmptyPage({
  side,
  pageNo,
  intro = false,
}: {
  side: "left" | "right";
  pageNo: number;
  intro?: boolean;
}) {
  if (intro && side === "left") {
    return (
      <div className="diary-entry diary-entry--intro">
        <p className="diary-entry__seal">✦</p>
        <h2 className="diary-entry__title">Дневник сессий</h2>
        <p className="diary-entry__lede">
          Здесь {getActiveMistress().displayNameRu} отмечает, чем закончился
          вечер: эджи, руины, финал и её настроение. Потяни уголок страницы или
          листай стрелками ← →.
        </p>
        <p className="diary-entry__quiet">Жду первую завершённую сессию…</p>
        <span className="diary-entry__page diary-entry__page--foot">
          стр. {pageNo}
        </span>
      </div>
    );
  }
  return (
    <div className="diary-entry diary-entry--empty">
      <p className="diary-entry__quiet">Пустая страница</p>
      <span className="diary-entry__page diary-entry__page--foot">
        стр. {pageNo}
      </span>
    </div>
  );
}

function DiaryEntryPage({
  entry,
  pageNo,
  side,
  onClearSouvenir,
  onRepeatPlan,
}: {
  entry: DiaryEntry;
  pageNo: number;
  side: "left" | "right";
  onClearSouvenir?: (entryId: string) => void;
  onRepeatPlan?: (entry: DiaryEntry) => void;
}) {
  const when = formatDiaryWhen(entry.createdAt);
  const abort = entry.ended === "abort";
  const mistressSrc =
    resolveDiaryMistressPack(entry).assets.moodAvatar[entry.mood];
  const moodTitle = `${entry.moodLabelRu}${
    typeof entry.moodScore === "number"
      ? ` (${entry.moodScore > 0 ? "+" : ""}${entry.moodScore})`
      : ""
  }`;
  const [souvenirBroken, setSouvenirBroken] = useState(false);
  useEffect(() => {
    setSouvenirBroken(false);
  }, [entry.id, entry.resultImageUrl]);
  const showSouvenir =
    Boolean(entry.resultImageUrl) &&
    entry.finaleOutcome != null &&
    entry.finaleOutcome !== "deny";
  const planFacts = diaryPlanFactRows(entry);
  const canRepeat = Boolean(onRepeatPlan) && diaryEntryHasReplayablePlan(entry);

  return (
    <div className={`diary-entry diary-entry--${side}`}>
      <header className="diary-entry__head">
        <div className="diary-entry__when">
          <span className="diary-entry__day">{when.day}</span>
          <span className="diary-entry__time">{when.time}</span>
        </div>
      </header>

      <div className="diary-entry__main">
        <div className="diary-entry__body">
          <h2 className="diary-entry__title">
            {abort ? "Сессия прервана" : "Сессия завершена"}
          </h2>
          <dl className="diary-entry__facts">
            <div>
              <dt>Госпожа</dt>
              <dd>
                {entry.mistressNameRu}
                <span className="diary-entry__muted">
                  {" "}
                  · {entry.moodLabelRu}
                  {typeof entry.moodScore === "number"
                    ? ` (${entry.moodScore > 0 ? "+" : ""}${entry.moodScore})`
                    : ""}
                </span>
              </dd>
            </div>
            <div>
              <dt>Длительность</dt>
              <dd>
                {formatDiaryDuration(entry.elapsedSec)}
                <span className="diary-entry__muted">
                  {" "}
                  · план {formatDiaryDuration(entry.durationSec)}
                </span>
              </dd>
            </div>
            <div>
              <dt>Режим</dt>
              <dd>{entry.modeNameRu}</dd>
            </div>
            <div>
              <dt>Эджи</dt>
              <dd>
                {entry.edgesDone}
                <span className="diary-entry__muted">
                  {" "}
                  / {entry.edgesTarget}
                </span>
              </dd>
            </div>
            <div>
              <dt>Руины</dt>
              <dd>
                {entry.ruinsDone}
                <span className="diary-entry__muted">
                  {" "}
                  / {entry.ruinsTarget}
                </span>
              </dd>
            </div>
            <div>
              <dt>Финал</dt>
              <dd>{formatFinaleOutcome(entry.finaleOutcome)}</dd>
            </div>
            {entry.finaleOutcome && entry.finaleOutcome !== "deny" ? (
              <>
                <div>
                  <dt>Куда</dt>
                  <dd>{entry.finishNameRu}</dd>
                </div>
                <div>
                  <dt>Cumplay</dt>
                  <dd>{diaryCumplayNameRu(entry)}</dd>
                </div>
                <div>
                  <dt>Сперма</dt>
                  <dd>{formatCumFate(entryCumFate(entry))}</dd>
                </div>
              </>
            ) : null}
            {planFacts.map((row) => (
              <div key={row.labelRu}>
                <dt>{row.labelRu}</dt>
                <dd>{row.valueRu}</dd>
              </div>
            ))}
          </dl>

          {entry.tagsLabelRu ? (
            <div className="diary-entry__content">
              <p className="diary-entry__tags">
                <span>Контент</span> {entry.tagsLabelRu}
              </p>
            </div>
          ) : null}

          {canRepeat ? (
            <button
              type="button"
              className="diary-entry__repeat"
              onClick={() => onRepeatPlan?.(entry)}
            >
              Повторить план
            </button>
          ) : null}
        </div>

        <figure className="diary-entry__mistress" title={moodTitle}>
          <img
            className="diary-entry__mistress-img"
            src={mistressSrc}
            alt={`${entry.mistressNameRu} · ${entry.moodLabelRu}`}
            draggable={false}
          />
        </figure>
      </div>

      {showSouvenir ? (
        <figure className="diary-entry__souvenir">
          <figcaption className="diary-entry__souvenir-cap">
            На что кончил
          </figcaption>
          <div
            className={`diary-entry__souvenir-frame${
              souvenirBroken ? " is-broken" : ""
            }`}
          >
            {!souvenirBroken ? (
              <img
                className="diary-entry__souvenir-img"
                src={entry.resultImageUrl}
                alt=""
                draggable={false}
                loading="lazy"
                onError={() => setSouvenirBroken(true)}
              />
            ) : (
              <span className="diary-entry__souvenir-fail" aria-hidden>
                нет кадра
              </span>
            )}
            {onClearSouvenir ? (
              <button
                type="button"
                className="diary-entry__souvenir-clear"
                aria-label="Удалить снимок"
                title="Удалить снимок"
                onClick={() => onClearSouvenir(entry.id)}
              >
                ×
              </button>
            ) : null}
          </div>
        </figure>
      ) : null}

      <span className="diary-entry__page diary-entry__page--foot">
        стр. {pageNo}
      </span>
    </div>
  );
}
