import { useEffect, useMemo, useRef, useState } from "react";
import { functions, patterns } from "../../lib/catalog";
import { QUEST_CATALOG } from "../../lib/quests";
import {
  beatDriftMs,
  buildLabBlock,
  canForceLabQuest,
  clonePlanBlockForLab,
  defaultLabDraft,
  diagnoseBeatSilence,
  canAppendToLiveLab,
  isLabPracticeRun,
  labBlockCaptionRu,
  labBlocksToStart,
  labPlanSourceBlocks,
  labQuestTriggerTitleRu,
  labQueueCountRu,
  labSourceBlockCaptionRu,
  LAB_BREATH_OPTIONS,
  LAB_GOAL_OPTIONS,
  MAX_LAB_QUEUE,
  nextBeatInMs,
  type LabDraft,
  type LabGoalKind,
} from "../../lib/sessionBlockLab";
import { vibeProfiles } from "../../lib/vibeProfiles";
import type {
  BeatPatternDef,
  Block,
  QuestId,
  SessionMode,
  SessionState,
} from "../../lib/types";
import { playUiClick, primeUiAudio } from "../../lib/uiSound";
import { SessionFxLabStrip } from "../SessionFxLabStrip";

type Props = {
  state: SessionState | null;
  currentBlock: Block | undefined;
  currentPat: BeatPatternDef | undefined;
  inPreflight: boolean;
  promptGate: boolean;
  lastBeat: { atMs: number; firedPerf: number } | null;
  planQueue?: Block[];
  onStartLabBlock: (blocks: Block[]) => boolean | Promise<boolean>;
  onAppendLabBlock?: (block: Block) => void;
  onForceLabQuest?: (questId: QuestId) => void;
  onPause: () => void;
  onResume: () => void;
  onSkip: () => void;
  onAbort: () => void;
};

function functionChoices(goal: LabGoalKind) {
  if (goal === "rest") {
    return functions.filter((f) => f.id === "rest_hands_off");
  }
  if (goal === "vibe") {
    return functions.filter((f) => f.enabled && f.drive === "vibe");
  }
  return functions.filter(
    (f) => f.enabled && f.drive !== "vibe" && f.id !== "rest_hands_off",
  );
}

