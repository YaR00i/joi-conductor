import { useEffect, useMemo, useRef, useState } from "react";
import { QuestMetaBoard } from "./QuestMetaBoard";
import { RouletteMediaPanel } from "./RouletteMediaPanel";
import { UiCheck } from "./UiCheck";
import {
  rangeWheelItems,
  snapToRange,
  WheelPicker,
  type WheelItem,
} from "./WheelPicker";
import { cumplayOptions, finishOptions, toyCombos } from "../lib/catalog";
import {
  coerceCumplayForFinish,
  filterCumplaysForFinish,
} from "../lib/finishCumplayCompat";
import {
  isModeUnlocked,
  type ContentUnlockLists,
} from "../lib/contentUnlocks";
import {
  sealedFatePhraseForSeed,
  sessionSeedHasLock,
  type ActiveSessionSeed,
} from "../lib/contracts/sessionSeed";
import { MODE_LABELS, PARAM_LABELS } from "../lib/labels";
import type { MediaSettings } from "../lib/media";
import type { PlaylistPreloadStatus } from "../lib/mediaPreload";
import { listMistressPresets, type SessionPreset } from "../lib/presets";
import type { SessionMode, SessionParams, ToyDef } from "../lib/types";
import {
  applyPlanToyCount,
  isNoneToyAllowList,
  PLAN_TOY_COUNT_INVENTORY,
  planToyCountFromAllowed,
  planToyCountLabelRu,
  resolvePlanToyPool,
} from "../lib/toyRoulette";
import {
  coerceAllowedToyIdsForMode,
  getModeToyRules,
  modeToyCountBounds,
} from "../lib/modeToyRules";
import {
  filterToysForMode,
  modeToyAdviceRu,
  modeToyRecommendations,
} from "../lib/toyModeAffinity";
import {
  playUiClick,
  playUiConfirm,
  primeUiAudio,
} from "../lib/uiSound";
import { emptyWallet } from "../lib/wallet";
import type { GelbooruListOption } from "../lib/gelbooruLists";
import {
  getActiveMistress,
  getActiveRouletteBias,
  getPlanWheelLimits,
  isModeAllowedForMistress,
  subscribeActiveMistress,
} from "../lib/mistress";

export type RouletteHubTab = "plan" | "media" | "toys" | "tasks";

export type RouletteHubPanelsProps = {
  tab: RouletteHubTab;
  params: SessionParams;
  seed: number;
  unlocks?: ContentUnlockLists;
  activePresetId: string | null;
  media: MediaSettings;
  mediaCount: number;
  favoritesCount: number;
  mediaLoading: boolean;
  mediaError: string | null;
  mediaSaveStatus: string | null;
  playlistPreload: PlaylistPreloadStatus;
  toys: ToyDef[];
  onParams: (next: SessionParams) => void;
  onSeed: (seed: number) => void;
  onReroll: () => void;
  onApplyPreset: (presetId: string) => void;
  onMedia: (next: MediaSettings) => void;
  onLoadGelbooru: () => void;
  onLoadMediaList?: () => void;
  onAssembleMediaList?: () => void;
  mediaLists?: ReadonlyArray<GelbooruListOption>;
  onPickLocal: (files: FileList) => void;
  onSaveMedia: () => void;
  /** WD14 auto-tagger backend status (shown in the local-source panel). */
  wd14Status?: { backend: string; online: boolean; detail: string } | null;
  /** Live tag progress while auto-tagging runs. */
  tagProgress?: { done: number; total: number } | null;
  onStartWd14?: () => void | Promise<unknown>;
  onRefreshWd14?: () => void;
  onToyOwned: (toyId: string, owned: boolean) => void;
  /** Active contract seed — locks plan wheels after a session seal. */
  contractSeed?: ActiveSessionSeed | null;
  onOpenSession?: () => void;
  onOpenContentLists?: () => void;
};

const MODES: SessionMode[] = [
  "stroke",
  "anal",
  "chastity",
  "onahole",
  "cbt",
  "oral",
  "prone",
  "plapping",
];

export function RouletteHubPanels(props: RouletteHubPanelsProps) {
  const unlocks = props.unlocks ?? {
    ...emptyWallet().unlocks,
    pendingShopTags: [],
  };

  switch (props.tab) {
    case "plan":
      return <PlanPanel {...props} unlocks={unlocks} />;
    case "media":
      return <RouletteMediaPanel {...props} unlocks={unlocks} />;
    case "toys":
      return <ToysPanel {...props} />;
    case "tasks":
      return <TasksPanel onOpenSession={props.onOpenSession} />;
    default: {
      const _exhaustive: never = props.tab;
      return _exhaustive;
    }
  }
}

