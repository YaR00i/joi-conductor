import { useEffect, useMemo, useState } from "react";
import { BooruTagInput } from "./BooruTagInput";
import type { FetishTier } from "../lib/fetishTiers";
import {
  getActiveMistress,
  getActiveRouletteBias,
  subscribeActiveMistress,
} from "../lib/mistress";
import {
  clearFetishOverride,
  characterCatalogOptions,
  cumplayCatalogOptions,
  DEFAULT_ROULETTE_SETTINGS,
  EDITABLE_PARAM_GROUPS,
  fetishCatalogOptions,
  findFetishEntry,
  finishCatalogOptions,
  isOptionEnabled,
  isStepEnabled,
  mediaTypeCatalogOptions,
  newCustomFetishId,
  newParamOptionId,
  paramCatalogOptions,
  removeParamOption,
  resetParamPool,
  resolveParamPool,
  ROULETTE_STEP_TOGGLES,
  saveRouletteSettings,
  setOptionEnabled,
  setStepEnabled,
  upsertFetishOverride,
  upsertParamOption,
  type CustomFetishEntry,
  type EditableParamGroup,
  type ParamPoolOption,
  type RouletteCatalogOption,
  type RouletteOptionGroup,
  type RouletteSettings,
} from "../lib/rouletteSettings";
import { emptyWallet } from "../lib/wallet";
import type { ContentUnlockLists } from "../lib/contentUnlocks";

interface RouletteSettingsPanelProps {
  settings: RouletteSettings;
  onChange: (next: RouletteSettings) => void;
  unlocks?: ContentUnlockLists;
  onOpenChange?: (open: boolean) => void;
  /** Always expanded, no collapse toggle — for Settings page. */
  embedded?: boolean;
  /** Parent SettingsSection already shows the title. */
  hideEmbeddedTitle?: boolean;
}

const TIER_ORDER: FetishTier[] = ["light", "medium", "hard", "sadistic"];

const TIER_LABEL: Record<FetishTier, string> = {
  light: "Лёгкие",
  medium: "Средние",
  hard: "Тяжёлые",
  sadistic: "Садистские",
};

type SectionId =
  | "steps"
  | "mood"
  | "mode"
  | "duration"
  | "edges"
  | "ruins"
  | "finaleOdds"
  | "bpm"
  | "finish"
  | "cumplay"
  | "fetish"
  | "character"
  | "media_type"
  | "escalate"
  | "custom";

const SECTIONS: { id: SectionId; labelRu: string; hintRu: string }[] = [
  { id: "steps", labelRu: "Шаги", hintRu: "какие колёса крутятся" },
  { id: "mood", labelRu: "Настроение", hintRu: "тон сессии" },
  { id: "mode", labelRu: "Режим", hintRu: "stroke / CBT / oral…" },
  { id: "duration", labelRu: "Длительность", hintRu: "минуты сессии" },
  { id: "edges", labelRu: "Эджи", hintRu: "сколько эджей" },
  { id: "ruins", labelRu: "Руины", hintRu: "сколько руинов" },
  { id: "finaleOdds", labelRu: "Финал", hintRu: "шансы cum / ruin" },
  { id: "bpm", labelRu: "Темп", hintRu: "диапазон BPM" },
  { id: "finish", labelRu: "Куда", hintRu: "куда кончить" },
  { id: "cumplay", labelRu: "Cumplay", hintRu: "после финала" },
  { id: "fetish", labelRu: "Фетиши", hintRu: "теги сцены" },
  { id: "character", labelRu: "Архетип", hintRu: "кто на картинке" },
  { id: "media_type", labelRu: "Тип", hintRu: "фото / гиф / видео" },
  { id: "escalate", labelRu: "Эскалации", hintRu: "сектор «→ жёстче»" },
  { id: "custom", labelRu: "Свой", hintRu: "добавить фетиш" },
];

