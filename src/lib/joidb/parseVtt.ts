export type JoidbVttCueKind = "instruction" | "sprite";

export type JoidbVttCue = {
  id: string;
  startSec: number;
  endSec: number;
  text: string;
  kind: JoidbVttCueKind;
};

const TIME =
  /(?:(\d{2,}):)?(\d{2}):(\d{2})\.(\d{1,3})/;

export function parseVttTimestamp(raw: string): number | null {
  const m = TIME.exec(raw.trim());
  if (!m) return null;
  const hours = m[1] ? Number(m[1]) : 0;
  const min = Number(m[2]);
  const sec = Number(m[3]);
  const frac = m[4] ?? "0";
  const ms = Number(frac.padEnd(3, "0").slice(0, 3));
  if (![hours, min, sec, ms].every(Number.isFinite)) return null;
  return hours * 3600 + min * 60 + sec + ms / 1000;
}

export function isJoidbSpriteCueText(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (/#xywh=/i.test(t)) return true;
  if (/^https?:\/\//i.test(t) && /\.(webp|jpg|jpeg|png)(\?|#|$)/i.test(t)) {
    return true;
  }
  return false;
}

function cueKind(text: string): JoidbVttCueKind {
  return isJoidbSpriteCueText(text) ? "sprite" : "instruction";
}

export function parseJoidbVtt(raw: string): JoidbVttCue[] {
  const body = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const blocks = body.split(/\n\n+/);
  const cues: JoidbVttCue[] = [];
  let n = 0;
  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("NOTE"));
    if (lines.length === 0) continue;
    if (lines[0]?.toUpperCase() === "WEBVTT") continue;
    const timingIdx = lines.findIndex((l) => l.includes("-->"));
    if (timingIdx < 0) continue;
    const timing = lines[timingIdx]!;
    const [startRaw, endRaw] = timing.split("-->").map((s) => s.trim());
    const startSec = parseVttTimestamp(startRaw ?? "");
    const endSec = parseVttTimestamp((endRaw ?? "").split(/\s+/)[0] ?? "");
    if (startSec == null || endSec == null) continue;
    const idLine = timingIdx > 0 ? lines[0] : "";
    const payload = lines.slice(timingIdx + 1).join("\n").trim();
    n += 1;
    cues.push({
      id: idLine && !idLine.includes("-->") ? idLine : `cue-${n}`,
      startSec,
      endSec,
      text: payload,
      kind: cueKind(payload),
    });
  }
  return cues;
}

export function instructionCues(cues: readonly JoidbVttCue[]): JoidbVttCue[] {
  return cues.filter((c) => c.kind === "instruction" && c.text.trim().length > 0);
}

export function cueAtTime(
  cues: readonly JoidbVttCue[],
  timeSec: number,
): JoidbVttCue | null {
  let hit: JoidbVttCue | null = null;
  for (const cue of cues) {
    if (timeSec >= cue.startSec && timeSec < cue.endSec) hit = cue;
  }
  return hit;
}