function PlanPanel({
  params,
  seed,
  unlocks,
  toys,
  activePresetId,
  contractSeed = null,
  onParams,
  onReroll,
  onApplyPreset,
}: RouletteHubPanelsProps & { unlocks: ContentUnlockLists }) {
  const [mistressId, setMistressId] = useState(() => getActiveMistress().id);
  useEffect(() => subscribeActiveMistress((p) => setMistressId(p.id)), []);

  const planLimits = useMemo(() => getPlanWheelLimits(), [mistressId]);
  const biasSummary = useMemo(
    () => getActiveRouletteBias().summaryRu,
    [mistressId],
  );
  const sealPhrase = useMemo(
    () =>
      contractSeed
        ? sealedFatePhraseForSeed(contractSeed, mistressId)
        : "",
    [contractSeed, mistressId],
  );
  const sealActive = Boolean(contractSeed && contractSeed.lockKeys.length > 0);
  const lockMode = sessionSeedHasLock(contractSeed, "mode");
  const lockDuration = sessionSeedHasLock(contractSeed, "duration");
  const lockEdges = sessionSeedHasLock(contractSeed, "edges");
  const lockRuins = sessionSeedHasLock(contractSeed, "ruins");
  const lockFinale = sessionSeedHasLock(contractSeed, "finaleOdds");

  const tastePresets = useMemo(
    () => listMistressPresets(mistressId),
    [mistressId],
  );

  const modeToyRecs = useMemo(
    () => modeToyRecommendations(params.mode, toys),
    [params.mode, toys],
  );
  const modeToyAdvice = useMemo(
    () => modeToyAdviceRu(params.mode, toys),
    [params.mode, toys],
  );
  const [modeToysCollapsed, setModeToysCollapsed] = useState(() => {
    try {
      return localStorage.getItem("joi-hub-mode-toys-collapsed") !== "0";
    } catch {
      return true;
    }
  });

  /** Snapshot of allowed pool so Plan picks don't shrink reshuffle options. */
  const [planToyPoolIds, setPlanToyPoolIds] = useState<string[] | null>(null);
  const lastPlanToyWriteRef = useRef<string[] | null>(null);

  useEffect(() => {
    const allowed = params.allowedToyIds;
    const last = lastPlanToyWriteRef.current;
    const sameAsPlanWrite =
      last != null &&
      allowed != null &&
      allowed.length === last.length &&
      allowed.every((id, i) => id === last[i]);
    if (sameAsPlanWrite) return;
    const pool = resolvePlanToyPool(toys, params.mode, allowed, null);
    setPlanToyPoolIds(pool.map((t) => t.id));
  }, [toys, params.mode, params.allowedToyIds]);

  /** Keep allow-list legal for the active mode (must-haves / prone zero). */
  const paramsRef = useRef(params);
  paramsRef.current = params;
  useEffect(() => {
    const p = paramsRef.current;
    const useful = filterToysForMode(
      toys.filter((t) => t.owned),
      p.mode,
    );
    const next = coerceAllowedToyIdsForMode(
      p.allowedToyIds,
      p.mode,
      useful,
      toys,
    );
    const prev = p.allowedToyIds ?? [];
    const same =
      next.length === prev.length && next.every((id, i) => id === prev[i]);
    if (same) return;
    lastPlanToyWriteRef.current = next;
    setPlanToyPoolIds(useful.map((t) => t.id));
    onParams({ ...p, allowedToyIds: next });
  }, [params.mode, toys, onParams]);

  const planToyPool = useMemo(
    () =>
      resolvePlanToyPool(
        toys,
        params.mode,
        params.allowedToyIds,
        planToyPoolIds,
      ),
    [toys, params.mode, params.allowedToyIds, planToyPoolIds],
  );

  const planToyBounds = useMemo(() => {
    const useful = filterToysForMode(
      toys.filter((t) => t.owned),
      params.mode,
    );
    return modeToyCountBounds(params.mode, useful, 3);
  }, [toys, params.mode]);

  const planToyCountMax = Math.min(3, planToyPool.length, planToyBounds.max);
  const planToyCountMin = planToyBounds.forceZero
    ? 0
    : Math.min(planToyBounds.min, planToyCountMax);
  const planToyCountRaw = planToyCountFromAllowed(
    params.allowedToyIds,
    planToyCountMax,
  );
  const planToyCount =
    planToyCountRaw < 0
      ? planToyBounds.forceZero
        ? 0
        : PLAN_TOY_COUNT_INVENTORY
      : Math.max(
          planToyCountMin,
          Math.min(planToyCountMax, planToyCountRaw),
        );
  const planToyCountItems = useMemo<WheelItem<number>[]>(() => {
    const max = Math.max(0, planToyCountMax);
    const min = Math.max(0, planToyCountMin);
    const items: WheelItem<number>[] = [];
    if (!planToyBounds.forceZero) {
      items.push({
        value: PLAN_TOY_COUNT_INVENTORY,
        label: planToyCountLabelRu(PLAN_TOY_COUNT_INVENTORY),
      });
    }
    for (let n = min; n <= max; n++) {
      items.push({ value: n, label: planToyCountLabelRu(n) });
    }
    if (items.length === 0) {
      items.push({ value: 0, label: planToyCountLabelRu(0) });
    }
    return items;
  }, [planToyCountMax, planToyCountMin, planToyBounds.forceZero]);

  const planToysAllowNone = isNoneToyAllowList(params.allowedToyIds);
  const planToysUnrestricted =
    !params.allowedToyIds || params.allowedToyIds.length === 0;

  const planPickedToyNames = useMemo(() => {
    const allowed = params.allowedToyIds ?? [];
    if (!allowed.length || isNoneToyAllowList(allowed)) return [];
    const byId = new Map(toys.map((t) => [t.id, t.nameRu]));
    return allowed
      .filter((id) => id !== "__none__")
      .map((id) => byId.get(id) ?? id);
  }, [params.allowedToyIds, toys]);

  function commitPlanToyCount(count: number) {
    const pool = resolvePlanToyPool(
      toys,
      params.mode,
      params.allowedToyIds,
      planToyPoolIds,
    );
    if (!planToyPoolIds || planToyPoolIds.length === 0) {
      setPlanToyPoolIds(pool.map((t) => t.id));
    }
    const nextAllowed = applyPlanToyCount(
      count,
      pool,
      Math.random,
      params.mode,
    );
    lastPlanToyWriteRef.current = nextAllowed;
    onParams({ ...params, allowedToyIds: nextAllowed });
  }

  const modeItems = useMemo<WheelItem<SessionMode>[]>(
    () =>
      MODES.map((mode) => {
        const shopOk = isModeUnlocked(mode, unlocks);
        const mistressOk = isModeAllowedForMistress(mode, mistressId);
        return {
          value: mode,
          label: MODE_LABELS[mode].nameRu,
          disabled: !shopOk || !mistressOk,
        };
      }),
    [unlocks, mistressId],
  );

  const durationMin = Math.round(params.durationSec / 60);
  const durationItems = useMemo(
    () =>
      rangeWheelItems(
        planLimits.durationMinMin,
        planLimits.durationMaxMin,
        5,
        (n) => `${n}м`,
      ),
    [planLimits],
  );
  const edgesItems = useMemo(
    () => rangeWheelItems(planLimits.edgesMin, planLimits.edgesMax, 1),
    [planLimits],
  );
  const ruinsItems = useMemo(
    () => rangeWheelItems(planLimits.ruinsMin, planLimits.ruinsMax, 1),
    [planLimits],
  );
  const cumChanceItems = useMemo(
    () =>
      rangeWheelItems(
        planLimits.pCumMinPct,
        planLimits.pCumMaxPct,
        5,
        (n) => `${n}%`,
      ),
    [planLimits],
  );
  const ruinChanceItems = useMemo(
    () =>
      rangeWheelItems(
        planLimits.pRuinMinPct,
        planLimits.pRuinMaxPct,
        5,
        (n) => `${n}%`,
      ),
    [planLimits],
  );
  const bpmItems = useMemo(() => rangeWheelItems(20, 180, 5), []);

  const finishItems = useMemo<WheelItem<string>[]>(
    () =>
      finishOptions
        .filter((f) => f.enabled)
        .map((f) => ({ value: f.id, label: f.nameRu })),
    [],
  );
  const cumplayItems = useMemo<WheelItem<string>[]>(() => {
    const enabled = cumplayOptions.filter((c) => c.enabled);
    return filterCumplaysForFinish(enabled, params.finishId).map((c) => ({
      value: c.id,
      label: c.nameRu,
    }));
  }, [params.finishId]);

  const pCumPct = snapToRange(
    Math.round(params.pCum * 100),
    planLimits.pCumMinPct,
    planLimits.pCumMaxPct,
    5,
  );
  const pRuinPct = snapToRange(
    Math.round(params.pRuin * 100),
    planLimits.pRuinMinPct,
    planLimits.pRuinMaxPct,
    5,
  );
  const bpmMin = snapToRange(params.bpmMin, 20, 180, 5);
  const bpmMax = snapToRange(params.bpmMax, 20, 180, 5);

  const activePreset = tastePresets.find((p) => p.id === activePresetId);

  function presetLocked(preset: SessionPreset): boolean {
    const mode = preset.params.mode;
    if (!mode) return false;
    if (!isModeAllowedForMistress(mode, mistressId)) return true;
    return !isModeUnlocked(mode, unlocks);
  }

  // Soft-clamp stored params that sit outside mistress limits (e.g. after pack switch)
  useEffect(() => {
    const next = { ...params };
    let changed = false;
    const durMin = planLimits.durationMinMin * 60;
    const durMax = planLimits.durationMaxMin * 60;
    if (next.durationSec < durMin) {
      next.durationSec = durMin;
      changed = true;
    } else if (next.durationSec > durMax) {
      next.durationSec = durMax;
      changed = true;
    }
    if (next.edgesTarget < planLimits.edgesMin) {
      next.edgesTarget = planLimits.edgesMin;
      changed = true;
    } else if (next.edgesTarget > planLimits.edgesMax) {
      next.edgesTarget = planLimits.edgesMax;
      changed = true;
    }
    if (next.ruinsTarget < planLimits.ruinsMin) {
      next.ruinsTarget = planLimits.ruinsMin;
      changed = true;
    } else if (next.ruinsTarget > planLimits.ruinsMax) {
      next.ruinsTarget = planLimits.ruinsMax;
      changed = true;
    }
    const maxCum = planLimits.pCumMaxPct / 100;
    const minRuin = planLimits.pRuinMinPct / 100;
    if (next.pCum > maxCum) {
      next.pCum = maxCum;
      changed = true;
    }
    if (next.pRuin < minRuin) {
      next.pRuin = minRuin;
      changed = true;
    }
    if (next.pRuin > 1 - next.pCum) {
      next.pRuin = Math.max(0, 1 - next.pCum);
      changed = true;
    }
    if (changed) onParams(next);
    // Only re-clamp when mistress / limits change, not on every param edit
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [mistressId, planLimits]);

  return (
    <div className="roulette-hub__panel">
      {biasSummary ? (
        <p className="hub-plan-bias" role="note">
          {getActiveMistress().displayNameRu}: {biasSummary}
        </p>
      ) : null}
      <section className="hub-wheels__section hub-wheels__section--fire hub-presets">
        <div className="hub-presets__head">
          <span className="hub-presets__title">Её вкусы</span>
          <span className="hub-presets__sub">
            расклады {getActiveMistress().displayNameGenitiveRu}
          </span>
        </div>
        <div className="hub-presets__chips" role="group" aria-label="Пресеты">
          {tastePresets.map((p) => {
            const locked = presetLocked(p);
            return (
              <button
                key={p.id}
                type="button"
                className={`hub-preset ${activePresetId === p.id ? "is-active" : ""} ${locked ? "is-locked" : ""}`}
                title={
                  locked
                    ? `${p.descriptionRu} · режим закрыт или не для этой госпожи`
                    : p.descriptionRu
                }
                disabled={locked || sealActive}
                onClick={() => {
                  void primeUiAudio();
                  playUiClick();
                  onApplyPreset(p.id);
                }}
              >
                {p.nameRu}
                {locked || sealActive ? <em>лок</em> : null}
              </button>
            );
          })}
        </div>
        <p className="hub-presets__desc">
          {activePreset
            ? activePreset.descriptionRu
            : "Выбери вкус — подставит длительность, эджи, BPM и шансы. Набор чипов зависит от госпожи; режимы из Магазина без unlock не дадут."}
        </p>
      </section>

      <div className="hub-wheels">
        {sealActive && contractSeed ? (
          <p className="hub-plan__seal-banner" role="status">
            <span className="hub-plan__seal-tag">Печать</span>
            <strong>{contractSeed.titleRu}</strong>
            {" · "}
            {sealPhrase}
          </p>
        ) : null}
        <section className="hub-wheels__section hub-wheels__section--fire">
          <WheelPicker
            label={PARAM_LABELS.mode.nameRu}
            hint={PARAM_LABELS.mode.descriptionRu}
            items={modeItems}
            value={params.mode}
            itemWidth={88}
            locked={lockMode}
            lockOverlayRu={lockMode ? sealPhrase : undefined}
            onChange={(mode) => onParams({ ...params, mode })}
          />
          <div
            className={`hub-mode-toys${modeToysCollapsed ? " is-collapsed" : ""}`}
            role="note"
          >
            <button
              type="button"
              className="hub-mode-toys__toggle"
              aria-expanded={!modeToysCollapsed}
              onClick={() => {
                void primeUiAudio();
                playUiClick(0.65);
                setModeToysCollapsed((c) => {
                  const next = !c;
                  try {
                    localStorage.setItem(
                      "joi-hub-mode-toys-collapsed",
                      next ? "1" : "0",
                    );
                  } catch {
                    /* ignore */
                  }
                  return next;
                });
              }}
            >
              <span className="hub-mode-toys__advice">{modeToyAdvice}</span>
              <span className="hub-mode-toys__chevron" aria-hidden>
                {modeToysCollapsed ? "▸" : "▾"}
              </span>
            </button>
            {!modeToysCollapsed && modeToyRecs.length > 0 ? (
              <ul className="hub-mode-toys__list">
                {modeToyRecs.map((r) => (
                  <li
                    key={r.toyId}
                    className={`hub-mode-toys__item hub-mode-toys__item--${r.kind}${
                      r.owned ? " is-owned" : " is-missing"
                    }`}
                  >
                    <span className="hub-mode-toys__name">{r.nameRu}</span>
                    <span className="hub-mode-toys__why">{r.reasonRu}</span>
                    <span className="hub-mode-toys__flag">
                      {r.owned ? "есть" : "нет в инвентаре"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </section>

        <section className="hub-wheels__section hub-wheels__section--fire">
          <div className="hub-wheels__row">
            <WheelPicker
              label="Длительность"
              hint={PARAM_LABELS.durationSec.descriptionRu}
              items={durationItems}
              value={snapToRange(
                durationMin,
                planLimits.durationMinMin,
                planLimits.durationMaxMin,
                5,
              )}
              locked={lockDuration}
              lockOverlayRu={lockDuration ? sealPhrase : undefined}
              onChange={(min) =>
                onParams({ ...params, durationSec: min * 60 })
              }
            />
            <WheelPicker
              label="Эджи"
              hint={PARAM_LABELS.edgesTarget.descriptionRu}
              items={edgesItems}
              value={snapToRange(
                params.edgesTarget,
                planLimits.edgesMin,
                planLimits.edgesMax,
                1,
              )}
              locked={lockEdges}
              lockOverlayRu={lockEdges ? sealPhrase : undefined}
              onChange={(edgesTarget) => onParams({ ...params, edgesTarget })}
            />
            <WheelPicker
              label="Руины"
              hint={PARAM_LABELS.ruinsTarget.descriptionRu}
              items={ruinsItems}
              value={snapToRange(
                params.ruinsTarget,
                planLimits.ruinsMin,
                planLimits.ruinsMax,
                1,
              )}
              locked={lockRuins}
              lockOverlayRu={lockRuins ? sealPhrase : undefined}
              onChange={(ruinsTarget) => onParams({ ...params, ruinsTarget })}
            />
            <WheelPicker
              label="Игрушки"
              hint="Из инвентаря = можно предложить mid-session · Без = жёсткий запрет"
              items={planToyCountItems}
              value={planToyCount}
              itemWidth={100}
              onChange={(count) => {
                void primeUiAudio();
                commitPlanToyCount(count);
              }}
            />
          </div>
          <div className="hub-plan-toys-strip" role="status">
            {planPickedToyNames.length > 0 ? (
              <ul className="hub-plan-toys-strip__chips">
                {planPickedToyNames.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            ) : (
              <span className="hub-plan-toys-strip__empty">
                {planToyPool.length === 0
                  ? "нет игрушек для режима"
                  : planToysAllowNone
                    ? "без игрушек"
                    : planToysUnrestricted
                      ? "все из инвентаря · может предложить"
                      : "без игрушек"}
              </span>
            )}
            <button
              type="button"
              className="hub-plan-toys-strip__reshuffle"
              disabled={planToyCount <= 0 || planToyPool.length === 0}
              title="Перебросить выбранные игрушки"
              onClick={() => {
                void primeUiAudio();
                playUiClick();
                commitPlanToyCount(planToyCount);
              }}
            >
              ↻
            </button>
            <span className="hub-plan-toys-strip__pool">пул {planToyPool.length}</span>
          </div>
        </section>

        <section className="hub-wheels__section hub-wheels__section--fire">
          <div className="hub-wheels__row">
            <WheelPicker
              label="Шанс cum"
              hint={PARAM_LABELS.pCum.descriptionRu}
              items={cumChanceItems}
              value={pCumPct}
              locked={lockFinale}
              lockOverlayRu={lockFinale ? sealPhrase : undefined}
              onChange={(pct) => onParams({ ...params, pCum: pct / 100 })}
            />
            <WheelPicker
              label="Шанс ruin"
              hint={PARAM_LABELS.pRuin.descriptionRu}
              items={ruinChanceItems}
              value={pRuinPct}
              locked={lockFinale}
              lockOverlayRu={lockFinale ? sealPhrase : undefined}
              onChange={(pct) => onParams({ ...params, pRuin: pct / 100 })}
            />
          </div>
        </section>

        <section className="hub-wheels__section hub-wheels__section--fire">
          <WheelPicker
            label={PARAM_LABELS.finishId.nameRu}
            hint={PARAM_LABELS.finishId.descriptionRu}
            items={finishItems}
            value={params.finishId}
            itemWidth={96}
            onChange={(finishId) =>
              onParams({
                ...params,
                finishId,
                cumplayId: coerceCumplayForFinish(params.cumplayId, finishId),
              })
            }
          />
          <WheelPicker
            label={PARAM_LABELS.cumplayId.nameRu}
            hint={PARAM_LABELS.cumplayId.descriptionRu}
            items={cumplayItems}
            value={
              cumplayItems.some((c) => c.value === params.cumplayId)
                ? params.cumplayId
                : (cumplayItems[0]?.value ?? "none")
            }
            itemWidth={96}
            onChange={(cumplayId) => onParams({ ...params, cumplayId })}
          />
        </section>

        {params.mode === "chastity" ? (
          <p className="roulette-hub__hint">
            Режим клетки: метронома нет, BPM не используются.
          </p>
        ) : (
          <section className="hub-wheels__section hub-wheels__section--fire">
            <div className="hub-wheels__row">
              <WheelPicker
                label="BPM мин."
                hint={PARAM_LABELS.bpmMin.descriptionRu}
                items={bpmItems}
                value={bpmMin}
                onChange={(next) =>
                  onParams({
                    ...params,
                    bpmMin: next,
                    bpmMax: Math.max(params.bpmMax, next),
                  })
                }
              />
              <WheelPicker
                label="BPM макс."
                hint={PARAM_LABELS.bpmMax.descriptionRu}
                items={bpmItems}
                value={Math.max(bpmMax, bpmMin)}
                onChange={(next) =>
                  onParams({
                    ...params,
                    bpmMax: next,
                    bpmMin: Math.min(params.bpmMin, next),
                  })
                }
              />
            </div>
          </section>
        )}
      </div>

      <section className="hub-wheels__section hub-wheels__section--fire hub-plan__footer">
        <span className="hub-plan__seed" title={PARAM_LABELS.seed.descriptionRu}>
          seed <strong>{seed}</strong>
        </span>
        <button
          type="button"
          className="hub-ember-btn"
          onClick={() => {
            void primeUiAudio();
            playUiConfirm();
            onReroll();
          }}
        >
          Перебросить очередь
        </button>
      </section>
    </div>
  );
}

function ToysPanel({
  toys,
  params,
  onToyOwned,
  onParams,
}: RouletteHubPanelsProps) {
  const usefulIds = useMemo(() => {
    const recs = modeToyRecommendations(params.mode, toys);
    return new Set(recs.map((r) => r.toyId));
  }, [params.mode, toys]);
  const modeRules = getModeToyRules(params.mode);
  const usefulPool = useMemo(
    () => filterToysForMode(toys.filter((t) => t.owned), params.mode),
    [toys, params.mode],
  );

  return (
    <div className="roulette-hub__panel">
      <section className="hub-wheels__section hub-wheels__section--fire hub-toys-sec">
        <div className="hub-media__head">
          <span className="hub-media__title">Инвентарь</span>
          <span className="hub-media__sub">
            Owned → в очередь · Allowed → фильтр сессии (пусто = все owned) ·
            для режима «{MODE_LABELS[params.mode].nameRu}»: {modeRules.summaryRu}
          </span>
        </div>
        <div className="hub-toys">
          {toys.map((t) => {
            const allowed =
              !params.allowedToyIds?.length ||
              params.allowedToyIds.includes(t.id);
            const fitsMode = usefulIds.has(t.id);
            const meta = [
              t.role === "worn"
                ? "worn"
                : t.role === "active"
                  ? "active"
                  : null,
              t.vibe ? "vibe" : null,
              t.size ? `size ${t.size}` : null,
              fitsMode ? "для режима" : null,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <article
                key={t.id}
                className={`hub-toy ${t.owned ? "is-owned" : ""} ${fitsMode ? "is-mode-fit" : ""}`}
              >
                <div className="hub-toy__text">
                  <strong>{t.nameRu}</strong>
                  {meta ? <span className="hub-toy__meta">{meta}</span> : null}
                  <small>{t.descriptionRu}</small>
                </div>
                <div className="hub-toy__flags">
                  <UiCheck
                    className="ui-check--inline"
                    checked={t.owned}
                    onChange={(v) => onToyOwned(t.id, v)}
                  >
                    owned
                  </UiCheck>
                  <UiCheck
                    className="ui-check--inline"
                    checked={allowed}
                    disabled={!t.owned}
                    onChange={(checked) => {
                      const current = params.allowedToyIds ?? [];
                      const ownedIds = toys
                        .filter((x) => x.owned)
                        .map((x) => x.id);
                      let next: string[];
                      if (!current.length) {
                        next = checked
                          ? ownedIds
                          : ownedIds.filter((id) => id !== t.id);
                      } else if (checked) {
                        next = [...new Set([...current, t.id])];
                      } else {
                        next = current.filter((id) => id !== t.id);
                      }
                      const allOwnedSelected =
                        ownedIds.length > 0 &&
                        ownedIds.every((id) => next.includes(id));
                      let allowedToyIds = allOwnedSelected ? [] : next;
                      if (
                        allowedToyIds.length === 0 &&
                        !allOwnedSelected &&
                        !modeRules.allowZero
                      ) {
                        // Would become empty explicit list — coerce must-haves.
                        allowedToyIds = coerceAllowedToyIdsForMode(
                          ["__none__"],
                          params.mode,
                          usefulPool,
                          toys,
                        );
                      } else {
                        allowedToyIds = coerceAllowedToyIdsForMode(
                          allowedToyIds,
                          params.mode,
                          usefulPool,
                          toys,
                        );
                      }
                      onParams({
                        ...params,
                        allowedToyIds,
                      });
                    }}
                  >
                    allowed
                  </UiCheck>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="hub-wheels__section hub-wheels__section--fire hub-combos">
        <div className="hub-media__head">
          <span className="hub-media__title">Комбо</span>
          <span className="hub-media__sub">
            Сами попадают в пул, если оба предмета owned + allowed
          </span>
        </div>
        <div className="hub-combos__list">
          {toyCombos.map((c) => {
            const ready = c.toys.every((id) => {
              const toy = toys.find((t) => t.id === id);
              if (!toy?.owned) return false;
              if (!params.allowedToyIds?.length) return true;
              return params.allowedToyIds.includes(id);
            });
            return (
              <div
                key={c.id}
                className={`hub-combo ${ready ? "is-ready" : "is-off"}`}
                title={c.descriptionRu}
              >
                <strong>{c.nameRu}</strong>
                <em>{ready ? "в пуле" : "нужны оба"}</em>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function TasksPanel({ onOpenSession }: { onOpenSession?: () => void }) {
  return (
    <div className="roulette-hub__panel">
      <section className="hub-wheels__section hub-wheels__section--fire">
        <QuestMetaBoard onGoSession={onOpenSession} />
      </section>
    </div>
  );
}