function CheckMark({ on }: { on: boolean }) {
  return (
    <span
      className={`roulette-set__mark ${on ? "is-on" : ""}`}
      aria-hidden
    >
      {on ? (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path
            d="M2.2 6.2L4.8 8.8L9.8 3.2"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
    </span>
  );
}

function ToggleChip({
  label,
  hint,
  on,
  onToggle,
  onEdit,
}: {
  label: string;
  hint?: string;
  on: boolean;
  onToggle: () => void;
  onEdit?: () => void;
}) {
  return (
    <div className={`roulette-set__chip-wrap ${on ? "is-on" : "is-off"}`}>
      <button
        type="button"
        className={`roulette-set__chip ${on ? "is-on" : "is-off"}`}
        onClick={onToggle}
        title={hint}
        aria-pressed={on}
      >
        <CheckMark on={on} />
        <span className="roulette-set__chip-text">
          <span className="roulette-set__chip-label">{label}</span>
          {hint ? <span className="roulette-set__chip-hint">{hint}</span> : null}
        </span>
      </button>
      {onEdit ? (
        <button
          type="button"
          className="roulette-set__chip-edit"
          onClick={onEdit}
          title="Изменить"
          aria-label={`Изменить ${label}`}
        >
          ✎
        </button>
      ) : null}
    </div>
  );
}

function ToggleRow({
  label,
  on,
  onToggle,
}: {
  label: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`roulette-set__row ${on ? "is-on" : "is-off"}`}
      onClick={onToggle}
      aria-pressed={on}
    >
      <CheckMark on={on} />
      <span>{label}</span>
    </button>
  );
}

function TierStepper({
  value,
  onChange,
}: {
  value: FetishTier;
  onChange: (next: FetishTier) => void;
}) {
  const idx = TIER_ORDER.indexOf(value);
  const canDown = idx > 0;
  const canUp = idx < TIER_ORDER.length - 1;

  return (
    <div className="roulette-set__stepper">
      <span className="roulette-set__stepper-value">{TIER_LABEL[value]}</span>
      <div className="roulette-set__stepper-btns">
        <button
          type="button"
          className="roulette-set__stepper-btn"
          aria-label="Уровень выше"
          disabled={!canUp}
          onClick={() => canUp && onChange(TIER_ORDER[idx + 1]!)}
        >
          ▲
        </button>
        <button
          type="button"
          className="roulette-set__stepper-btn"
          aria-label="Уровень ниже"
          disabled={!canDown}
          onClick={() => canDown && onChange(TIER_ORDER[idx - 1]!)}
        >
          ▼
        </button>
      </div>
    </div>
  );
}

function WeightStepper({
  value,
  onChange,
  min = 0.5,
  max = 8,
  step = 0.1,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  const round = (n: number) => Math.round(n * 10) / 10;
  return (
    <div className="roulette-set__stepper roulette-set__stepper--num">
      <span className="roulette-set__stepper-value">{value.toFixed(1)}</span>
      <div className="roulette-set__stepper-btns">
        <button
          type="button"
          className="roulette-set__stepper-btn"
          aria-label="Больше"
          disabled={value >= max}
          onClick={() => onChange(round(Math.min(max, value + step)))}
        >
          ▲
        </button>
        <button
          type="button"
          className="roulette-set__stepper-btn"
          aria-label="Меньше"
          disabled={value <= min}
          onClick={() => onChange(round(Math.max(min, value - step)))}
        >
          ▼
        </button>
      </div>
    </div>
  );
}

function OptionGrid({
  options,
  group,
  settings,
  patch,
  defaultOn,
  onEdit,
}: {
  options: RouletteCatalogOption[];
  group: RouletteOptionGroup;
  settings: RouletteSettings;
  patch: (next: RouletteSettings) => void;
  defaultOn?: (id: string) => boolean;
  onEdit?: (id: string) => void;
}) {
  return (
    <div className="roulette-set__chips">
      {options.map((opt) => {
        const enabled = isOptionEnabled(
          settings,
          group,
          opt.id,
          defaultOn?.(opt.id) ?? true,
        );
        return (
          <ToggleChip
            key={opt.id}
            label={opt.labelRu}
            hint={opt.hint}
            on={enabled}
            onToggle={() =>
              patch(setOptionEnabled(settings, group, opt.id, !enabled))
            }
            onEdit={onEdit ? () => onEdit(opt.id) : undefined}
          />
        );
      })}
    </div>
  );
}

export function RouletteSettingsPanel({
  settings,
  onChange,
  unlocks = {
    ...emptyWallet().unlocks,
    pendingShopTags: [],
  },
  onOpenChange,
  embedded = false,
  hideEmbeddedTitle = false,
}: RouletteSettingsPanelProps) {
  const [open, setOpen] = useState(embedded);
  const [section, setSection] = useState<SectionId>("fetish");
  const [customLabel, setCustomLabel] = useState("");
  const [customTags, setCustomTags] = useState("");
  const [customTier, setCustomTier] = useState<FetishTier>("light");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  /** Editing a discrete param slice (duration / edges / …) */
  const [paramEditId, setParamEditId] = useState<string | null>(null);
  const [paramDraft, setParamDraft] = useState<ParamPoolOption | null>(null);
  const [mistressId, setMistressId] = useState(() => getActiveMistress().id);
  const [paramSaveError, setParamSaveError] = useState<string | null>(null);

  useEffect(() => subscribeActiveMistress((p) => setMistressId(p.id)), []);

  const rouletteBias = useMemo(
    () => getActiveRouletteBias(),
    [mistressId],
  );

  const finishOpts = useMemo(() => finishCatalogOptions(), []);
  const cumplayOpts = useMemo(() => cumplayCatalogOptions(), []);
  const characterOpts = useMemo(() => characterCatalogOptions(), []);
  const mediaTypeOpts = useMemo(() => mediaTypeCatalogOptions(), []);
  const fetishOpts = useMemo(
    () => fetishCatalogOptions(settings),
    [settings],
  );

  const isParamSection = (
    EDITABLE_PARAM_GROUPS as string[]
  ).includes(section);
  const paramGroup = isParamSection
    ? (section as EditableParamGroup)
    : null;
  const paramOpts = useMemo(
    () => (paramGroup ? paramCatalogOptions(paramGroup, settings) : []),
    [paramGroup, settings, mistressId],
  );

  function patch(next: RouletteSettings) {
    onChange(next);
    saveRouletteSettings(next);
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 900);
  }

  function setAllInGroup(
    group: RouletteOptionGroup,
    options: RouletteCatalogOption[],
    on: boolean,
  ) {
    let next = settings;
    for (const opt of options) {
      next = setOptionEnabled(next, group, opt.id, on);
    }
    patch(next);
  }

  function clearParamEditor() {
    setParamEditId(null);
    setParamDraft(null);
  }

  function beginParamEdit(group: EditableParamGroup, id: string) {
    const opt = resolveParamPool(group, settings).find((o) => o.id === id);
    if (!opt) return;
    setParamEditId(id);
    setParamDraft({ ...opt });
  }

  function beginParamAdd(group: EditableParamGroup) {
    const bias = getActiveRouletteBias();
    const blank: ParamPoolOption = {
      id: newParamOptionId(group),
      labelRu: "",
      weight: 1,
    };
    switch (group) {
      case "duration": {
        const sec = Math.max(600, bias.minDurationSec ?? 600);
        blank.sec = sec;
        blank.labelRu = `${Math.round(sec / 60)} мин`;
        blank.id = String(sec);
        break;
      }
      case "edges": {
        const lo = Math.max(2, bias.minEdges ?? 2);
        const hi = Math.max(lo, lo + 2);
        blank.nMin = lo;
        blank.nMax = hi;
        blank.n = lo;
        blank.labelRu = `${lo}–${hi} эджей`;
        blank.id = `e_${lo}_${hi}`;
        break;
      }
      case "ruins": {
        const lo = Math.max(0, bias.minRuins ?? 0);
        const hi = Math.max(lo, lo + 1);
        blank.nMin = lo;
        blank.nMax = hi;
        blank.n = lo;
        blank.labelRu =
          lo === 0 && hi === 0 ? "Без руинов" : `${lo}–${hi} руинов`;
        blank.id = `r_${lo}_${hi}`;
        break;
      }
      case "bpm":
        blank.bpmMin = 60;
        blank.bpmMax = 120;
        blank.labelRu = "Средне 60–120";
        break;
      case "finaleOdds": {
        const maxCum = bias.maxPCum ?? 0.5;
        const minRuin = bias.minPRuin ?? 0.25;
        blank.pCum = Math.min(0.5, maxCum);
        blank.pRuin = Math.min(1 - blank.pCum, Math.max(0.25, minRuin));
        blank.labelRu = "Баланс";
        break;
      }
      case "mood":
      case "mode":
        // Adding arbitrary mood/mode breaks runtime — edit existing only
        return;
      default: {
        const _exhaustive: never = group;
        return _exhaustive;
      }
    }
    setParamSaveError(null);
    setParamEditId("__new__");
    setParamDraft(blank);
  }

  function saveParamEditor(group: EditableParamGroup) {
    if (!paramDraft) return;
    let draft = { ...paramDraft };
    const labelRu = draft.labelRu.trim();
    if (!labelRu) return;
    const bias = getActiveRouletteBias();

    if (group === "duration") {
      const sec = Math.max(60, Math.round(Number(draft.sec) || 600));
      if (bias.minDurationSec != null && sec < bias.minDurationSec) {
        setParamSaveError(
          `Для этой Госпожи минимум ${Math.round(bias.minDurationSec / 60)} мин.`,
        );
        return;
      }
      draft = {
        ...draft,
        sec,
        id: String(sec),
        labelRu: labelRu || `${Math.round(sec / 60)} мин`,
      };
    } else if (group === "edges" || group === "ruins") {
      let lo = Math.max(
        0,
        Math.round(Number(draft.nMin ?? draft.n) || 0),
      );
      let hi = Math.max(
        lo,
        Math.round(Number(draft.nMax ?? draft.nMin ?? draft.n) || lo),
      );
      if (group === "edges" && bias.minEdges != null && hi < bias.minEdges) {
        setParamSaveError(`Минимум эджей для этой Госпожи: ${bias.minEdges}.`);
        return;
      }
      if (group === "ruins" && bias.minRuins != null && hi < bias.minRuins) {
        setParamSaveError(`Минимум руинов для этой Госпожи: ${bias.minRuins}.`);
        return;
      }
      if (lo > hi) {
        const t = lo;
        lo = hi;
        hi = t;
      }
      draft = {
        ...draft,
        nMin: lo,
        nMax: hi,
        n: lo === hi ? lo : undefined,
        id: `${group === "edges" ? "e" : "r"}_${lo}_${hi}`,
        labelRu:
          labelRu ||
          (group === "edges"
            ? lo === hi
              ? `${lo} эджей`
              : `${lo}–${hi} эджей`
            : lo === 0 && hi === 0
              ? "Без руинов"
              : lo === hi
                ? `${lo} руин`
                : `${lo}–${hi} руинов`),
      };
    } else if (group === "bpm") {
      const bpmMin = Math.max(20, Math.round(Number(draft.bpmMin) || 50));
      const bpmMax = Math.max(
        bpmMin,
        Math.round(Number(draft.bpmMax) || bpmMin + 20),
      );
      draft = {
        ...draft,
        bpmMin,
        bpmMax,
        id: draft.id || newParamOptionId("bpm"),
        labelRu: labelRu || `${bpmMin}–${bpmMax}`,
      };
    } else if (group === "finaleOdds") {
      let pCum = Math.min(1, Math.max(0, Number(draft.pCum) || 0.5));
      let pRuin = Math.min(1, Math.max(0, Number(draft.pRuin) || 0.25));
      if (bias.maxPCum != null && pCum > bias.maxPCum + 1e-9) {
        setParamSaveError(
          `Макс. шанс cum для этой Госпожи: ${Math.round(bias.maxPCum * 100)}%.`,
        );
        return;
      }
      if (bias.minPRuin != null) pRuin = Math.max(pRuin, bias.minPRuin);
      pRuin = Math.min(pRuin, 1 - pCum);
      draft = {
        ...draft,
        pCum,
        pRuin,
        id: draft.id || newParamOptionId("finale"),
        labelRu,
      };
    } else {
      // mood / mode — keep id, only label/weight
      draft = { ...draft, labelRu };
    }

    setParamSaveError(null);
    // If replacing id (duration/edges), remove old id when editing
    let next = settings;
    if (
      paramEditId &&
      paramEditId !== "__new__" &&
      paramEditId !== draft.id &&
      (group === "duration" || group === "edges" || group === "ruins")
    ) {
      next = removeParamOption(next, group, paramEditId);
    }
    patch(upsertParamOption(next, group, draft));
    clearParamEditor();
  }

  function deleteParamOption(group: EditableParamGroup, id: string) {
    patch(removeParamOption(settings, group, id));
    if (paramEditId === id) clearParamEditor();
  }

  function clearEditor() {
    setEditingId(null);
    setCustomLabel("");
    setCustomTags("");
    setCustomTier("light");
  }

  function beginEdit(id: string) {
    const entry = findFetishEntry(settings, id);
    if (!entry) return;
    setEditingId(id);
    setCustomLabel(entry.labelRu);
    setCustomTags(entry.tags);
    setCustomTier(entry.tier);
    setSection("custom");
  }

  function saveFetishEditor() {
    const labelRu = customLabel.trim();
    const tags = customTags.trim();
    if (!labelRu || !tags) return;

    if (!editingId) {
      const entry: CustomFetishEntry = {
        id: newCustomFetishId(),
        tier: customTier,
        labelRu,
        tags,
        enabled: true,
      };
      patch({
        ...settings,
        customFetishes: [...settings.customFetishes, entry],
      });
      clearEditor();
      return;
    }

    const existingCustom = settings.customFetishes.find(
      (c) => c.id === editingId,
    );
    if (existingCustom) {
      patch({
        ...settings,
        customFetishes: settings.customFetishes.map((c) =>
          c.id === editingId
            ? { ...c, labelRu, tags, tier: customTier, enabled: true }
            : c,
        ),
      });
    } else {
      patch(
        upsertFetishOverride(settings, editingId, {
          labelRu,
          tags,
          tier: customTier,
        }),
      );
    }
    clearEditor();
  }

  function removeCustom(id: string) {
    patch({
      ...settings,
      customFetishes: settings.customFetishes.filter((c) => c.id !== id),
    });
    if (editingId === id) clearEditor();
  }

  function resetEditedBuiltin(id: string) {
    patch(clearFetishOverride(settings, id));
    if (editingId === id) clearEditor();
  }

  function resetAll() {
    patch({
      ...DEFAULT_ROULETTE_SETTINGS,
      customFetishes: [],
      fetishOverrides: {},
      paramPools: {},
    });
    clearEditor();
  }

  const showPanel = embedded || open;

  return (
    <div
      className={`roulette-set ${showPanel ? "is-open" : ""}${embedded ? " roulette-set--embedded" : ""}`}
    >
      {embedded ? null : (
        <div className="roulette-set__bar">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              setOpen((v) => {
                const next = !v;
                onOpenChange?.(next);
                return next;
              });
            }}
            aria-expanded={open}
          >
            {open ? "Скрыть настройки рулетки" : "Настройки рулетки"}
          </button>
          {savedFlash ? (
            <span className="roulette-set__saved" aria-live="polite">
              Сохранено
            </span>
          ) : null}
        </div>
      )}

      {showPanel ? (
        <div className="roulette-set__panel">
          {embedded || hideEmbeddedTitle ? null : (
            <p className="roulette-set__lead">
              Включи/выключи сектора колёс, эскалации и свои теги. Сохраняется
              локально и сразу влияет на «Пусть Госпожа решает».
            </p>
          )}

          <div
            className={
              embedded ? "brain-seg brain-seg--wrap" : "roulette-set__tabs"
            }
            role="tablist"
            aria-label="Колесо рулетки"
          >
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={section === s.id}
                title={s.hintRu}
                className={
                  embedded
                    ? "brain-seg__btn" + (section === s.id ? " is-on" : "")
                    : `roulette-set__tab ${section === s.id ? "is-active" : ""}`
                }
                onClick={() => setSection(s.id)}
              >
                {s.labelRu}
              </button>
            ))}
          </div>

          {embedded ? (
            <h3 className="brain-panel__h">
              {SECTIONS.find((s) => s.id === section)?.labelRu ?? section}
              {savedFlash ? (
                <span className="brain-dot brain-dot--ok" aria-live="polite">
                  {" "}
                  · сохранено
                </span>
              ) : null}
            </h3>
          ) : null}

          <div className="roulette-set__body">
            {rouletteBias.summaryRu ? (
              <p className="roulette-set__mistress-bias" role="note">
                {getActiveMistress().displayNameRu}: {rouletteBias.summaryRu}
              </p>
            ) : null}
            {section === "steps" ? (
              <>
                <p className="roulette-set__hint">
                  Выключенный шаг полностью пропускается в последовательности.
                </p>
                <div className="roulette-set__chips">
                  {ROULETTE_STEP_TOGGLES.map((s) => {
                    const on = isStepEnabled(settings, s.id);
                    return (
                      <ToggleChip
                        key={s.id}
                        label={s.labelRu}
                        on={on}
                        onToggle={() =>
                          patch(setStepEnabled(settings, s.id, !on))
                        }
                      />
                    );
                  })}
                </div>
              </>
            ) : null}

            {paramGroup ? (
              <>
                <p className="roulette-set__hint">
                  Галочка — вкл/выкл сектор. ✎ — изменить значение (минуты,
                  число эджей и т.д.).
                </p>
                <div className="roulette-set__row-actions">
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() =>
                      setAllInGroup(paramGroup, paramOpts, true)
                    }
                  >
                    Все вкл
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() =>
                      setAllInGroup(paramGroup, paramOpts, false)
                    }
                  >
                    Все выкл
                  </button>
                  {paramGroup !== "mood" && paramGroup !== "mode" ? (
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => beginParamAdd(paramGroup)}
                    >
                      + Добавить
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => {
                      patch(resetParamPool(settings, paramGroup));
                      clearParamEditor();
                    }}
                  >
                    Сброс пула
                  </button>
                </div>
                <OptionGrid
                  options={paramOpts}
                  group={paramGroup}
                  settings={settings}
                  patch={patch}
                  onEdit={(id) => beginParamEdit(paramGroup, id)}
                />

                {paramDraft && paramEditId ? (
                  <div className="roulette-set__param-edit">
                    <h3>
                      {paramEditId === "__new__"
                        ? "Новый пункт"
                        : `Изменить · ${paramEditId}`}
                    </h3>
                    <label className="roulette-set__field">
                      Подпись на колесе
                      <input
                        value={paramDraft.labelRu}
                        onChange={(e) =>
                          setParamDraft({
                            ...paramDraft,
                            labelRu: e.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="roulette-set__field">
                      Вес (шанс)
                      <input
                        type="number"
                        min={0.1}
                        max={8}
                        step={0.1}
                        value={paramDraft.weight ?? 1}
                        onChange={(e) =>
                          setParamDraft({
                            ...paramDraft,
                            weight: Number(e.target.value) || 1,
                          })
                        }
                      />
                    </label>

                    {paramGroup === "duration" ? (
                      <label className="roulette-set__field">
                        Минуты
                        <input
                          type="number"
                          min={1}
                          max={180}
                          step={1}
                          value={Math.round((paramDraft.sec ?? 600) / 60)}
                          onChange={(e) => {
                            const min = Math.max(
                              1,
                              Math.round(Number(e.target.value) || 1),
                            );
                            const sec = min * 60;
                            setParamDraft({
                              ...paramDraft,
                              sec,
                              id: String(sec),
                              labelRu: paramDraft.labelRu || `${min} мин`,
                            });
                          }}
                        />
                      </label>
                    ) : null}

                    {paramGroup === "edges" || paramGroup === "ruins" ? (
                      <>
                        <label className="roulette-set__field">
                          От
                          <input
                            type="number"
                            min={0}
                            max={30}
                            step={1}
                            value={paramDraft.nMin ?? paramDraft.n ?? 0}
                            onChange={(e) => {
                              const nMin = Math.max(
                                0,
                                Math.round(Number(e.target.value) || 0),
                              );
                              const nMax = Math.max(
                                nMin,
                                paramDraft.nMax ?? paramDraft.n ?? nMin,
                              );
                              setParamDraft({
                                ...paramDraft,
                                nMin,
                                nMax,
                                n: nMin === nMax ? nMin : undefined,
                              });
                            }}
                          />
                        </label>
                        <label className="roulette-set__field">
                          До
                          <input
                            type="number"
                            min={0}
                            max={30}
                            step={1}
                            value={
                              paramDraft.nMax ??
                              paramDraft.nMin ??
                              paramDraft.n ??
                              0
                            }
                            onChange={(e) => {
                              const nMax = Math.max(
                                0,
                                Math.round(Number(e.target.value) || 0),
                              );
                              const nMin = Math.min(
                                nMax,
                                paramDraft.nMin ?? paramDraft.n ?? 0,
                              );
                              setParamDraft({
                                ...paramDraft,
                                nMin,
                                nMax: Math.max(nMin, nMax),
                                n: nMin === nMax ? nMin : undefined,
                              });
                            }}
                          />
                        </label>
                      </>
                    ) : null}

                    {paramGroup === "bpm" ? (
                      <>
                        <label className="roulette-set__field">
                          BPM min
                          <input
                            type="number"
                            min={20}
                            max={200}
                            value={paramDraft.bpmMin ?? 60}
                            onChange={(e) =>
                              setParamDraft({
                                ...paramDraft,
                                bpmMin: Number(e.target.value) || 60,
                              })
                            }
                          />
                        </label>
                        <label className="roulette-set__field">
                          BPM max
                          <input
                            type="number"
                            min={20}
                            max={220}
                            value={paramDraft.bpmMax ?? 120}
                            onChange={(e) =>
                              setParamDraft({
                                ...paramDraft,
                                bpmMax: Number(e.target.value) || 120,
                              })
                            }
                          />
                        </label>
                      </>
                    ) : null}

                    {paramGroup === "finaleOdds" ? (
                      <>
                        <label className="roulette-set__field">
                          pCum (0–1)
                          <input
                            type="number"
                            min={0}
                            max={1}
                            step={0.01}
                            value={paramDraft.pCum ?? 0.5}
                            onChange={(e) =>
                              setParamDraft({
                                ...paramDraft,
                                pCum: Number(e.target.value),
                              })
                            }
                          />
                        </label>
                        <label className="roulette-set__field">
                          pRuin (0–1)
                          <input
                            type="number"
                            min={0}
                            max={1}
                            step={0.01}
                            value={paramDraft.pRuin ?? 0.25}
                            onChange={(e) =>
                              setParamDraft({
                                ...paramDraft,
                                pRuin: Number(e.target.value),
                              })
                            }
                          />
                        </label>
                      </>
                    ) : null}

                    {(paramGroup === "mood" || paramGroup === "mode") && (
                      <p className="roulette-set__hint">
                        Id зафиксирован ({paramDraft.id}) — меняй только
                        подпись и вес.
                      </p>
                    )}

                    {paramSaveError ? (
                      <p className="roulette-set__param-error" role="alert">
                        {paramSaveError}
                      </p>
                    ) : null}

                    <div className="roulette-set__row-actions">
                      <button
                        type="button"
                        className="btn-primary"
                        disabled={!paramDraft.labelRu.trim()}
                        onClick={() => saveParamEditor(paramGroup)}
                      >
                        Сохранить пункт
                      </button>
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={clearParamEditor}
                      >
                        Отмена
                      </button>
                      {paramEditId &&
                      paramEditId !== "__new__" &&
                      paramGroup !== "mood" &&
                      paramGroup !== "mode" ? (
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() =>
                            deleteParamOption(paramGroup, paramEditId)
                          }
                        >
                          Удалить
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}

            {section === "finish" ? (
              <>
                <div className="roulette-set__row-actions">
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => setAllInGroup("finish", finishOpts, true)}
                  >
                    Все вкл
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => setAllInGroup("finish", finishOpts, false)}
                  >
                    Все выкл
                  </button>
                </div>
                <OptionGrid
                  options={finishOpts}
                  group="finish"
                  settings={settings}
                  patch={patch}
                  defaultOn={(id) =>
                    finishOpts.find((f) => f.id === id)?.hint == null
                  }
                />
              </>
            ) : null}

            {section === "cumplay" ? (
              <>
                <div className="roulette-set__row-actions">
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => setAllInGroup("cumplay", cumplayOpts, true)}
                  >
                    Все вкл
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => setAllInGroup("cumplay", cumplayOpts, false)}
                  >
                    Все выкл
                  </button>
                </div>
                <OptionGrid
                  options={cumplayOpts}
                  group="cumplay"
                  settings={settings}
                  patch={patch}
                  defaultOn={(id) =>
                    cumplayOpts.find((c) => c.id === id)?.hint == null
                  }
                />
              </>
            ) : null}

            {section === "fetish" ? (
              <>
                <p className="roulette-set__hint">
                  Только фетиш-теги (lingerie, fellatio…). Без 1girl / trap —
                  «кто на экране» и тип медиа крутятся отдельно. ✎ — правка.
                </p>
                <div className="roulette-set__row-actions">
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => setAllInGroup("fetish", fetishOpts, true)}
                  >
                    Все вкл
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => setAllInGroup("fetish", fetishOpts, false)}
                  >
                    Все выкл
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => {
                      clearEditor();
                      setSection("custom");
                    }}
                  >
                    + Новый
                  </button>
                </div>
                {(
                  ["light", "medium", "hard", "sadistic"] as FetishTier[]
                ).map((tier) => {
                  const opts = fetishOpts.filter((o) => o.tier === tier);
                  if (opts.length === 0) return null;
                  return (
                    <div key={tier} className="roulette-set__tier">
                      <h3>{TIER_LABEL[tier]}</h3>
                      <OptionGrid
                        options={opts}
                        group="fetish"
                        settings={settings}
                        patch={patch}
                        onEdit={beginEdit}
                      />
                    </div>
                  );
                })}
              </>
            ) : null}

            {section === "character" ? (
              <>
                <p className="roulette-set__hint">
                  Кто на картинке: девочка, трап, группа, футанари…
                </p>
                <div className="roulette-set__row-actions">
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() =>
                      setAllInGroup("character", characterOpts, true)
                    }
                  >
                    Все вкл
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() =>
                      setAllInGroup("character", characterOpts, false)
                    }
                  >
                    Все выкл
                  </button>
                </div>
                <OptionGrid
                  options={characterOpts}
                  group="character"
                  settings={settings}
                  patch={patch}
                />
              </>
            ) : null}

            {section === "media_type" ? (
              <>
                <p className="roulette-set__hint">
                  Формат выдачи: фото / гифки / видео. Клиент дополнительно
                  фильтрует по типу файла.
                </p>
                <div className="roulette-set__row-actions">
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() =>
                      setAllInGroup("media_type", mediaTypeOpts, true)
                    }
                  >
                    Все вкл
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() =>
                      setAllInGroup("media_type", mediaTypeOpts, false)
                    }
                  >
                    Все выкл
                  </button>
                </div>
                <OptionGrid
                  options={mediaTypeOpts}
                  group="media_type"
                  settings={settings}
                  patch={patch}
                />
              </>
            ) : null}

            {section === "escalate" ? (
              <div className="roulette-set__escalate">
                <ToggleRow
                  label="Эскалация → средние фетиши"
                  on={settings.fetishEscalate.allowMedium}
                  onToggle={() =>
                    patch({
                      ...settings,
                      fetishEscalate: {
                        ...settings.fetishEscalate,
                        allowMedium: !settings.fetishEscalate.allowMedium,
                      },
                    })
                  }
                />
                <ToggleRow
                  label="Эскалация → тяжёлые"
                  on={settings.fetishEscalate.allowHard}
                  onToggle={() =>
                    patch({
                      ...settings,
                      fetishEscalate: {
                        ...settings.fetishEscalate,
                        allowHard: !settings.fetishEscalate.allowHard,
                      },
                    })
                  }
                />
                <ToggleRow
                  label="Эскалация → садистские"
                  on={settings.fetishEscalate.allowSadistic}
                  onToggle={() =>
                    patch({
                      ...settings,
                      fetishEscalate: {
                        ...settings.fetishEscalate,
                        allowSadistic: !settings.fetishEscalate.allowSadistic,
                      },
                    })
                  }
                />
                <ToggleRow
                  label="Эскалация cumplay → тяжёлые"
                  on={settings.cumplayEscalate.allowHeavy}
                  onToggle={() =>
                    patch({
                      ...settings,
                      cumplayEscalate: {
                        ...settings.cumplayEscalate,
                        allowHeavy: !settings.cumplayEscalate.allowHeavy,
                      },
                    })
                  }
                />
                <div className="roulette-set__field">
                  <span>Вес сектора «→ …» (фетиши)</span>
                  <WeightStepper
                    value={settings.fetishEscalate.weight}
                    onChange={(weight) =>
                      patch({
                        ...settings,
                        fetishEscalate: {
                          ...settings.fetishEscalate,
                          weight,
                        },
                      })
                    }
                  />
                </div>
                <div className="roulette-set__field">
                  <span>Вес сектора «→ тяжёлые» (cumplay)</span>
                  <WeightStepper
                    value={settings.cumplayEscalate.weight}
                    onChange={(weight) =>
                      patch({
                        ...settings,
                        cumplayEscalate: {
                          ...settings.cumplayEscalate,
                          weight,
                        },
                      })
                    }
                  />
                </div>
              </div>
            ) : null}

            {section === "custom" ? (
              <div className="roulette-set__custom">
                <p className="roulette-set__hint">
                  {editingId
                    ? `Редактирование: ${editingId}`
                    : "Новый фетиш. Пиши только акт/вайб-теги — без 1girl (архетип крутится отдельно)."}
                </p>
                <label className="roulette-set__field">
                  Название
                  <input
                    value={customLabel}
                    onChange={(e) => setCustomLabel(e.target.value)}
                    placeholder="Напр. Covered eyes"
                  />
                </label>
                <label className="roulette-set__field">
                  Теги Gelbooru
                  <BooruTagInput
                    value={customTags}
                    onChange={setCustomTags}
                    placeholder="covered_eyes"
                    unlocks={unlocks}
                  />
                </label>
                <div className="roulette-set__field">
                  <span>Уровень</span>
                  <TierStepper value={customTier} onChange={setCustomTier} />
                </div>
                <div className="roulette-set__row-actions">
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={!customLabel.trim() || !customTags.trim()}
                    onClick={saveFetishEditor}
                  >
                    {editingId ? "Сохранить изменения" : "Добавить фетиш"}
                  </button>
                  {editingId ? (
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={clearEditor}
                    >
                      Отмена
                    </button>
                  ) : null}
                  {editingId &&
                  settings.fetishOverrides[editingId] &&
                  !settings.customFetishes.some((c) => c.id === editingId) ? (
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => resetEditedBuiltin(editingId)}
                    >
                      Вернуть стандарт
                    </button>
                  ) : null}
                </div>

                {settings.customFetishes.length > 0 ? (
                  <ul className="roulette-set__custom-list">
                    {settings.customFetishes.map((c) => (
                      <li key={c.id}>
                        <div>
                          <strong>
                            {c.labelRu}{" "}
                            <span className="roulette-set__tier-tag">
                              {TIER_LABEL[c.tier]}
                            </span>
                          </strong>
                          <code>{c.tags}</code>
                        </div>
                        <div className="roulette-set__row-actions">
                          <button
                            type="button"
                            className="btn-ghost"
                            onClick={() => beginEdit(c.id)}
                          >
                            Изменить
                          </button>
                          <button
                            type="button"
                            className="btn-ghost"
                            onClick={() => removeCustom(c.id)}
                          >
                            Удалить
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="roulette-set__hint">
                    Своих фетишей пока нет — добавь выше или жми ✎ на стандартном.
                  </p>
                )}
              </div>
            ) : null}
          </div>

          <div className="roulette-set__footer">
            <button
              type="button"
              className={embedded ? "brain-act" : "btn-ghost"}
              onClick={resetAll}
            >
              сброс к стандартным
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
