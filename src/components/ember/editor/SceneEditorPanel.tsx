import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  ACTOR_Y_MAX,
  ACTOR_Y_MIN,
  actorFloorY,
  defaultActorFromSpeaker,
  emberAssetUrl,
  findIncomingStageActors,
  PORTRAIT_ASSET_REV,
  resolveDialogueActors,
  syncDialogueSpeakerFields,
  writeEmberJson,
  type EmberPack,
  type EmberScene,
  type SceneActor,
  type SceneStep,
} from "../../../game";
import type {
  EmberArt,
  EmberEvent,
  EmberEventTrigger,
} from "../../../game/content/types";
import { ScenePlayer } from "../ScenePlayer";
import { EmberArtPicker } from "./EmberArtPicker";
import { SceneGraphCanvas } from "./sceneGraph/SceneGraphCanvas";
import {
  applyConnect,
  ensureEndStep,
  optionHandleId,
  placeNear,
  removeStepFromGraph,
  resolveEditorLayout,
  STEP_HANDLE_OUT,
  stepPreviewText,
  stepTypeLabel,
} from "./sceneGraph/sceneGraphModel";

type Props = {
  pack: EmberPack;
  scene: EmberScene;
  sceneId: string;
  onSelectScene: (id: string) => void;
  onCreateScene: () => void;
  onChange: (scene: EmberScene) => void;
  onArtsChange?: (arts: EmberArt[]) => void;
  onEventChange?: (event: EmberEvent) => void;
  onEnsureEvent?: () => void;
  onSaved: (msg: string) => void;
  onGrantCinders: (n: number) => void;
};

const TRIGGER_OPTIONS: Array<{ id: EmberEventTrigger; label: string }> = [
  { id: "on_stage_clear", label: "Клир стадии" },
  { id: "on_stage_fail", label: "Смерть / провал" },
  { id: "on_region_enter", label: "Точка на карте" },
  { id: "manual", label: "Вручную / playtest" },
];

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

function stepPreview(step: SceneStep, max = 42): string {
  return stepPreviewText(step, max);
}

function stepSelectLabel(step: SceneStep): string {
  const preview = stepPreview(step, 36);
  return `${stepTypeLabel(step.type)} · ${preview}`;
}

type ChoiceOption = Extract<SceneStep, { type: "choice" }>["options"][number];

