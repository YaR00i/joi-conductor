/**
 * Joint angle keyframe strip for voxel scene animations (editor only).
 */
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { EmberVoxelAnimClip, EmberVoxelScene } from "../../../game/content/types";
import { sampleJointAngleDeg } from "../../../game/voxel/voxelScene";

/** Timeline display rate — keys stay normalized 0..1 in data. */
export const VOXEL_ANIM_FPS = 24;

type Props = {
  scene: EmberVoxelScene | null;
  clipId: string | null;
  playhead: number;
  playing: boolean;
  selectedJointId: string | null;
  keyAngleDeg: number;
  onKeyAngleDeg: (deg: number) => void;
  onPlayhead: (t: number) => void;
  onTogglePlay: () => void;
  onSelectClip: (clipId: string) => void;
  onAddKey: () => void;
  onDeleteKey: (t: number) => void;
  onMoveKey: (fromT: number, toT: number) => void;
  onDurationSec: (sec: number) => void;
  onCreateClip: () => void;
  onSelectJoint: (jointId: string | null) => void;
  onAddJoint: () => void;
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function frameCountForClip(clip: EmberVoxelAnimClip | undefined): number {
  if (!clip) return VOXEL_ANIM_FPS;
  return Math.max(1, Math.round(clip.durationSec * VOXEL_ANIM_FPS));
}

function tToFrame(t: number, frames: number): number {
  return Math.round(clamp01(t) * Math.max(0, frames - 1));
}

function frameToT(frame: number, frames: number): number {
  if (frames <= 1) return 0;
  return clamp01(frame / (frames - 1));
}

function nearestKeyT(
  keys: { t: number }[],
  t: number,
  epsilon = 0.02,
): number | null {
  let best: number | null = null;
  let bestDist = epsilon;
  for (const k of keys) {
    const d = Math.abs(k.t - t);
    if (d < bestDist) {
      bestDist = d;
      best = k.t;
    }
  }
  return best;
}

export function VoxelAnimTimeline({
  scene,
  clipId,
  playhead,
  playing,
  selectedJointId,
  keyAngleDeg,
  onKeyAngleDeg,
  onPlayhead,
  onTogglePlay,
  onSelectClip,
  onAddKey,
  onDeleteKey,
  onMoveKey,
  onDurationSec,
  onCreateClip,
  onSelectJoint,
  onAddJoint,
}: Props) {
  const clips = scene?.animations ?? [];
  const joints = scene?.joints ?? [];
  const clip: EmberVoxelAnimClip | undefined = clips.find((c) => c.id === clipId);
  const keys =
    clip && selectedJointId
      ? (clip.tracks.find((t) => t.jointId === selectedJointId)?.keys ?? [])
      : [];
  const frames = frameCountForClip(clip);
  const frame = tToFrame(playhead, frames);
  const sampled =
    selectedJointId && clip
      ? sampleJointAngleDeg(clip, selectedJointId, playhead)
      : 0;

  const [selectedKeyT, setSelectedKeyT] = useState<number | null>(null);
  const [dragPreviewT, setDragPreviewT] = useState<number | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ fromT: number } | null>(null);

  const tickMarks = useMemo(() => {
    const marks: { frame: number; major: boolean }[] = [];
    const step = frames <= 24 ? 1 : frames <= 72 ? 2 : frames <= 120 ? 5 : 10;
    for (let f = 0; f < frames; f += step) {
      marks.push({ frame: f, major: f % (step * 5) === 0 || f === 0 });
    }
    if (marks[marks.length - 1]?.frame !== frames - 1) {
      marks.push({ frame: frames - 1, major: true });
    }
    return marks;
  }, [frames]);

  const tFromClientX = useCallback((clientX: number) => {
    const el = trackRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return clamp01((clientX - rect.left) / rect.width);
  }, []);

  const scrubTo = useCallback(
    (t: number, pickKey = true) => {
      const u = clamp01(t);
      onPlayhead(u);
      if (pickKey) {
        const near = nearestKeyT(keys, u);
        setSelectedKeyT(near);
      }
    },
    [keys, onPlayhead],
  );

  const onTrackPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!clip || e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-key]")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    scrubTo(tFromClientX(e.clientX));
  };

  const onTrackPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!clip || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
    if (dragRef.current) return;
    scrubTo(tFromClientX(e.clientX), false);
  };

  const onKeyPointerDown = (
    e: ReactPointerEvent<HTMLButtonElement>,
    keyT: number,
  ) => {
    if (!clip || e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { fromT: keyT };
    setSelectedKeyT(keyT);
    setDragPreviewT(keyT);
    onPlayhead(keyT);
    const k = keys.find((x) => Math.abs(x.t - keyT) < 0.012);
    if (k) onKeyAngleDeg(k.angleDeg);
  };

  const onKeyPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current || !e.currentTarget.hasPointerCapture(e.pointerId)) {
      return;
    }
    const u = tFromClientX(e.clientX);
    setSelectedKeyT(u);
    setDragPreviewT(u);
    onPlayhead(u);
  };

  const onKeyPointerUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current) return;
    const fromT = dragRef.current.fromT;
    dragRef.current = null;
    const toT = tFromClientX(e.clientX);
    setDragPreviewT(null);
    if (Math.abs(toT - fromT) > 0.002) {
      onMoveKey(fromT, toT);
      setSelectedKeyT(toT);
      onPlayhead(toT);
    } else {
      setSelectedKeyT(fromT);
    }
  };

  const activeKeyT =
    selectedKeyT != null
      ? nearestKeyT(keys, selectedKeyT, 0.03)
      : nearestKeyT(keys, playhead, 0.02);
  const canDelete = Boolean(clip && selectedJointId && activeKeyT != null);

  return (
    <div className="ember-voxel-timeline">
      <div className="ember-voxel-timeline__row">
        <button
          type="button"
          className="ghost ember-voxel-timeline__play"
          disabled={!scene || !clip}
          onClick={onTogglePlay}
          title={playing ? "Стоп" : "Играть"}
        >
          {playing ? "■" : "▶"}
        </button>
        <label className="ember-voxel-timeline__field">
          <span>Клип</span>
          <select
            value={clipId ?? ""}
            disabled={!scene}
            onChange={(e) => {
              if (e.target.value === "__new__") onCreateClip();
              else onSelectClip(e.target.value);
            }}
          >
            <option value="">— нет —</option>
            {clips.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nameRu ?? c.id}
              </option>
            ))}
            <option value="__new__">+ Новый клип</option>
          </select>
        </label>
        <label className="ember-voxel-timeline__field">
          <span>Петля</span>
          <select
            value={selectedJointId ?? ""}
            disabled={!scene}
            onChange={(e) => {
              if (e.target.value === "__new__") onAddJoint();
              else onSelectJoint(e.target.value || null);
            }}
          >
            <option value="">— нет —</option>
            {joints.map((j) => (
              <option key={j.id} value={j.id}>
                {j.nameRu ?? j.id}
              </option>
            ))}
            <option value="__new__">+ Новая петля</option>
          </select>
        </label>
        <label className="ember-voxel-timeline__field ember-voxel-timeline__field--num">
          <span>Длит. с</span>
          <input
            type="number"
            min={0.1}
            max={30}
            step={0.1}
            disabled={!clip}
            value={clip?.durationSec ?? 0.8}
            onChange={(e) => {
              const sec = Number(e.target.value);
              if (!Number.isFinite(sec)) return;
              onDurationSec(Math.max(0.1, Math.min(30, sec)));
            }}
            title="Длина клипа в секундах"
          />
        </label>
        <label className="ember-voxel-timeline__field ember-voxel-timeline__field--num">
          <span>Кадры</span>
          <input
            type="number"
            min={2}
            max={720}
            step={1}
            disabled={!clip}
            value={frames}
            onChange={(e) => {
              const n = Math.max(2, Math.min(720, Math.round(Number(e.target.value) || 2)));
              onDurationSec(n / VOXEL_ANIM_FPS);
            }}
            title={`Число кадров при ${VOXEL_ANIM_FPS} fps`}
          />
        </label>
        <label className="ember-voxel-timeline__field ember-voxel-timeline__field--num">
          <span>Кадр</span>
          <input
            type="number"
            min={0}
            max={Math.max(0, frames - 1)}
            step={1}
            disabled={!clip}
            value={frame}
            onChange={(e) => {
              const f = Math.max(
                0,
                Math.min(frames - 1, Math.round(Number(e.target.value) || 0)),
              );
              scrubTo(frameToT(f, frames));
            }}
          />
        </label>
        <label className="ember-voxel-timeline__field ember-voxel-timeline__field--angle">
          <span>Угол°</span>
          <input
            type="number"
            step={5}
            value={keyAngleDeg}
            disabled={!selectedJointId}
            onChange={(e) => onKeyAngleDeg(Number(e.target.value) || 0)}
            title="Живой угол петли (и для записи ключа)"
          />
        </label>
        <button
          type="button"
          className="ghost"
          disabled={!clip || !selectedJointId}
          title="Записать ключ на текущем кадре"
          onClick={onAddKey}
        >
          Ключ
        </button>
        <button
          type="button"
          className="ghost ember-danger"
          disabled={!canDelete}
          title="Удалить выбранный / ближайший ключ"
          onClick={() => {
            if (activeKeyT == null) return;
            onDeleteKey(activeKeyT);
            setSelectedKeyT(null);
          }}
        >
          Удал. ключ
        </button>
        <em className="ember-voxel-timeline__angle" title="Интерполяция клипа">
          {sampled.toFixed(0)}° · {VOXEL_ANIM_FPS} fps
        </em>
      </div>

      {clip ? (
        <div className="ember-voxel-timeline__track-wrap">
          <div className="ember-voxel-timeline__ruler" aria-hidden>
            {tickMarks.map((m) => (
              <span
                key={m.frame}
                className={
                  m.major
                    ? "ember-voxel-timeline__tick is-major"
                    : "ember-voxel-timeline__tick"
                }
                style={{ left: `${frameToT(m.frame, frames) * 100}%` }}
              >
                {m.major ? m.frame : null}
              </span>
            ))}
          </div>
          <div
            ref={trackRef}
            className="ember-voxel-timeline__track"
            role="slider"
            aria-valuemin={0}
            aria-valuemax={frames - 1}
            aria-valuenow={frame}
            aria-label="Таймлайн анимации"
            onPointerDown={onTrackPointerDown}
            onPointerMove={onTrackPointerMove}
          >
            <div
              className="ember-voxel-timeline__playhead"
              style={{ left: `${playhead * 100}%` }}
            />
            {selectedJointId
              ? keys.map((k, i) => {
                  const selected =
                    activeKeyT != null && Math.abs(k.t - activeKeyT) < 0.012;
                  const dragging =
                    dragRef.current != null &&
                    Math.abs(k.t - dragRef.current.fromT) < 0.012;
                  const leftT =
                    dragging && dragPreviewT != null ? dragPreviewT : k.t;
                  return (
                    <button
                      key={`${k.t}-${i}`}
                      type="button"
                      data-key
                      className={`ember-voxel-timeline__key ${selected || dragging ? "is-selected" : ""}`}
                      style={{ left: `${leftT * 100}%` }}
                      title={`Кадр ${tToFrame(k.t, frames)} · ${k.angleDeg}° · тяни мышью`}
                      onPointerDown={(e) => onKeyPointerDown(e, k.t)}
                      onPointerMove={onKeyPointerMove}
                      onPointerUp={onKeyPointerUp}
                      onPointerCancel={() => {
                        dragRef.current = null;
                        setDragPreviewT(null);
                      }}
                    />
                  );
                })
              : null}
          </div>
          <div className="ember-voxel-timeline__meta">
            <span>
              {frame}/{frames - 1}
            </span>
            <span>{(playhead * (clip.durationSec)).toFixed(2)}с / {clip.durationSec.toFixed(2)}с</span>
          </div>
        </div>
      ) : (
        <p className="muted ember-hint ember-voxel-timeline__hint">
          Создайте клип, выберите петлю, ставьте ключи. Тяните ромбы по шкале —
          перенос кадра. Esc на петле — отмена создания.
        </p>
      )}
    </div>
  );
}
