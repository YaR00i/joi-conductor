import { runtimeBootstrapJobLabelRu } from "../lib/runtimeBootstrap";
import type { RuntimeBootstrapProgress } from "../lib/runtimeBootstrapRun";
import "./runtimeBootstrap.css";

type Props = {
  progress: RuntimeBootstrapProgress | null;
};

export function RuntimeBootstrapStrip({ progress }: Props) {
  if (!progress || progress.jobCount === 0) return null;

  const jobLabel = progress.job
    ? runtimeBootstrapJobLabelRu(progress.job)
    : progress.phase;
  const step =
    progress.jobCount > 0
      ? `${Math.min(progress.jobIndex + 1, progress.jobCount)} / ${progress.jobCount}`
      : "";

  return (
    <div
      className={
        "runtime-bootstrap" +
        (progress.error ? " is-error" : "") +
        (progress.done ? " is-done" : "")
      }
      role="status"
      aria-live="polite"
    >
      <div className="runtime-bootstrap__top">
        <strong>
          {progress.done
            ? progress.error
              ? "Среды"
              : "Среды готовы"
            : "Качаю среды"}
        </strong>
        <span>{progress.done ? (progress.error ? "ошибка" : "готово") : step}</span>
      </div>
      <div className="runtime-bootstrap__bar" aria-hidden>
        <i style={{ width: `${Math.max(2, Math.min(100, progress.pct))}%` }} />
      </div>
      <p className="runtime-bootstrap__meta">
        {progress.error
          ? progress.error
          : [jobLabel, progress.detail].filter(Boolean).join(" · ")}
      </p>
    </div>
  );
}