export function SceneEditorPanel({
  pack,
  scene,
  sceneId,
  onSelectScene,
  onCreateScene,
  onChange,
  onArtsChange,
  onEventChange,
  onEnsureEvent,
  onSaved,
  onGrantCinders,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(
    scene.startStepId,
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [playtest, setPlaytest] = useState(false);
  const [showJson, setShowJson] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const linkedEvent = useMemo(
    () => Object.values(pack.events).find((e) => e.sceneId === scene.id) ?? null,
    [pack.events, scene.id],
  );

  const triggerRegions = useMemo(() => {
    const mapId = linkedEvent?.mapId;
    const map = mapId ? pack.maps[mapId] : Object.values(pack.maps)[0];
    if (!map) return [] as Array<{ id: string; label: string; mapId: string }>;
    const triggers = map.regions.filter((r) => r.kind === "trigger");
    const list = triggers.length > 0 ? triggers : map.regions;
    return list.map((r) => ({
      id: r.id,
      mapId: map.id,
      label: triggers.length > 0 ? r.id : `${r.id} (${r.kind})`,
    }));
  }, [linkedEvent?.mapId, pack.maps]);

  const patchEvent = (patch: Partial<EmberEvent>) => {
    if (!linkedEvent || !onEventChange) return;
    onEventChange({ ...linkedEvent, ...patch, sceneId: scene.id });
  };

  const editing = scene.steps.find((s) => s.id === editingId) ?? null;

  const commit = useCallback(
    (next: EmberScene) => {
      onChange(next);
      setErr(null);
    },
    [onChange],
  );

  useEffect(() => {
    if (!editingId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEditingId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editingId]);

  const stepsById = useMemo(() => {
    const m = new Map<string, SceneStep>();
    for (const s of scene.steps) m.set(s.id, s);
    return m;
  }, [scene.steps]);

  const updateStep = (id: string, patch: Partial<SceneStep>) => {
    const steps = scene.steps.map((s) => {
      if (s.id !== id) return s;
      return { ...s, ...patch } as SceneStep;
    });
    commit({ ...scene, steps });
  };

  const addStep = (type: SceneStep["type"]) => {
    let step: SceneStep;
    switch (type) {
      case "dialogue": {
        const speaker = Object.keys(pack.portraits)[0] ?? "hu_tao";
        const keys = Object.keys(pack.portraits[speaker]?.expressions ?? {});
        const portraitKey = keys[0] ?? "neutral";
        step = {
          id: uid("dlg"),
          type: "dialogue",
          speaker,
          portraitKey,
          portraitSide: "left",
          nameRu: speaker,
          textRu: "Новая реплика…",
          bgArtId: scene.defaultBgArtId,
          actors: [defaultActorFromSpeaker(speaker, portraitKey, "left")],
          next: "end",
        };
        break;
      }
      case "splash":
        step = {
          id: uid("cg"),
          type: "splash",
          artId: Object.keys(pack.arts)[0] ?? "hu_tao_clear_placeholder",
          captionRu: "",
          next: "end",
        };
        break;
      case "choice": {
        const prevVisual = [...scene.steps]
          .reverse()
          .find(
            (s) =>
              (s.type === "dialogue" || s.type === "choice") &&
              s.actors &&
              s.actors.length > 0,
          );
        const inheritedActors =
          prevVisual && "actors" in prevVisual && prevVisual.actors
            ? prevVisual.actors.map((a) => ({ ...a }))
            : undefined;
        step = {
          id: uid("choice"),
          type: "choice",
          promptRu: "Что выберешь?",
          bgArtId:
            (prevVisual &&
              "bgArtId" in prevVisual &&
              prevVisual.bgArtId) ||
            scene.defaultBgArtId,
          actors: inheritedActors,
          options: [
            { id: "a", labelRu: "Вариант A", next: "end" },
            { id: "b", labelRu: "Вариант B", next: "end" },
          ],
        };
        break;
      }
      case "grant_cinders":
        step = {
          id: uid("cinders"),
          type: "grant_cinders",
          amount: 5,
          next: "end",
        };
        break;
      case "set_flag":
        step = {
          id: uid("flag"),
          type: "set_flag",
          flag: "flag_name",
          value: true,
          next: "end",
        };
        break;
      case "end":
        return;
      default: {
        const _n: never = type;
        void _n;
        return;
      }
    }

    const anchorId = selectedId ?? scene.startStepId;
    const anchor = scene.steps.find((s) => s.id === anchorId);
    let steps = ensureEndStep([...scene.steps.filter((s) => s.type !== "end"), step]);

    // Auto-wire from selected linear step's free out → new step
    if (
      anchor &&
      anchor.type !== "end" &&
      anchor.type !== "choice" &&
      "next" in anchor
    ) {
      steps = applyConnect(steps, {
        source: anchor.id,
        sourceHandle: STEP_HANDLE_OUT,
        target: step.id,
        targetHandle: "in",
      });
      // Keep previous next on the new step if anchor had one
      if (anchor.next && anchor.next !== step.id) {
        steps = steps.map((s) =>
          s.id === step.id && s.type !== "end" && s.type !== "choice"
            ? ({ ...s, next: anchor.next } as SceneStep)
            : s,
        );
      }
    }

    const layout = placeNear(
      resolveEditorLayout(scene),
      step.id,
      anchorId,
    );
    commit({
      ...scene,
      steps,
      editorLayout: layout,
      startStepId: scene.startStepId || step.id,
    });
    setSelectedId(step.id);
    setEditingId(step.id);
  };

  const removeStep = (id: string) => {
    const next = removeStepFromGraph(scene, id);
    if (next === scene) return;
    commit(next);
    if (editingId === id) setEditingId(null);
    setSelectedId(next.startStepId);
  };

  const updateChoiceOptions = (
    choiceId: string,
    options: ChoiceOption[],
  ) => {
    updateStep(choiceId, { options });
  };

  /** Create a dialogue node and bind a choice option to it. */
  const createDialogueForOption = (choiceId: string, optionIndex: number) => {
    const choice = scene.steps.find((s) => s.id === choiceId);
    if (!choice || choice.type !== "choice") return;
    const opt = choice.options[optionIndex];
    if (!opt) return;

    const speaker = Object.keys(pack.portraits)[0] ?? "hu_tao";
    const keys = Object.keys(pack.portraits[speaker]?.expressions ?? {});
    const portraitKey = keys[0] ?? "neutral";
    const prevNext = opt.next && opt.next !== "end" ? opt.next : "end";
    const dlg: SceneStep = {
      id: uid("dlg"),
      type: "dialogue",
      speaker,
      portraitKey,
      portraitSide: "left",
      nameRu: speaker,
      textRu: `Ответ на «${opt.labelRu}»…`,
      bgArtId: scene.defaultBgArtId,
      actors: [defaultActorFromSpeaker(speaker, portraitKey, "left")],
      next: prevNext,
    };

    let steps = ensureEndStep([
      ...scene.steps.filter((s) => s.type !== "end"),
      dlg,
    ]);
    steps = applyConnect(steps, {
      source: choiceId,
      sourceHandle: optionHandleId(opt.id),
      target: dlg.id,
      targetHandle: "in",
    });

    const layout = placeNear(resolveEditorLayout(scene), dlg.id, choiceId);
    commit({ ...scene, steps, editorLayout: layout });
    setSelectedId(dlg.id);
    setEditingId(dlg.id);
  };

  const graphActions = useMemo(
    () => ({
      onEdit: (stepId: string) => {
        setSelectedId(stepId);
        setEditingId(stepId);
      },
      onDelete: (stepId: string) => removeStep(stepId),
      onSetStart: (stepId: string) =>
        commit({ ...scene, startStepId: stepId }),
    }),
    // removeStep/commit close over scene — refresh each scene change
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scene],
  );

  const saveAll = async () => {
    try {
      const repaired = {
        ...scene,
        steps: ensureEndStep(scene.steps),
        editorLayout: resolveEditorLayout(scene),
      };
      commit(repaired);
      const sceneRes = await writeEmberJson(
        `scenes/${scene.id}.json`,
        repaired,
      );
      if (!sceneRes.ok) {
        onSaved(`Сцена: ${"error" in sceneRes ? sceneRes.error : "?"}`);
        return;
      }
      if (linkedEvent && onEventChange) {
        const evRes = await writeEmberJson(
          `events/${linkedEvent.id}.json`,
          linkedEvent,
        );
        onSaved(
          evRes.ok
            ? `Сцена + ивент сохранены (${sceneRes.source})`
            : `Сцена ok, ивент: ${"error" in evRes ? evRes.error : "?"}`,
        );
        return;
      }
      onSaved(`Сцена сохранена (${sceneRes.source})`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "save error");
    }
  };

  const applyDefaultBgToAll = () => {
    if (!scene.defaultBgArtId) return;
    const steps = scene.steps.map((s) => {
      if (s.type === "dialogue" || s.type === "choice") {
        return { ...s, bgArtId: scene.defaultBgArtId };
      }
      if (s.type === "splash") {
        return { ...s, artId: scene.defaultBgArtId! };
      }
      return s;
    });
    commit({ ...scene, steps });
    onSaved(`Фон «${scene.defaultBgArtId}» применён ко всем шагам сцены`);
  };

  const triggerSummary = (() => {
    if (!linkedEvent) return "нет ивента";
    switch (linkedEvent.trigger) {
      case "on_stage_clear":
        return linkedEvent.stageId
          ? `клир · ${pack.stages[linkedEvent.stageId]?.nameRu ?? linkedEvent.stageId}`
          : "клир стадии";
      case "on_stage_fail":
        return linkedEvent.stageId
          ? `смерть · ${pack.stages[linkedEvent.stageId]?.nameRu ?? linkedEvent.stageId}`
          : "смерть / провал";
      case "on_region_enter":
        return linkedEvent.regionId
          ? `точка · ${linkedEvent.regionId}`
          : "точка на карте";
      case "manual":
        return "вручную";
      default: {
        const _e: never = linkedEvent.trigger;
        return _e;
      }
    }
  })();

  return (
    <div className="ember-scene-workspace">
      <header className="ember-scene-toolbar">
        <div className="ember-scene-toolbar__meta">
          <label className="ember-scene-toolbar__pick">
            <span className="muted">Сцена</span>
            <select
              value={sceneId}
              onChange={(e) => onSelectScene(e.target.value)}
            >
              {Object.values(pack.scenes).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nameRu}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="ember-add-btn"
            onClick={onCreateScene}
            title="Создать новую сцену"
          >
            + Сцена
          </button>
          <label className="ember-scene-toolbar__name">
            <span className="muted">Имя</span>
            <input
              value={scene.nameRu}
              onChange={(e) => commit({ ...scene, nameRu: e.target.value })}
            />
          </label>
        </div>

        <div className="ember-scene-toolbar__add">
          {(
            [
              ["dialogue", "+ Диалог"],
              ["splash", "+ Splash"],
              ["choice", "+ Выбор"],
              ["grant_cinders", "+ Угольки"],
            ] as const
          ).map(([type, label]) => (
            <button
              key={type}
              type="button"
              className="ember-add-btn"
              onClick={() => addStep(type)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="ember-scene-toolbar__actions">
          <button
            type="button"
            className={`ghost${showSettings ? " is-active" : ""}`}
            onClick={() => setShowSettings((v) => !v)}
            title={triggerSummary}
          >
            Настройки
          </button>
          <button type="button" onClick={() => setPlaytest(true)}>
            Playtest
          </button>
          <button type="button" className="primary" onClick={() => void saveAll()}>
            Сохранить
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => setShowJson((v) => !v)}
          >
            {showJson ? "Скрыть JSON" : "JSON"}
          </button>
        </div>
      </header>

      {showSettings ? (
        <section className="ember-scene-settings">
          <div className="ember-scene-settings__col">
            <h3 className="ember-ed-card__title">Фон по умолчанию</h3>
            <EmberArtPicker
              compact
              pack={pack}
              label="Фон сцены"
              value={scene.defaultBgArtId ?? ""}
              allowEmpty
              emptyLabel="— нет —"
              preferredKinds={["cg", "splash"]}
              onArtsChange={onArtsChange}
              onStatus={onSaved}
              onChange={(artId) =>
                commit({
                  ...scene,
                  defaultBgArtId: artId || undefined,
                })
              }
            />
            {scene.defaultBgArtId ? (
              <button
                type="button"
                className="ghost ember-chip--sm"
                onClick={applyDefaultBgToAll}
              >
                Применить ко всем шагам
              </button>
            ) : null}
          </div>

          <div className="ember-scene-settings__col">
            <h3 className="ember-ed-card__title">Когда запускать</h3>
            {linkedEvent && onEventChange ? (
              <div className="ember-scene-settings__trigger ember-ed-form">
                <label>
                  Условие
                  <select
                    value={linkedEvent.trigger}
                    onChange={(e) => {
                      const trigger = e.target.value as EmberEventTrigger;
                      const patch: Partial<EmberEvent> = { trigger };
                      if (trigger === "manual") {
                        patch.stageId = undefined;
                        patch.mapId = undefined;
                        patch.regionId = undefined;
                      } else if (
                        trigger === "on_stage_clear" ||
                        trigger === "on_stage_fail"
                      ) {
                        patch.mapId = undefined;
                        patch.regionId = undefined;
                        if (!linkedEvent.stageId) {
                          patch.stageId =
                            pack.meta.defaultStageId ||
                            Object.keys(pack.stages)[0];
                        }
                      } else if (trigger === "on_region_enter") {
                        patch.stageId = undefined;
                        const map =
                          pack.maps[linkedEvent.mapId ?? ""] ??
                          Object.values(pack.maps)[0];
                        patch.mapId = map?.id;
                        const region =
                          map?.regions.find((r) => r.kind === "trigger") ??
                          map?.regions[0];
                        patch.regionId = region?.id;
                      }
                      patchEvent(patch);
                    }}
                  >
                    {TRIGGER_OPTIONS.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>

                {linkedEvent.trigger === "on_stage_clear" ||
                linkedEvent.trigger === "on_stage_fail" ? (
                  <label>
                    Стадия
                    <select
                      value={linkedEvent.stageId ?? ""}
                      onChange={(e) =>
                        patchEvent({
                          stageId: e.target.value || undefined,
                        })
                      }
                    >
                      <option value="">— выбери —</option>
                      {Object.values(pack.stages).map((st) => (
                        <option key={st.id} value={st.id}>
                          {st.nameRu}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {linkedEvent.trigger === "on_region_enter" ? (
                  <>
                    <label>
                      Карта
                      <select
                        value={
                          linkedEvent.mapId ??
                          Object.keys(pack.maps)[0] ??
                          ""
                        }
                        onChange={(e) => {
                          const mapId = e.target.value || undefined;
                          const map = mapId ? pack.maps[mapId] : undefined;
                          const region =
                            map?.regions.find((r) => r.kind === "trigger") ??
                            map?.regions[0];
                          patchEvent({
                            mapId,
                            regionId: region?.id,
                          });
                        }}
                      >
                        {Object.values(pack.maps).map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.nameRu ?? m.id}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Точка (region · trigger)
                      <select
                        value={linkedEvent.regionId ?? ""}
                        onChange={(e) =>
                          patchEvent({
                            regionId: e.target.value || undefined,
                          })
                        }
                      >
                        <option value="">— выбери —</option>
                        {triggerRegions.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {triggerRegions.length === 0 ? (
                      <p className="muted ember-hint">
                        На карте нет region с kind «trigger». Добавь в редакторе
                        карт.
                      </p>
                    ) : null}
                  </>
                ) : null}

                <p className="muted ember-hint">
                  {triggerSummary} · ивент «{linkedEvent.id}»
                </p>
              </div>
            ) : (
              <div className="ember-scene-settings__trigger">
                <p className="muted ember-hint">
                  Нет ивента для этой сцены.
                </p>
                {onEnsureEvent ? (
                  <button
                    type="button"
                    className="ember-add-btn"
                    onClick={onEnsureEvent}
                  >
                    + Создать ивент
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </section>
      ) : null}

      <div className="ember-scene-graph-wrap">
        {err ? <p className="ember-error">{err}</p> : null}
        <SceneGraphCanvas
          scene={scene}
          onSceneChange={commit}
          actions={graphActions}
          selectedStepId={selectedId}
          onSelectStep={setSelectedId}
          defaultBgArtId={scene.defaultBgArtId}
        />
        <p className="muted ember-hint ember-scene-graph-hint">
          ЛКМ-жест — выделить несколько · Shift/Ctrl+клик · СКМ/ПКМ — панорама ·
          «Редактировать» — настройки шага
        </p>
      </div>

      {editing ? (
        <div className="ember-scene-edit-layer">
          <button
            type="button"
            className="ember-scene-edit-backdrop"
            aria-label="Закрыть"
            onClick={() => setEditingId(null)}
          />
          <aside
            className="ember-scene-edit-panel ember-ed-card ember-step-inspector"
            role="dialog"
            aria-modal="true"
            aria-label={stepTypeLabel(editing.type)}
          >
            <div className="ember-ed-card__head">
              <h3 className="ember-ed-card__title">
                {stepTypeLabel(editing.type)}
              </h3>
              <div className="ember-chip-row">
                {editing.type !== "end" ? (
                  <>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() =>
                        commit({ ...scene, startStepId: editing.id })
                      }
                    >
                      Сделать start
                    </button>
                    <button
                      type="button"
                      className="ghost ember-danger"
                      onClick={() => removeStep(editing.id)}
                    >
                      Удалить
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setEditingId(null)}
                  title="Закрыть"
                >
                  ×
                </button>
              </div>
            </div>

            {editing.type === "dialogue" ? (
              <DialogueInspector
                key={editing.id}
                pack={pack}
                scene={scene}
                step={editing}
                speakers={Object.keys(pack.portraits)}
                onArtsChange={onArtsChange}
                onStatus={onSaved}
                onChange={(patch) => updateStep(editing.id, patch)}
              />
            ) : null}

            {editing.type === "splash" ? (
              <div className="ember-ed-form">
                <EmberArtPicker
                  compact
                  pack={pack}
                  label="Splash / CG"
                  value={editing.artId}
                  preferredKinds={["splash", "cg"]}
                  onArtsChange={onArtsChange}
                  onStatus={onSaved}
                  onChange={(artId) =>
                    updateStep(editing.id, { artId: artId || editing.artId })
                  }
                />
                <label>
                  Подпись
                  <input
                    value={editing.captionRu ?? ""}
                    onChange={(e) =>
                      updateStep(editing.id, { captionRu: e.target.value })
                    }
                  />
                </label>
              </div>
            ) : null}

            {editing.type === "choice" ? (
              <ChoiceInspector
                pack={pack}
                scene={scene}
                choice={editing}
                steps={scene.steps}
                stepsById={stepsById}
                onArtsChange={onArtsChange}
                onStatus={onSaved}
                onPromptChange={(promptRu) =>
                  updateStep(editing.id, { promptRu })
                }
                onOptionsChange={(options) =>
                  updateChoiceOptions(editing.id, options)
                }
                onBgChange={(bgArtId) =>
                  updateStep(editing.id, {
                    bgArtId: bgArtId || undefined,
                  })
                }
                onActorsChange={(actors) =>
                  updateStep(editing.id, { actors })
                }
                onJump={(stepId) => {
                  setSelectedId(stepId);
                  setEditingId(stepId);
                }}
                onCreateDialogue={(oi) =>
                  createDialogueForOption(editing.id, oi)
                }
              />
            ) : null}

            {editing.type === "grant_cinders" ? (
              <label className="ember-inline-field ember-inline-field--stack">
                Количество угольков
                <input
                  type="number"
                  value={editing.amount}
                  onChange={(e) =>
                    updateStep(editing.id, {
                      amount: Number(e.target.value) || 0,
                    })
                  }
                />
              </label>
            ) : null}

            {editing.type === "set_flag" ? (
              <div className="ember-ed-form">
                <label>
                  Флаг
                  <input
                    value={editing.flag}
                    onChange={(e) =>
                      updateStep(editing.id, { flag: e.target.value })
                    }
                  />
                </label>
              </div>
            ) : null}

            {editing.type === "end" ? (
              <p className="muted">Финиш сцены. Playtest закрывается здесь.</p>
            ) : null}
          </aside>
        </div>
      ) : null}

      {showJson ? (
        <textarea
          className="ember-ed-json ember-scene-graph-json"
          readOnly
          value={JSON.stringify(scene, null, 2)}
        />
      ) : null}

      {playtest ? (
        <div className="ember-scene-host">
          <ScenePlayer
            pack={{ ...pack, scenes: { ...pack.scenes, [scene.id]: scene } }}
            sceneId={scene.id}
            onGrantCinders={onGrantCinders}
            onClose={() => setPlaytest(false)}
          />
        </div>
      ) : null}
    </div>
  );
}

function ChoiceInspector({
  pack,
  scene,
  choice,
  steps,
  stepsById,
  onArtsChange,
  onStatus,
  onPromptChange,
  onOptionsChange,
  onBgChange,
  onActorsChange,
  onJump,
  onCreateDialogue,
}: {
  pack: EmberPack;
  scene: EmberScene;
  choice: Extract<SceneStep, { type: "choice" }>;
  steps: SceneStep[];
  stepsById: Map<string, SceneStep>;
  onArtsChange?: (arts: EmberArt[]) => void;
  onStatus?: (msg: string) => void;
  onPromptChange: (promptRu: string) => void;
  onOptionsChange: (options: ChoiceOption[]) => void;
  onBgChange: (bgArtId: string) => void;
  onActorsChange: (actors: SceneActor[]) => void;
  onJump: (stepId: string) => void;
  onCreateDialogue: (optionIndex: number) => void;
}) {
  type ChoicePanel = "bg" | "prompt" | "option";
  const [panel, setPanel] = useState<ChoicePanel | null>(null);
  const [editOpt, setEditOpt] = useState(0);

  const incomingActors = findIncomingStageActors(scene, choice.id);
  const bgArt = choice.bgArtId ? pack.arts[choice.bgArtId] : null;
  const bgSrc = bgArt ? emberAssetUrl(bgArt.path) : "";
  const editing = choice.options[editOpt] ?? choice.options[0] ?? null;

  useEffect(() => {
    if (editOpt >= choice.options.length) {
      setEditOpt(Math.max(0, choice.options.length - 1));
    }
  }, [choice.options.length, editOpt]);

  useEffect(() => {
    if (!panel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPanel(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel]);

  const patchOpt = (index: number, patch: Partial<ChoiceOption>) => {
    onOptionsChange(
      choice.options.map((o, i) => (i === index ? { ...o, ...patch } : o)),
    );
  };

  const addOption = () => {
    const n = choice.options.length + 1;
    onOptionsChange([
      ...choice.options,
      {
        id: uid("opt"),
        labelRu: `Вариант ${n}`,
        next: "end",
      },
    ]);
    setEditOpt(choice.options.length);
    setPanel("option");
  };

  const removeOption = (index: number) => {
    if (choice.options.length <= 1) return;
    onOptionsChange(choice.options.filter((_, i) => i !== index));
    setEditOpt((prev) => {
      if (prev === index) return Math.max(0, index - 1);
      if (prev > index) return prev - 1;
      return prev;
    });
    setPanel(null);
  };

  const openOption = (index: number) => {
    setEditOpt(index);
    setPanel("option");
  };

  const panelTitle = (() => {
    if (!panel) return "";
    switch (panel) {
      case "bg":
        return "Фон выбора";
      case "prompt":
        return "Вопрос игроку";
      case "option":
        return `Вариант ${editOpt + 1}`;
      default: {
        const _exhaustive: never = panel;
        return _exhaustive;
      }
    }
  })();

  return (
    <div className="ember-choice-inspector">
      <div className="ember-choice-stage">
        {bgSrc ? (
          <img className="ember-choice-stage__bg" src={bgSrc} alt="" />
        ) : (
          <div className="ember-choice-stage__bg ember-choice-stage__bg--empty" />
        )}
        <div className="ember-choice-stage__ui">
          <button
            type="button"
            className="ember-choice-stage__prompt"
            onClick={() => setPanel("prompt")}
            title="Изменить вопрос"
          >
            <span className="ember-choice-stage__prompt-label">Вопрос</span>
            <span className="ember-choice-stage__prompt-text">
              {choice.promptRu.trim() || "Что ответишь?"}
            </span>
          </button>
          <div className="ember-choice-stage__options">
            {choice.options.map((opt, oi) => {
              const target = stepsById.get(opt.next);
              const missing = !target;
              return (
                <button
                  key={opt.id}
                  type="button"
                  className={`ember-choice-stage__opt${panel === "option" && editOpt === oi ? " is-active" : ""}${missing ? " is-invalid" : ""}`}
                  onClick={() => openOption(oi)}
                  title={
                    missing
                      ? `Шаг «${opt.next}» не найден`
                      : `→ ${stepTypeLabel(target.type)}: ${stepPreview(target, 48)}`
                  }
                >
                  <span className="ember-choice-stage__opt-n">{oi + 1}</span>
                  <span className="ember-choice-stage__opt-label">
                    {opt.labelRu.trim() || `Вариант ${oi + 1}`}
                  </span>
                  <span className="ember-choice-stage__opt-next muted">
                    {missing
                      ? "нет шага"
                      : `→ ${stepTypeLabel(target.type)}`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="ember-choice-toolbar">
        <button
          type="button"
          className={`ember-choice-toolbar__btn${panel === "bg" ? " is-active" : ""}`}
          onClick={() => setPanel((p) => (p === "bg" ? null : "bg"))}
        >
          Фон
        </button>
        <button
          type="button"
          className={`ember-choice-toolbar__btn${panel === "prompt" ? " is-active" : ""}`}
          onClick={() => setPanel((p) => (p === "prompt" ? null : "prompt"))}
        >
          Вопрос
        </button>
        <button
          type="button"
          className="ember-choice-toolbar__btn"
          disabled={!incomingActors?.length}
          title={
            incomingActors?.length
              ? "Скопировать позы аватаров с предыдущего диалога"
              : "Нет предыдущего диалога с аватарами"
          }
          onClick={() => {
            if (!incomingActors?.length) return;
            onActorsChange(incomingActors.map((a) => ({ ...a })));
            onStatus?.("Аватары выбора скопированы с предыдущего шага");
          }}
        >
          Аватары
        </button>
        <button
          type="button"
          className="ember-choice-toolbar__btn ember-choice-toolbar__btn--accent"
          onClick={addOption}
        >
          + Вариант
        </button>
      </div>

      <p className="muted ember-hint ember-choice-inspector__hint">
        Клик по варианту — настройки. Аватары на экране выбора берутся с
        предыдущего диалога.
      </p>

      {panel ? (
        <div className="ember-scene-dock__layer ember-choice-inspector__layer">
          <button
            type="button"
            className="ember-scene-dock__backdrop"
            aria-label="Закрыть"
            onClick={() => setPanel(null)}
          />
          <div
            className="ember-scene-dock__window"
            role="dialog"
            aria-modal="true"
            aria-label={panelTitle}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="ember-scene-dock__window-head">
              <strong>{panelTitle}</strong>
              <button
                type="button"
                className="ember-scene-dock__window-close"
                onClick={() => setPanel(null)}
                title="Закрыть"
              >
                ×
              </button>
            </div>
            <div className="ember-scene-dock__window-body ember-ed-form">
              {panel === "bg" ? (
                <EmberArtPicker
                  compact
                  pack={pack}
                  label="Фон выбора"
                  value={choice.bgArtId ?? ""}
                  allowEmpty
                  emptyLabel={
                    scene.defaultBgArtId
                      ? `Как у сцены (${scene.defaultBgArtId})`
                      : "— нет —"
                  }
                  preferredKinds={["cg", "splash"]}
                  onArtsChange={onArtsChange}
                  onStatus={onStatus}
                  onChange={onBgChange}
                />
              ) : null}

              {panel === "prompt" ? (
                <label>
                  Текст вопроса
                  <textarea
                    rows={3}
                    value={choice.promptRu}
                    onChange={(e) => onPromptChange(e.target.value)}
                    autoFocus
                  />
                </label>
              ) : null}

              {panel === "option" && editing ? (
                <>
                  <label>
                    Текст кнопки
                    <input
                      value={editing.labelRu}
                      onChange={(e) =>
                        patchOpt(editOpt, { labelRu: e.target.value })
                      }
                      autoFocus
                    />
                  </label>

                  <label>
                    Куда ведёт
                    <select
                      className={
                        stepsById.get(editing.next) ? "" : "is-invalid"
                      }
                      value={editing.next}
                      onChange={(e) =>
                        patchOpt(editOpt, { next: e.target.value })
                      }
                    >
                      {steps.map((s) => (
                        <option key={s.id} value={s.id}>
                          {stepSelectLabel(s)}
                        </option>
                      ))}
                    </select>
                  </label>

                  {(() => {
                    const target = stepsById.get(editing.next);
                    if (!target) {
                      return (
                        <p className="ember-error">
                          Шаг «{editing.next}» не найден
                        </p>
                      );
                    }
                    return (
                      <p className="muted ember-choice-inspector__target">
                        → {stepTypeLabel(target.type)}:{" "}
                        {stepPreview(target, 72)}
                      </p>
                    );
                  })()}

                  <div className="ember-choice-inspector__actions">
                    <button
                      type="button"
                      className="ghost"
                      disabled={!stepsById.has(editing.next)}
                      onClick={() => onJump(editing.next)}
                    >
                      Открыть шаг
                    </button>
                    <button
                      type="button"
                      className="ember-add-btn"
                      onClick={() => {
                        onCreateDialogue(editOpt);
                        setPanel(null);
                      }}
                    >
                      Создать диалог и привязать
                    </button>
                    <button
                      type="button"
                      className="ghost ember-danger"
                      disabled={choice.options.length <= 1}
                      onClick={() => removeOption(editOpt)}
                    >
                      Удалить вариант
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DialogueInspector({
  pack,
  step,
  scene,
  speakers,
  onArtsChange,
  onStatus,
  onChange,
}: {
  pack: EmberPack;
  step: Extract<SceneStep, { type: "dialogue" }>;
  scene: EmberScene;
  speakers: string[];
  onArtsChange?: (arts: EmberArt[]) => void;
  onStatus?: (msg: string) => void;
  onChange: (patch: Partial<Extract<SceneStep, { type: "dialogue" }>>) => void;
}) {
  const actors = resolveDialogueActors(step);
  const [selectedActorId, setSelectedActorId] = useState<string | null>(
    () => actors[0]?.id ?? null,
  );
  const [bgFailed, setBgFailed] = useState(false);
  const [hudOpen, setHudOpen] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    id: string;
    pointerId: number;
  } | null>(null);

  const selectedActor =
    actors.find((a) => a.id === selectedActorId) ?? null;

  const bgArtId = step.bgArtId || scene.defaultBgArtId || "";
  const bgPath = bgArtId ? pack.arts[bgArtId]?.path : null;
  const bgSrc = bgPath ? emberAssetUrl(bgPath) : "";
  const bgMissing = Boolean(bgArtId) && !bgPath;

  useEffect(() => {
    setBgFailed(false);
  }, [bgSrc]);

  useEffect(() => {
    if (selectedActorId && !actors.some((a) => a.id === selectedActorId)) {
      setSelectedActorId(actors[0]?.id ?? null);
      setHudOpen(false);
    }
  }, [actors, selectedActorId]);

  const commitActors = (nextActors: SceneActor[]) => {
    onChange(syncDialogueSpeakerFields(step, nextActors));
    if (
      selectedActorId &&
      !nextActors.some((a) => a.id === selectedActorId)
    ) {
      setSelectedActorId(nextActors[0]?.id ?? null);
      setHudOpen(false);
    }
  };

  const patchActor = (id: string, patch: Partial<SceneActor>) => {
    commitActors(
      actors.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    );
  };

  const selectActor = (actorId: string, openHud: boolean) => {
    setSelectedActorId(actorId);
    if (openHud) setHudOpen(true);
  };

  const onActorPointerDown = (
    e: ReactPointerEvent<HTMLDivElement>,
    actorId: string,
  ) => {
    if (e.button === 2) return;
    e.preventDefault();
    e.stopPropagation();
    selectActor(actorId, false);
    dragRef.current = { id: actorId, pointerId: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onActorContextMenu = (
    e: ReactMouseEvent<HTMLDivElement>,
    actorId: string,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    selectActor(actorId, true);
  };

  const onStagePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const stage = stageRef.current;
    if (!drag || !stage || drag.pointerId !== e.pointerId) return;
    const rect = stage.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const x = Math.max(
      5,
      Math.min(95, ((e.clientX - rect.left) / rect.width) * 100),
    );
    const actor = actors.find((a) => a.id === drag.id);
    if (actor?.lockY) {
      patchActor(drag.id, { x, y: actor.y });
      return;
    }
    const y = Math.max(
      ACTOR_Y_MIN,
      Math.min(ACTOR_Y_MAX, ((e.clientY - rect.top) / rect.height) * 100),
    );
    patchActor(drag.id, { x, y });
  };

  const onStagePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) {
      dragRef.current = null;
    }
  };

  const actorKeys = (speaker: string) =>
    Object.keys(pack.portraits[speaker]?.expressions ?? { neutral: {} });

  type DockSection = "bg" | "text" | "actors";
  const [dock, setDock] = useState<DockSection | null>(null);

  const dockTitle = (() => {
    if (!dock) return "";
    switch (dock) {
      case "bg":
        return "Фон";
      case "text":
        return "Текст";
      case "actors":
        return "Персонажи";
      default: {
        const _exhaustive: never = dock;
        return _exhaustive;
      }
    }
  })();

  const toggleDock = (section: DockSection) => {
    setDock((prev) => (prev === section ? null : section));
  };

  useEffect(() => {
    if (!dock) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDock(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dock]);

  return (
    <div className="ember-dialogue-inspector">
      <div className="ember-vn-editor">
        <div className="ember-vn ember-vn--editor">
          <div
            ref={stageRef}
            className="ember-vn__stage ember-vn-editor__stage"
            onPointerMove={onStagePointerMove}
            onPointerUp={onStagePointerUp}
            onPointerCancel={onStagePointerUp}
            onPointerDown={(e) => {
              const el = e.target as HTMLElement;
              if (
                el.closest(".ember-vn-editor__actor") ||
                el.closest(".ember-vn-editor__hud")
              ) {
                return;
              }
              setHudOpen(false);
              setSelectedActorId(null);
            }}
            onContextMenu={(e) => {
              const el = e.target as HTMLElement;
              if (!el.closest(".ember-vn-editor__actor")) e.preventDefault();
            }}
          >
            {bgSrc && !bgFailed && !bgMissing ? (
              <img
                className="ember-vn__bg"
                src={bgSrc}
                alt=""
                onError={() => setBgFailed(true)}
              />
            ) : (
              <div className="ember-vn__bg ember-vn__bg--empty">
                {bgMissing || bgFailed ? (
                  <span className="ember-vn-editor__bg-warn">
                    Фон не загрузился
                    {bgArtId ? ` («${bgArtId}»)` : ""}
                  </span>
                ) : null}
              </div>
            )}
            <div className="ember-vn__actors">
              {actors.map((actor) => {
                const path =
                  pack.portraits[actor.speaker]?.expressions[actor.portraitKey]
                    ?.path;
                const url = path ? emberAssetUrl(path, PORTRAIT_ASSET_REV) : "";
                const scale = actor.scale ?? 1;
                const rotate = actor.rotate ?? 0;
                const flip = actor.flipX ? -1 : 1;
                const active = actor.id === selectedActor?.id;
                return (
                  <div
                    key={actor.id}
                    role="button"
                    tabIndex={0}
                    className={`ember-vn__actor ember-vn-editor__actor${active ? " is-active" : ""}${active && hudOpen ? " is-hud" : ""}${actor.lockY ? " is-lock-y" : ""}`}
                    style={{
                      left: `${actor.x}%`,
                      top: `${actor.y}%`,
                      zIndex: (actor.z ?? 1) + (active ? 10 : 0),
                      transform: `translate(-50%, -100%) scale(${flip * scale}, ${scale}) rotate(${rotate}deg)`,
                      cursor: actor.lockY ? "ew-resize" : undefined,
                    }}
                    onPointerDown={(e) => onActorPointerDown(e, actor.id)}
                    onContextMenu={(e) => onActorContextMenu(e, actor.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        selectActor(actor.id, true);
                      }
                    }}
                    title={
                      actor.lockY
                        ? "ЛКМ — только горизонталь · ПКМ — настройки"
                        : "ЛКМ — тянуть · ПКМ — настройки"
                    }
                  >
                    {url ? (
                      <img src={url} alt="" draggable={false} />
                    ) : (
                      <span className="ember-vn__actor-empty">?</span>
                    )}
                  </div>
                );
              })}
            </div>

            {selectedActor && hudOpen ? (
              <div
                className="ember-vn-editor__hud"
                style={{
                  left: `${Math.min(88, Math.max(12, selectedActor.x))}%`,
                  top: `${Math.max(6, selectedActor.y - 38)}%`,
                }}
                onPointerDown={(e) => e.stopPropagation()}
                onContextMenu={(e) => e.preventDefault()}
              >
              <div className="ember-vn-editor__hud-head">
                <strong>{selectedActor.speaker}</strong>
                <button
                  type="button"
                  className="ember-vn-editor__hud-close"
                  onClick={() => setHudOpen(false)}
                  title="Закрыть"
                >
                  ×
                </button>
              </div>
              <label className="ember-vn-editor__hud-slider">
                Масштаб {((selectedActor.scale ?? 1) * 100).toFixed(0)}%
                <input
                  type="range"
                  min={0.5}
                  max={3.5}
                  step={0.05}
                  value={selectedActor.scale ?? 1}
                  onChange={(e) =>
                    patchActor(selectedActor.id, {
                      scale: Number(e.target.value),
                    })
                  }
                />
              </label>
              <label className="ember-vn-editor__hud-slider">
                Поворот {Math.round(selectedActor.rotate ?? 0)}°
                <input
                  type="range"
                  min={-30}
                  max={30}
                  step={1}
                  value={selectedActor.rotate ?? 0}
                  onChange={(e) =>
                    patchActor(selectedActor.id, {
                      rotate: Number(e.target.value),
                    })
                  }
                />
              </label>
              <label className="ember-vn-editor__hud-slider">
                Оффсет «К низу» {Math.round(actorFloorY(selectedActor))}
                {actorFloorY(selectedActor) > 100
                  ? ` · под экран +${Math.round(actorFloorY(selectedActor) - 100)}`
                  : ""}
                <input
                  type="range"
                  min={ACTOR_Y_MIN}
                  max={ACTOR_Y_MAX}
                  step={1}
                  value={actorFloorY(selectedActor)}
                  onChange={(e) => {
                    const floorY = Number(e.target.value);
                    patchActor(selectedActor.id, {
                      floorY,
                      y: floorY,
                      lockY: true,
                    });
                  }}
                />
              </label>
              <div className="ember-vn-editor__hud-actions">
                <button
                  type="button"
                  className={selectedActor.flipX ? "is-active" : ""}
                  onClick={() =>
                    patchActor(selectedActor.id, {
                      flipX: !selectedActor.flipX,
                    })
                  }
                >
                  Отразить
                </button>
                <button
                  type="button"
                  className={selectedActor.lockY ? "is-active" : ""}
                  title="Применить оффсет низа и двигать только по горизонтали"
                  onClick={() => {
                    const floorY = actorFloorY(selectedActor);
                    patchActor(selectedActor.id, {
                      floorY,
                      y: floorY,
                      lockY: true,
                    });
                  }}
                >
                  К низу
                </button>
                <button
                  type="button"
                  className={selectedActor.lockY ? "is-active" : ""}
                  title="Двигать только по горизонтали (Y зафиксирован)"
                  onClick={() =>
                    patchActor(selectedActor.id, {
                      lockY: !selectedActor.lockY,
                    })
                  }
                >
                  Только ↔
                </button>
                <button
                  type="button"
                  title="Свободное перемещение по X и Y"
                  onClick={() =>
                    patchActor(selectedActor.id, { lockY: false })
                  }
                >
                  Свободно
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const floorY = actorFloorY(selectedActor);
                    patchActor(selectedActor.id, {
                      x: 28,
                      y: selectedActor.lockY ? selectedActor.y : floorY,
                    });
                  }}
                >
                  Слева
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const floorY = actorFloorY(selectedActor);
                    patchActor(selectedActor.id, {
                      x: 72,
                      y: selectedActor.lockY ? selectedActor.y : floorY,
                    });
                  }}
                >
                  Справа
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const floorY = actorFloorY(selectedActor);
                    patchActor(selectedActor.id, {
                      x: 50,
                      y: selectedActor.lockY ? selectedActor.y : floorY,
                    });
                  }}
                >
                  Центр
                </button>
                <button
                  type="button"
                  onClick={() =>
                    patchActor(selectedActor.id, {
                      x: 50,
                      y: 55,
                      lockY: false,
                    })
                  }
                >
                  Вверх
                </button>
              </div>
            </div>
          ) : null}

            <div className="ember-vn__textbox ember-vn-editor__textbox">
              <div className="ember-vn__name">
                {step.nameRu?.trim() || step.speaker}
              </div>
              <p className="ember-vn__text">{step.textRu || "…"}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="ember-scene-dock">
        <div className="ember-scene-dock__tabs" role="tablist">
          {(
            [
              ["bg", "Фон"],
              ["text", "Текст"],
              ["actors", "Персонажи"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={dock === id}
              className={`ember-scene-dock__tab${dock === id ? " is-active" : ""}`}
              onClick={() => toggleDock(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {dock ? (
        <div className="ember-scene-dock__layer">
          <button
            type="button"
            className="ember-scene-dock__backdrop"
            aria-label="Закрыть"
            onClick={() => setDock(null)}
          />
          <div
            className="ember-scene-dock__window"
            role="dialog"
            aria-modal="true"
            aria-label={dockTitle}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="ember-scene-dock__window-head">
              <strong>{dockTitle}</strong>
              <button
                type="button"
                className="ember-scene-dock__window-close"
                onClick={() => setDock(null)}
                title="Закрыть"
              >
                ×
              </button>
            </div>
            <div className="ember-scene-dock__window-body ember-ed-form" key={dock}>
              {dock === "bg" ? (
                <EmberArtPicker
                  compact
                  pack={pack}
                  label="Фон диалога"
                  value={step.bgArtId ?? ""}
                  allowEmpty
                  emptyLabel={
                    scene.defaultBgArtId
                      ? `Как у сцены (${scene.defaultBgArtId})`
                      : "— нет —"
                  }
                  preferredKinds={["cg", "splash"]}
                  onArtsChange={onArtsChange}
                  onStatus={onStatus}
                  onChange={(artId) =>
                    onChange({ bgArtId: artId || undefined })
                  }
                />
              ) : null}

              {dock === "text" ? (
                <>
                  <label>
                    Имя в окне
                    <input
                      value={step.nameRu ?? ""}
                      placeholder={step.speaker}
                      onChange={(e) =>
                        onChange({ nameRu: e.target.value || undefined })
                      }
                    />
                  </label>
                  <label>
                    Текст реплики
                    <textarea
                      rows={5}
                      value={step.textRu}
                      onChange={(e) => onChange({ textRu: e.target.value })}
                    />
                  </label>
                </>
              ) : null}

              {dock === "actors" ? (
                <>
                  <div className="ember-vn-editor__actors-head">
                    <h4 className="ember-ed-card__title">На сцене</h4>
                    <button
                      type="button"
                      className="ember-chip ember-chip--sm"
                      onClick={() => {
                        const speaker = speakers[0] ?? "hu_tao";
                        const keys = actorKeys(speaker);
                        const next = [
                          ...actors,
                          defaultActorFromSpeaker(
                            speaker,
                            keys[0] ?? "neutral",
                            actors.length % 2 === 0 ? "right" : "left",
                            `a_${Math.random().toString(36).slice(2, 6)}`,
                          ),
                        ];
                        const id = next[next.length - 1]!.id;
                        commitActors(next);
                        selectActor(id, true);
                      }}
                    >
                      + аватар
                    </button>
                  </div>

                  <p className="muted ember-hint">
                    ПКМ по аватару на превью — настройки. ЛКМ — перетащить.
                  </p>

                  {selectedActor ? (
                    <div className="ember-vn-editor__actor-form">
                      <label>
                        Спикер / говорит
                        <select
                          value={selectedActor.speaker}
                          onChange={(e) => {
                            const speaker = e.target.value;
                            const keys = actorKeys(speaker);
                            const portraitKey = keys[0] ?? "neutral";
                            patchActor(selectedActor.id, {
                              speaker,
                              portraitKey,
                            });
                            onChange({
                              speaker,
                              portraitKey,
                              nameRu: step.nameRu ?? speaker,
                            });
                          }}
                        >
                          {(speakers.length ? speakers : ["hu_tao"]).map(
                            (id) => (
                              <option key={id} value={id}>
                                {id}
                              </option>
                            ),
                          )}
                        </select>
                      </label>

                      <fieldset className="ember-portrait-picker ember-portrait-picker--rail">
                        <legend>Выражение</legend>
                        <div className="ember-portrait-rail">
                          {actorKeys(selectedActor.speaker).map((key) => {
                            const p =
                              pack.portraits[selectedActor.speaker]
                                ?.expressions[key];
                            const url = p
                              ? emberAssetUrl(p.path, PORTRAIT_ASSET_REV)
                              : "";
                            return (
                              <button
                                key={key}
                                type="button"
                                className={`ember-portrait-card ${selectedActor.portraitKey === key ? "is-active" : ""}`}
                                onClick={() => {
                                  patchActor(selectedActor.id, {
                                    portraitKey: key,
                                  });
                                  if (selectedActor.speaker === step.speaker) {
                                    onChange({ portraitKey: key });
                                  }
                                }}
                              >
                                {url ? (
                                  <img src={url} alt="" />
                                ) : (
                                  <span>?</span>
                                )}
                                <span>{p?.labelRu ?? key}</span>
                              </button>
                            );
                          })}
                        </div>
                      </fieldset>

                      <button
                        type="button"
                        className="ember-chip ember-chip--sm"
                        onClick={() => {
                          selectActor(selectedActor.id, true);
                          setDock(null);
                        }}
                      >
                        Настройки на превью
                      </button>

                      {actors.length > 1 ? (
                        <button
                          type="button"
                          className="ghost ember-danger"
                          onClick={() =>
                            commitActors(
                              actors.filter((a) => a.id !== selectedActor.id),
                            )
                          }
                        >
                          Убрать аватар
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <p className="muted">
                      ПКМ по аватару на превью или добавь новый
                    </p>
                  )}
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
