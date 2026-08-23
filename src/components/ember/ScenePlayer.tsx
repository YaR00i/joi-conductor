import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { dialogueUseOf } from "../../game/content/emberScript";
import { emberAssetUrl } from "../../game/content/io";
import type {
  EmberDialogueUse,
  EmberPack,
  SceneActor,
  SceneStep,
} from "../../game/content/types";
import {
  actorPortraitUrl,
  PORTRAIT_ASSET_REV,
  resolveChoiceActors,
  resolveDialogueActors,
  resolveStepBgArtId,
} from "../../game/content/sceneStage";

type Props = {
  pack: EmberPack;
  sceneId: string;
  onGrantCinders: (amount: number) => void;
  onClose: () => void;
  /** play = overlay on the 3D world; stage = editor / after-clear host. */
  variant?: "play" | "stage";
};

const TYPE_MS = 22;
const AUTO_MS = 1600;

function actorStyle(actor: SceneActor): CSSProperties {
  const scale = actor.scale ?? 1;
  const rotate = actor.rotate ?? 0;
  const flip = actor.flipX ? -1 : 1;
  return {
    left: `${actor.x}%`,
    top: `${actor.y}%`,
    zIndex: actor.z ?? 1,
    transform: `translate(-50%, -100%) scale(${flip * scale}, ${scale}) rotate(${rotate}deg)`,
  };
}

function VnActors({
  pack,
  actors,
  dimOthers,
  activeSpeaker,
}: {
  pack: EmberPack;
  actors: SceneActor[];
  dimOthers?: boolean;
  activeSpeaker?: string;
}) {
  const sorted = useMemo(
    () => [...actors].sort((a, b) => (a.z ?? 0) - (b.z ?? 0)),
    [actors],
  );
  return (
    <div className="ember-vn__actors ember-dlg__actors">
      {sorted.map((actor) => {
        const path = actorPortraitUrl(pack, actor);
        const src = path ? emberAssetUrl(path, PORTRAIT_ASSET_REV) : "";
        if (!src) return null;
        const dim =
          dimOthers && activeSpeaker && actor.speaker !== activeSpeaker;
        return (
          <div
            key={actor.id}
            className={`ember-vn__actor ${dim ? "is-dim" : ""}`}
            style={actorStyle(actor)}
          >
            <img src={src} alt="" draggable={false} />
          </div>
        );
      })}
    </div>
  );
}

function lineText(step: SceneStep): string {
  switch (step.type) {
    case "dialogue":
      return step.textRu;
    case "splash":
      return step.captionRu?.trim() || "…";
    case "choice":
      return step.promptRu;
    case "grant_cinders":
      return `+${step.amount} угольков`;
    case "set_flag":
    case "end":
      return "";
    default: {
      const _never: never = step;
      return _never;
    }
  }
}

