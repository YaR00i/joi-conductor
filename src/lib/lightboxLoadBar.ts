import type { MediaKind } from "./media";

export function lightboxLoadBarWidth(percent: number | null): number {
  if (percent == null) return 32;
  return Math.max(4, Math.min(100, Math.round(percent)));
}

export function lightboxLoadLabel(
  kind: MediaKind,
  percent: number | null,
  phase: "loading" | "opening" | "error",
  detail?: string | null,
): string {
  if (phase === "error") return lightboxErrorSummary(detail);
  const noun =
    kind === "video" ? "видео" : kind === "gif" ? "gif" : "фото";
  if (phase === "opening") return `Файл скачан · открываю ${noun}…`;
  if (percent == null) return `Качаю ${noun}…`;
  return `Качаю ${noun} · ${percent}%`;
}

export function lightboxErrorSummary(detail: string | null | undefined): string {
  const raw = detail?.trim() || "";
  if (!raw) return "Не удалось загрузить";
  const inner = raw.match(/attempts \((.+)\)/i);
  const text = (inner?.[1] ?? raw).trim();
  if (text.length <= 140) return text;
  return `${text.slice(0, 137).trim()}…`;
}