export function SessionBlockLab({
  state,
  currentBlock,
  currentPat,
  inPreflight,
  promptGate,
  lastBeat,
  planQueue = [],
  onStartLabBlock,
  onAppendLabBlock,
  onForceLabQuest,
  onPause,
  onResume,
  onSkip,
  onAbort,
}: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<LabDraft>(defaultLabDraft);
  const [queued, setQueued] = useState<Block[]>([]);
  const [nextInMs, setNextInMs] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const fns = useMemo(() => functionChoices(draft.goal), [draft.goal]);
  const pats = useMemo(
    () => patterns.filter((p) => p.enabled),
    [],
  );

  useEffect(() => {
    const list = functionChoices(draft.goal);
    if (list.length === 0) return;
    if (!list.some((f) => f.id === draft.functionId)) {
      setDraft((d) => ({ ...d, functionId: list[0]!.id }));
    }
  }, [draft.goal, draft.functionId]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const busy =
    state?.status === "running" || state?.status === "paused";
  const liveLab = busy && isLabPracticeRun(state);
  const listBlocks = liveLab ? (state?.queue ?? []) : queued;
  const liveIndex = liveLab ? (state?.index ?? -1) : -1;
  const queueFull = liveLab
    ? (state?.queue.length ?? 0) >= MAX_LAB_QUEUE
    : queued.length >= MAX_LAB_QUEUE;
  const composeLocked = inPreflight && !liveLab;
  const silence = diagnoseBeatSilence({
    block: currentBlock,
    pattern: currentPat,
    promptGate,
    breathPhase: state?.breathPhase ?? null,
    inPreflight,
  });
  const drift = beatDriftMs({
    originPerf: state?.beatOriginPerf,
    lastBeatAtMs: lastBeat?.atMs,
    lastBeatFiredPerf: lastBeat?.firedPerf,
  });

  useEffect(() => {
    if (!open || !busy || !currentPat || silence) {
      setNextInMs(null);
      return;
    }
    const tick = () => {
      const next = nextBeatInMs({
        pattern: currentPat,
        bpm: currentBlock?.bpm ?? 60,
        originPerf: state?.beatOriginPerf,
        untilAtMs: state?.beatUntilAtMs,
      });
      setNextInMs(next?.inMs ?? null);
    };
    tick();
    const id = window.setInterval(tick, 80);
    return () => window.clearInterval(id);
  }, [
    open,
    busy,
    currentPat,
    currentBlock?.bpm,
    silence,
    state?.beatOriginPerf,
    state?.beatUntilAtMs,
  ]);

  function patch<K extends keyof LabDraft>(key: K, value: LabDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function enqueueBlock(block: Block) {
    if (liveLab) {
      if (!canAppendToLiveLab(state) || !onAppendLabBlock) return;
      onAppendLabBlock(block);
      return;
    }
    if (queued.length >= MAX_LAB_QUEUE || inPreflight) return;
    setQueued((q) => [...q, block]);
  }

  function enqueueDraft() {
    enqueueBlock(buildLabBlock(draft, state?.params.mode ?? "stroke"));
  }

  function moveQueued(index: number, dir: -1 | 1) {
    setQueued((q) => {
      const j = index + dir;
      if (j < 0 || j >= q.length) return q;
      const next = q.slice();
      const tmp = next[index]!;
      next[index] = next[j]!;
      next[j] = tmp;
      return next;
    });
  }

  async function runQueue() {
    const blocks = labBlocksToStart(
      queued,
      liveLab ? state?.queue : undefined,
      buildLabBlock(draft, state?.params.mode ?? "stroke"),
    );
    const started = await onStartLabBlock(blocks);
    if (started) setQueued([]);
  }

  const status = state?.status ?? "idle";
  const questReady = canForceLabQuest({
    status,
    inPreflight,
    promptGate,
    pendingQuest: Boolean(state?.pendingQuest),
    activeQuest: Boolean(state?.activeQuest),
  });
  const questTitle = labQuestTriggerTitleRu({
    status,
    inPreflight,
    promptGate,
    pendingQuest: Boolean(state?.pendingQuest),
    activeQuest: Boolean(state?.activeQuest),
    hasOffer: Boolean(state?.questOffer),
  });
  const chipLabel = liveLab
    ? labQueueCountRu(state?.queue.length ?? 0)
    : queued.length > 0
      ? labQueueCountRu(queued.length)
      : "черновик";

  return (
    <div className="session__cache-panel" ref={wrapRef}>
      <button
        type="button"
        className="session__media-chip session__media-chip--lab"
        title="Лаборатория блоков — очередь без рулетки"
        aria-expanded={open}
        onClick={() => {
          playUiClick();
          setOpen((v) => !v);
        }}
      >
        <span className="session__media-chip__kind">лаборатория</span>
        <span className="session__media-chip__pct">{chipLabel}</span>
      </button>

      {open ? (
        <div
          className="session__cache-dropdown session__lab-dropdown"
          role="dialog"
          aria-label="Лаборатория блоков сессии"
        >
          <div className="session__cache-dropdown__head">
            <div>
              <strong>Лаборатория</strong>
              <span className="session__cache-dropdown__sub">
                очередь без рулетки · песочница
              </span>
            </div>
          </div>

          <SessionFxLabStrip />

          <div className="session__lab-form">
            <label>
              Цель
              <select
                value={draft.goal}
                onChange={(e) =>
                  patch("goal", e.target.value as LabGoalKind)
                }
              >
                {LAB_GOAL_OPTIONS.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nameRu}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Функция
              <select
                value={draft.functionId}
                disabled={draft.goal === "rest"}
                onChange={(e) => patch("functionId", e.target.value)}
              >
                {fns.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nameRu}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Паттерн
              <select
                value={draft.patternId}
                onChange={(e) => patch("patternId", e.target.value)}
              >
                {pats.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nameRu}
                  </option>
                ))}
              </select>
            </label>
            {draft.goal === "vibe" ? (
              <label>
                Профиль вайба
                <select
                  value={draft.vibeProfileId}
                  onChange={(e) => patch("vibeProfileId", e.target.value)}
                >
                  {vibeProfiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nameRu}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {draft.goal === "breath" ? (
              <label>
                Режим дыхания
                <select
                  value={draft.breathMode}
                  onChange={(e) =>
                    patch(
                      "breathMode",
                      e.target.value as LabDraft["breathMode"],
                    )
                  }
                >
                  {LAB_BREATH_OPTIONS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nameRu}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label>
              BPM
              <input
                type="number"
                min={20}
                max={240}
                value={draft.bpm}
                onChange={(e) =>
                  patch("bpm", Number(e.target.value) || 60)
                }
              />
            </label>
            <label>
              Секунды
              <input
                type="number"
                min={4}
                max={180}
                value={draft.durationSec}
                onChange={(e) =>
                  patch("durationSec", Number(e.target.value) || 8)
                }
              />
            </label>
          </div>

          <LabCatalogPicks
            planQueue={planQueue}
            queueFull={queueFull || composeLocked}
            liveLab={liveLab}
            mode={state?.params.mode ?? "stroke"}
            questReady={questReady}
            questTitle={questTitle}
            onEnqueue={enqueueBlock}
            onForceLabQuest={onForceLabQuest}
          />

          {listBlocks.length > 0 ? (
            <ul className="session__lab-queue" aria-label="Очередь лаборатории">
              {listBlocks.map((block, i) => (
                <li
                  key={block.id}
                  className={
                    "session__lab-queue-item" +
                    (i === liveIndex
                      ? " is-current"
                      : i < liveIndex
                        ? " is-past"
                        : "")
                  }
                >
                  <span className="session__lab-queue-item__num">{i + 1}</span>
                  <span className="session__lab-queue-item__cap">
                    {labBlockCaptionRu(block)}
                  </span>
                  {liveLab ? null : (
                    <>
                      <button
                        type="button"
                        className="session__queue-op"
                        disabled={i === 0}
                        title="Выше"
                        aria-label="Выше"
                        onClick={() => {
                          playUiClick();
                          moveQueued(i, -1);
                        }}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="session__queue-op"
                        disabled={i === listBlocks.length - 1}
                        title="Ниже"
                        aria-label="Ниже"
                        onClick={() => {
                          playUiClick();
                          moveQueued(i, 1);
                        }}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="session__queue-op"
                        title="Убрать"
                        aria-label="Убрать"
                        onClick={() => {
                          playUiClick();
                          setQueued((q) => q.filter((_, j) => j !== i));
                        }}
                      >
                        ×
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="session__lab-actions">
            <button
              type="button"
              disabled={queueFull || composeLocked}
              title={
                liveLab
                  ? "Дописать в конец текущей сессии"
                  : "Добавить черновик в очередь"
              }
              onClick={() => {
                playUiClick();
                enqueueDraft();
              }}
            >
              В очередь
            </button>
            <button
              type="button"
              className="session__lab-run"
              title={
                liveLab
                  ? "Остановить и запустить очередь сначала"
                  : "Запустить очередь или черновик"
              }
              onClick={() => {
                void primeUiAudio();
                playUiClick();
                void runQueue();
              }}
            >
              {liveLab ? "Заново" : "Запустить"}
            </button>
            {!liveLab && queued.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  playUiClick();
                  setQueued([]);
                }}
              >
                Очистить
              </button>
            ) : null}
            <button
              type="button"
              disabled={status !== "running"}
              onClick={() => {
                playUiClick();
                onPause();
              }}
            >
              Пауза
            </button>
            <button
              type="button"
              disabled={status !== "paused"}
              onClick={() => {
                playUiClick();
                onResume();
              }}
            >
              Дальше
            </button>
            <button
              type="button"
              disabled={status !== "running"}
              onClick={() => {
                playUiClick();
                onSkip();
              }}
            >
              Пропуск
            </button>
            <button
              type="button"
              disabled={!busy && !inPreflight}
              onClick={() => {
                playUiClick();
                onAbort();
              }}
            >
              Стоп
            </button>
          </div>

          {busy || inPreflight ? (
            <div className="session__lab-hud">
              <div>
                Следующий удар:{" "}
                {silence
                  ? "—"
                  : nextInMs == null
                    ? "…"
                    : `${nextInMs} мс`}
              </div>
              <div>
                Дрейф звук↔шарик:{" "}
                {silence || drift == null ? "—" : `${drift} мс`}
              </div>
              <div>
                Тишина: {silence ? silence.labelRu : "нет, дорожка играет"}
              </div>
              {liveLab ? (
                <div>
                  «Добавить» и «В очередь» допишут в конец. «Вызвать» кидает
                  выбранное задание на экран.
                </div>
              ) : null}
            </div>
          ) : (
            <p className="session__lab-hint">
              Собери блок или возьми из плана, «В очередь» / «Добавить», потом
              «Запустить». Во время прогона «Вызвать» показывает выбранное
              задание.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

type LabCatalogPicksProps = {
  planQueue: Block[];
  queueFull: boolean;
  liveLab: boolean;
  mode: SessionMode;
  questReady: boolean;
  questTitle: string;
  onEnqueue: (block: Block) => void;
  onForceLabQuest?: (questId: QuestId) => void;
};

function LabCatalogPicks({
  planQueue,
  queueFull,
  liveLab,
  mode,
  questReady,
  questTitle,
  onEnqueue,
  onForceLabQuest,
}: LabCatalogPicksProps) {
  const planBlocks = useMemo(
    () => labPlanSourceBlocks(planQueue),
    [planQueue],
  );
  const [planPickId, setPlanPickId] = useState(
    () => labPlanSourceBlocks(planQueue)[0]?.id ?? "",
  );
  const [questPickId, setQuestPickId] = useState<QuestId>(
    QUEST_CATALOG[0]?.id ?? "ball_taps",
  );

  useEffect(() => {
    if (planBlocks.some((b) => b.id === planPickId)) return;
    setPlanPickId(planBlocks[0]?.id ?? "");
  }, [planBlocks, planPickId]);

  function enqueuePlanPick() {
    const src = planBlocks.find((b) => b.id === planPickId);
    if (!src) return;
    onEnqueue(clonePlanBlockForLab(src, mode));
  }

  function forcePickedQuest() {
    if (!onForceLabQuest) return;
    if (!questReady) return;
    onForceLabQuest(questPickId);
  }

  return (
    <>
      <div className="session__lab-pick">
        <label>
          Из плана
          <select
            value={planPickId}
            disabled={planBlocks.length === 0}
            onChange={(e) => setPlanPickId(e.target.value)}
          >
            {planBlocks.length === 0 ? (
              <option value="">
                Нет блоков — перебрось очередь на Рулетке
              </option>
            ) : (
              planBlocks.map((b) => (
                <option key={b.id} value={b.id}>
                  {labSourceBlockCaptionRu(b)}
                </option>
              ))
            )}
          </select>
        </label>
        <button
          type="button"
          disabled={planBlocks.length === 0 || queueFull || !planPickId}
          title={
            planBlocks.length === 0
              ? "Сначала собери очередь на Рулетке"
              : liveLab
                ? "Дописать выбранный блок плана в конец"
                : "Добавить выбранный блок плана в очередь лаборатории"
          }
          onClick={() => {
            playUiClick();
            enqueuePlanPick();
          }}
        >
          Добавить
        </button>
      </div>

      <div className="session__lab-pick">
        <label>
          Задание
          <select
            value={questPickId}
            onChange={(e) => {
              const next = QUEST_CATALOG.find((q) => q.id === e.target.value);
              if (next) setQuestPickId(next.id);
            }}
          >
            {QUEST_CATALOG.map((q) => (
              <option key={q.id} value={q.id}>
                {q.nameRu}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={!onForceLabQuest || !questReady}
          title={questTitle}
          onClick={() => {
            playUiClick();
            forcePickedQuest();
          }}
        >
          Вызвать
        </button>
      </div>
    </>
  );
}
