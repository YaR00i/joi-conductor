import {
  cagePunishSpec,
  denyPunishSpec,
  plugPunishSpec,
} from "../../progressN";

export const SPEECH_OFFER_KINDS = [
  "cage",
  "plug",
  "deny",
  "session",
] as const;
export type SpeechOfferKind = (typeof SPEECH_OFFER_KINDS)[number];

export type SpeechOffer = {
  kind: SpeechOfferKind;
  hours?: number;
  titleRu: string;
  hintRu: string;
  confirmRu: string;
};

export type SpeechOfferLive = {
  moodScore: number;
  cageOn: boolean;
  plugOn: boolean;
  denialOn: boolean;
};

const OFFER_CUE =
  /сегодня|на ночь|на день|на сутки|хочу|предлага|назнач|думаю|наверн|может|давай|посаж|запир|надень|держи|будет клет|клетк.{0,20}сегодня|сегодня.{0,24}клетк/i;

const RITUAL_CAGE =
  /клетк\w{0,8}\s+на месте|осмотр\w{0,4}\s+клетк|протри.{0,12}клетк/i;

function hoursFromSpeech(text: string, fallback: number): number {
  const match = text.match(/(\d+)\s*ч/i);
  if (!match?.[1]) return fallback;
  const n = Number(match[1]);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(1, Math.min(24, n));
}

function mentionsCage(text: string): boolean {
  if (RITUAL_CAGE.test(text)) return false;
  return /клетк/i.test(text);
}

function mentionsPlug(text: string): boolean {
  return /пробк/i.test(text);
}

function mentionsDeny(text: string): boolean {
  return /denial|\bденай\b|запрет\w{0,6}\s+(кончать|оргазм)|без права кончить/i.test(
    text,
  );
}

function mentionsSession(text: string): boolean {
  return /сесси[яиюе]/i.test(text);
}

function uniqueKinds(kinds: SpeechOfferKind[]): SpeechOfferKind[] {
  const seen = new Set<SpeechOfferKind>();
  const out: SpeechOfferKind[] = [];
  for (const kind of kinds) {
    if (seen.has(kind)) continue;
    seen.add(kind);
    out.push(kind);
  }
  return out;
}

/** System reads her speech and offers app cards. She does not create contracts. */
export function parseSpeechOffers(
  speech: string,
  live: SpeechOfferLive,
): SpeechOffer[] {
  const text = speech.trim();
  if (!text || !OFFER_CUE.test(text)) return [];

  const kinds: SpeechOfferKind[] = [];
  if (mentionsCage(text) && !live.cageOn) kinds.push("cage");
  if (mentionsPlug(text) && !live.plugOn) kinds.push("plug");
  if (mentionsDeny(text) && !live.denialOn) kinds.push("deny");
  if (mentionsSession(text)) kinds.push("session");

  const offers: SpeechOffer[] = [];
  for (const kind of uniqueKinds(kinds)) {
    switch (kind) {
      case "cage": {
        const spec = cagePunishSpec(live.moodScore, live.cageOn);
        if (!spec) break;
        const hours =
          typeof spec.params.hours === "number"
            ? hoursFromSpeech(text, spec.params.hours)
            : hoursFromSpeech(text, 8);
        offers.push({
          kind,
          hours,
          titleRu: `Клетка · ${hours} ч`,
          hintRu: "Вне сессии · таймер. Система, не она создаёт контракт.",
          confirmRu: "Надеть",
        });
        break;
      }
      case "plug": {
        const spec = plugPunishSpec(live.moodScore, live.plugOn);
        if (!spec) break;
        const hours =
          typeof spec.params.hours === "number"
            ? hoursFromSpeech(text, spec.params.hours)
            : hoursFromSpeech(text, 2);
        offers.push({
          kind,
          hours,
          titleRu: `Пробка · ${hours} ч`,
          hintRu: "Вне сессии · таймер.",
          confirmRu: "Поставить",
        });
        break;
      }
      case "deny": {
        const spec = denyPunishSpec();
        offers.push({
          kind,
          titleRu: spec.labelRu,
          hintRu: "Вне сессии · denial до завтра.",
          confirmRu: "Принять",
        });
        break;
      }
      case "session":
        offers.push({
          kind,
          titleRu: "Сессия Conductor",
          hintRu: "Собрать из рулетки и запустить.",
          confirmRu: "Согласен",
        });
        break;
      default: {
        const _exhaustive: never = kind;
        return _exhaustive;
      }
    }
  }
  return offers;
}
