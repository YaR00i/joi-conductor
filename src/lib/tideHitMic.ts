import {
  initialTideHitOnsetState,
  rmsFromFloat32,
  rmsToDb,
  tickTideHitOnset,
  type TideHitOnsetState,
} from "./tideHitVerify";

export type TideHitMicStatus = "idle" | "starting" | "live" | "denied" | "error";

export type TideHitMicHandle = {
  stop: () => void;
  setThresholdDb: (db: number) => void;
  blankUntil: (ms: number) => void;
};

export function tideHitMicStatusRu(
  status: TideHitMicStatus,
  detail?: string,
): string {
  switch (status) {
    case "idle":
      return "микрофон выключен";
    case "starting":
      return "включаю микрофон…";
    case "live":
      return "слушаю удары";
    case "denied":
      return "микрофон запрещён — дай доступ или вернись к Чести";
    case "error":
      return detail?.trim() || "микрофон не открылся";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

/**
 * Listen to the default mic and fire onHit on loud transients above threshold.
 * Caller should blank around metronome ticks so speaker ticks are not counted.
 */
export function startTideHitMic(opts: {
  thresholdDb: number;
  onHit: () => void;
  onLevel?: (db: number) => void;
  onStatus?: (status: TideHitMicStatus, detail?: string) => void;
}): TideHitMicHandle {
  let thresholdDb = opts.thresholdDb;
  let blankUntilMs = 0;
  let stopped = false;
  let raf = 0;
  let ctx: AudioContext | null = null;
  let stream: MediaStream | null = null;
  let onset: TideHitOnsetState = initialTideHitOnsetState(performance.now());
  const samples = new Float32Array(2048);

  const report = (status: TideHitMicStatus, detail?: string) => {
    opts.onStatus?.(status, detail);
  };

  const stop = () => {
    stopped = true;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    if (ctx) {
      void ctx.close();
      ctx = null;
    }
    report("idle");
  };

  const tick = (analyser: AnalyserNode) => {
    if (stopped || !ctx) return;
    analyser.getFloatTimeDomainData(samples);
    const db = rmsToDb(rmsFromFloat32(samples));
    opts.onLevel?.(db);
    const nowMs = performance.now();
    const result = tickTideHitOnset({
      db,
      thresholdDb,
      nowMs,
      state: {
        ...onset,
        blankUntilMs: Math.max(onset.blankUntilMs, blankUntilMs),
      },
    });
    onset = result.next;
    if (result.hit) opts.onHit();
    raf = requestAnimationFrame(() => tick(analyser));
  };

  report("starting");

  void (async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        report("error", "браузер не даёт микрофон");
        return;
      }
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
          channelCount: 1,
        },
        video: false,
      });
      if (stopped) {
        stream.getTracks().forEach((t) => t.stop());
        stream = null;
        return;
      }
      ctx = new AudioContext();
      if (ctx.state === "suspended") await ctx.resume();
      const source = ctx.createMediaStreamSource(stream);
      const highpass = ctx.createBiquadFilter();
      highpass.type = "highpass";
      highpass.frequency.value = 80;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0;
      source.connect(highpass);
      highpass.connect(analyser);
      report("live");
      raf = requestAnimationFrame(() => tick(analyser));
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        report("denied");
        return;
      }
      report(
        "error",
        err instanceof Error ? err.message : "микрофон не открылся",
      );
    }
  })();

  return {
    stop,
    setThresholdDb: (db) => {
      thresholdDb = db;
    },
    blankUntil: (ms) => {
      blankUntilMs = Math.max(blankUntilMs, ms);
    },
  };
}
