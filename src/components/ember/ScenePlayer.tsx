import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { emberAssetUrl } from "../../game/content/io";
import type {
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
};

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

function VnStage({
  pack,
  bgPath,
  actors,
  dimOthers,
  activeSpeaker,
  children,
}: {
  pack: EmberPack;
  bgPath: string | null;
  actors: SceneActor[];
  dimOthers?: boolean;
  activeSpeaker?: string;
  children: ReactNode;
}) {
  const sorted = useMemo(
    () => [...actors].sort((a, b) => (a.z ?? 0) - (b.z ?? 0)),
    [actors],
  );
  const bgSrc = bgPath ? emberAssetUrl(bgPath) : "";
  const [bgFailed, setBgFailed] = useState(false);

  useEffect(() => {
    setBgFailed(false);
  }, [bgSrc]);

  return (
    <div className="ember-vn">
      <div className="ember-vn__stage">
        {bgSrc && !bgFailed ? (
          <img
            className="ember-vn__bg"
            src={bgSrc}
            alt=""
            onError={() => setBgFailed(true)}
          />
        ) : (
          <div className="ember-vn__bg ember-vn__bg--empty" />
        )}
        <div className="ember-vn__actors">
          {sorted.map((actor) => {
            const path = actorPortraitUrl(pack, actor);
            const src = path ? emberAssetUrl(path, PORTRAIT_ASSET_REV) : "";
            const dim =
              dimOthers &&
              activeSpeaker &&
              actor.speaker !== activeSpeaker;
            return (
              <div
                key={actor.id}
                className={`ember-vn__actor ${dim ? "is-dim" : ""}`}
                style={actorStyle(actor)}
              >
                {src ? (
                  <img src={src} alt="" draggable={false} />
                ) : (
                  <div className="ember-vn__actor-empty">?</div>
                )}
              </div>
            );
          })}
        </div>
        {children}
      </div>
    </div>
  );
}

export function ScenePlayer({
  pack,
  sceneId,
  onGrantCinders,
  onClose,
}: Props) {
  const scene = pack.scenes[sceneId];
  const steps = useMemo(() => {
    if (!scene) return new Map<string, SceneStep>();
    return new Map(scene.steps.map((s) => [s.id, s]));
  }, [scene]);

  const [stepId, setStepId] = useState(scene?.startStepId ?? "");
  const step = steps.get(stepId);

  useEffect(() => {
    if (step?.type !== "set_flag") return;
    if (step.next) setStepId(step.next);
    else onClose();
  }, [step, onClose]);

  if (!scene || !step) {
    return (
      <div className="ember-vn ember-vn--empty">
        <p className="muted">Сцена не найдена</p>
        <button type="button" onClick={onClose}>
          Закрыть
        </button>
      </div>
    );
  }

  const go = (next?: string) => {
    if (!next) {
      onClose();
      return;
    }
    setStepId(next);
  };

  const bgArtId = resolveStepBgArtId(step, scene);
  const bgPath = bgArtId ? (pack.arts[bgArtId]?.path ?? null) : null;

  switch (step.type) {
    case "dialogue": {
      const actors = resolveDialogueActors(step);
      const name = step.nameRu?.trim() || step.speaker;
      return (
        <VnStage
          pack={pack}
          bgPath={bgPath}
          actors={actors}
          dimOthers
          activeSpeaker={step.speaker}
        >
          <div className="ember-vn__textbox">
            <div className="ember-vn__name">{name}</div>
            <p className="ember-vn__text">{step.textRu}</p>
            <button
              type="button"
              className="ember-vn__next"
              onClick={() => go(step.next)}
            >
              Дальше
            </button>
          </div>
        </VnStage>
      );
    }
    case "splash": {
      const art = pack.arts[step.artId];
      const src = art ? emberAssetUrl(art.path) : "";
      return (
        <div className="ember-vn">
          <div className="ember-vn__stage">
            {src ? (
              <img className="ember-vn__bg" src={src} alt="" />
            ) : (
              <div className="ember-vn__bg ember-vn__bg--empty">нет арта</div>
            )}
            <div className="ember-vn__textbox">
              {step.captionRu ? (
                <p className="ember-vn__text">{step.captionRu}</p>
              ) : (
                <p className="ember-vn__text muted">…</p>
              )}
              <button
                type="button"
                className="ember-vn__next"
                onClick={() => go(step.next)}
              >
                Дальше
              </button>
            </div>
          </div>
        </div>
      );
    }
    case "choice": {
      const actors = resolveChoiceActors(step, scene);
      return (
        <VnStage pack={pack} bgPath={bgPath} actors={actors}>
          <div className="ember-vn__textbox ember-vn__textbox--choice">
            <div className="ember-vn__name">Выбор</div>
            <p className="ember-vn__text">{step.promptRu}</p>
            <div className="ember-vn__choices">
              {step.options.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => go(opt.next)}
                >
                  {opt.labelRu}
                </button>
              ))}
            </div>
          </div>
        </VnStage>
      );
    }
    case "grant_cinders":
      return (
        <div className="ember-vn ember-vn--modal">
          <div className="ember-vn__modal-card">
            <p>+{step.amount} угольков</p>
            <button
              type="button"
              className="primary"
              onClick={() => {
                onGrantCinders(step.amount);
                go(step.next);
              }}
            >
              Забрать
            </button>
          </div>
        </div>
      );
    case "set_flag":
      return <div className="ember-vn ember-vn--empty muted">…</div>;
    case "end":
      return (
        <div className="ember-vn ember-vn--modal">
          <div className="ember-vn__modal-card">
            <p>Сцена завершена</p>
            <button type="button" className="primary" onClick={onClose}>
              Готово
            </button>
          </div>
        </div>
      );
    default: {
      const _n: never = step;
      void _n;
      return null;
    }
  }
}
