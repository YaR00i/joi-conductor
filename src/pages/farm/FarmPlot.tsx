import type { FarmPlot as Plot } from "./farmField";
import { CropArt, DropArt, SproutArt, WeedArt } from "./FarmArt";

/**
 * One garden bed. A pure renderer of the sim state: the parent decides what
 * a click means (plant / water / harvest / clear) and passes visual extras.
 *
 * Growing crops draw the plant's own art scaled by progress (sprout first),
 * so a half-grown crop can never be mistaken for the spiky WeedArt.
 */

interface Props {
  plot: Plot;
  /** 0..1 growth progress for a growing crop. */
  progress: number;
  /** 0..1 how close a ripe crop is to wilting. */
  urgency: number;
  /** Transient "+N" / "−" popup text (managed by the parent). */
  pop: { id: number; text: string } | null;
  disabled: boolean;
  onClick: () => void;
}

export function FarmPlot({ plot, progress, urgency, pop, disabled, onClick }: Props) {
  const cls = [
    "farm-plot",
    `farm-plot--${plot.kind}`,
    plot.kind === "growing" && plot.thirsty ? "is-thirsty" : "",
    plot.kind === "ripe" && urgency > 0.6 ? "is-urgent" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const label =
    plot.kind === "empty"
      ? "посадить"
      : plot.kind === "weed"
        ? "прополоть"
        : plot.kind === "wilted"
          ? "убрать"
          : plot.kind === "growing"
            ? plot.thirsty
              ? "полить"
              : "растёт"
            : "собрать";

  return (
    <button type="button" className={cls} onClick={onClick} disabled={disabled} title={label}>
      <span className="farm-plot__stage" aria-hidden>
        {plot.kind === "weed" ? <WeedArt className="farm-plot__art" /> : null}
        {plot.kind === "wilted" ? <CropArt id={plot.cropId} className="farm-plot__art" /> : null}
        {plot.kind === "ripe" ? <CropArt id={plot.cropId} className="farm-plot__art" /> : null}
        {plot.kind === "growing" ? (
          progress < 0.34 ? (
            <SproutArt className="farm-plot__art" />
          ) : (
            <CropArt
              id={plot.cropId}
              className="farm-plot__art farm-plot__art--growing"
              // The plant visibly swells from half-size to full as it grows.
              style={{ transform: `scale(${(0.5 + 0.5 * progress).toFixed(3)})` }}
            />
          )
        ) : null}
      </span>

      {plot.kind === "growing" ? (
        <span className="farm-plot__bar" aria-hidden>
          <span
            className={`farm-plot__bar-fill${plot.thirsty ? " is-dry" : ""}`}
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </span>
      ) : null}

      {plot.kind === "ripe" ? (
        <span className="farm-plot__ring" aria-hidden>
          <span
            className="farm-plot__ring-fill"
            style={{ width: `${Math.round((1 - urgency) * 100)}%` }}
          />
        </span>
      ) : null}

      {plot.kind === "growing" && plot.thirsty ? (
        <span className="farm-plot__badge farm-plot__badge--thirst" aria-hidden>
          <DropArt className="farm-plot__drop" />
        </span>
      ) : null}
      {plot.kind === "wilted" ? (
        <span className="farm-plot__badge farm-plot__badge--wilt" aria-hidden>
          ✖
        </span>
      ) : null}

      <span className="farm-plot__hint">{label}</span>

      {pop ? (
        <span key={pop.id} className="farm-plot__pop" aria-hidden>
          {pop.text}
        </span>
      ) : null}
    </button>
  );
}