export function ScenePlayer({
  pack,
  sceneId,
  onGrantCinders,
  onClose,
  variant = "stage",
}: Props) {
  const scene = pack.scenes[sceneId];
  const use: EmberDialogueUse = dialogueUseOf(scene);
  const cinematic = use === "cutscene";
  const steps = useMemo(() => {
    if (!scene) return new Map<string, SceneStep>();
    return new Map(scene.steps.map((s) => [s.id, s]));
  }, [scene]);

  const [stepId, setStepId] = useState(scene?.startStepId ?? "");
  const [typed, setTyped] = useState(0);
  const [auto, setAuto] = useState(false);
  const [hidden, setHidden] = useState(false);
  const autoTimer = useRef(0);
  const step = steps.get(stepId);
  const fullText = step ? lineText(step) : "";
  const shown = fullText.slice(0, typed);
  const waiting = typed >= fullText.length;

  const go = useCallback(
    (next?: string) => {
      if (!next) {
        onClose();
        return;
      }
      setStepId(next);
    },
    [onClose],
  );

  useEffect(() => {
    setTyped(0);
  }, [stepId, fullText]);

  useEffect(() => {
    if (!step) return;
    if (step.type === "set_flag") {
      if (step.next) setStepId(step.next);
      else onClose();
      return;
    }
    if (step.type === "end") {
      onClose();
    }
  }, [step, onClose]);

  useEffect(() => {
    if (!step || hidden || waiting) return;
    if (step.type === "choice") {
      setTyped(fullText.length);
      return;
    }
    const id = window.setInterval(() => {
      setTyped((n) => Math.min(fullText.length, n + 1));
    }, TYPE_MS);
    return () => window.clearInterval(id);
  }, [step, hidden, waiting, fullText.length]);

  const advance = useCallback(() => {
    if (!step) {
      onClose();
      return;
    }
    if (hidden) {
      setHidden(false);
      return;
    }
    if (!waiting) {
      setTyped(fullText.length);
      return;
    }
    switch (step.type) {
      case "dialogue":
      case "splash":
        go(step.next);
        break;
      case "choice":
        break;
      case "grant_cinders":
        onGrantCinders(step.amount);
        go(step.next);
        break;
      case "set_flag":
        go(step.next);
        break;
      case "end":
        onClose();
        break;
      default: {
        const _never: never = step;
        void _never;
      }
    }
  }, [step, hidden, waiting, fullText.length, go, onClose, onGrantCinders]);

  const skipAll = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!auto || !waiting || !step || hidden) return;
    if (step.type === "choice") return;
    autoTimer.current = window.setTimeout(() => advance(), AUTO_MS);
    return () => window.clearTimeout(autoTimer.current);
  }, [auto, waiting, step, hidden, advance]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.code === "Space" || e.code === "KeyF" || e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        advance();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [advance, onClose]);

  if (!scene || !step) {
    return (
      <div className="ember-dlg ember-dlg--empty">
        <p>Сцена не найдена</p>
        <button type="button" className="ember-dlg__text-btn" onClick={onClose}>
          Закрыть
        </button>
      </div>
    );
  }

  const bgArtId = resolveStepBgArtId(step, scene);
  const bgPath = cinematic && bgArtId ? (pack.arts[bgArtId]?.path ?? null) : null;
  const bgSrc = bgPath ? emberAssetUrl(bgPath) : "";
  const actors =
    cinematic && step.type === "dialogue"
      ? resolveDialogueActors(step)
      : cinematic && step.type === "choice"
        ? resolveChoiceActors(step, scene)
        : [];
  const showActors = cinematic && actors.length > 0;
  const showCaret =
    waiting &&
    !hidden &&
    step.type !== "choice" &&
    step.type !== "end" &&
    step.type !== "set_flag";

  return (
    <div
      className={`ember-dlg ember-dlg--${use} ember-dlg--${variant}${hidden ? " is-hidden" : ""}`}
      role="dialog"
      aria-live="polite"
      onClick={() => advance()}
    >
      {bgSrc ? (
        <img className="ember-dlg__bg" src={bgSrc} alt="" />
      ) : variant === "stage" && cinematic ? (
        <div className="ember-dlg__bg ember-dlg__bg--empty" />
      ) : null}
      {showActors ? (
        <VnActors
          pack={pack}
          actors={actors}
          dimOthers={step.type === "dialogue"}
          activeSpeaker={step.type === "dialogue" ? step.speaker : undefined}
        />
      ) : null}
      <div className="ember-dlg__veil" />
      <div
        className="ember-dlg__chrome"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          title="Пропустить"
          onClick={skipAll}
        >
          <span aria-hidden>⏭</span>
          <span className="ember-dlg__chrome-label">Skip</span>
        </button>
        <button
          type="button"
          title="Авто"
          className={auto ? "is-on" : ""}
          onClick={() => setAuto((v) => !v)}
        >
          <span aria-hidden>{auto ? "⏸" : "▶"}</span>
          <span className="ember-dlg__chrome-label">Auto</span>
        </button>
        <button
          type="button"
          title="Скрыть интерфейс"
          onClick={() => setHidden(true)}
        >
          <span aria-hidden>👁</span>
          <span className="ember-dlg__chrome-label">Hide</span>
        </button>
      </div>
      {!hidden ? (
        <div className="ember-dlg__copy">
          <p className="ember-dlg__text">
            {shown}
            {!waiting ? <span className="ember-dlg__caret-inline">▍</span> : null}
          </p>
          {step.type === "choice" ? (
            <div className="ember-dlg__choices">
              {step.options.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    go(opt.next);
                  }}
                >
                  {opt.labelRu}
                </button>
              ))}
            </div>
          ) : null}
          {showCaret ? <span className="ember-dlg__caret" aria-hidden /> : null}
        </div>
      ) : (
        <p className="ember-dlg__hidden-hint">Клик / F — показать</p>
      )}
    </div>
  );
}
