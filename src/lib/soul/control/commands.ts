import type { MistressMood } from "../../voice/moodLines";
import { loadContractBoard } from "../../contracts/dailyBoard";
import { moodFromScore } from "../../moodEngine";
import type { MistressId } from "../../mistress/types";
import { controlLiveSnapshot, formatHoursLeft } from "./live";
import { loadControlState } from "./store";
import {
  dispatchPhaseLabelRu,
  listMorningContracts,
  openSessionOffer,
  submitCheckIn,
  assignIdleTaskPack,
  refuseSessionOffer,
} from "./dispatch";
import { openMorningPack } from "./morning";
import type { ControlLiveSnapshot, ControlState, DispatchPhase } from "./types";

export const CHAT_COMMAND_GROUPS = [
  "meta",
  "habits",
  "session",
  "board",
] as const;
export type ChatCommandGroup = (typeof CHAT_COMMAND_GROUPS)[number];

export const CHAT_COMMAND_IDS = [
  "help",
  "status",
  "morning",
  "checkin",
  "session",
  "offer",
  "accept",
  "refuse",
  "task",
  "punish",
  "contracts",
] as const;
export type ChatCommandId = (typeof CHAT_COMMAND_IDS)[number];

export type ChatCommandDef = {
  id: ChatCommandId;
  group: ChatCommandGroup;
  slash: string;
  aliases: readonly string[];
  labelRu: string;
  hintRu: string;
};

export const CHAT_COMMANDS: readonly ChatCommandDef[] = [
  {
    id: "help",
    group: "meta",
    slash: "/помощь",
    aliases: ["/help", "/команды"],
    labelRu: "Команды",
    hintRu: "Список команд бота",
  },
  {
    id: "status",
    group: "meta",
    slash: "/статус",
    aliases: ["/status"],
    labelRu: "Статус",
    hintRu: "Клетка, denial, настроение, фаза",
  },
  {
    id: "morning",
    group: "habits",
    slash: "/утро",
    aliases: ["/morning"],
    labelRu: "Утро",
    hintRu: "Открыть утренний пак",
  },
  {
    id: "checkin",
    group: "habits",
    slash: "/отчёт",
    aliases: ["/checkin", "/отчет"],
    labelRu: "Отчёт",
    hintRu: "Сдать check-in, если ждёт",
  },
  {
    id: "session",
    group: "session",
    slash: "/сессия",
    aliases: ["/session"],
    labelRu: "Сессия",
    hintRu: "Попросить и запустить",
  },
  {
    id: "offer",
    group: "session",
    slash: "/оффер",
    aliases: ["/offer"],
    labelRu: "Оффер",
    hintRu: "Как будто она предложила сессию",
  },
  {
    id: "accept",
    group: "session",
    slash: "/согласен",
    aliases: ["/yes", "/accept"],
    labelRu: "Согласен",
    hintRu: "Принять оффер сессии",
  },
  {
    id: "refuse",
    group: "session",
    slash: "/откажусь",
    aliases: ["/no", "/refuse"],
    labelRu: "Откажусь",
    hintRu: "Отказ от сессии → кара",
  },
  {
    id: "task",
    group: "board",
    slash: "/задание",
    aliases: ["/task"],
    labelRu: "Задание",
    hintRu: "Контракт вне сессии, не кара",
  },
  {
    id: "punish",
    group: "board",
    slash: "/кара",
    aliases: ["/punish"],
    labelRu: "Кара",
    hintRu: "Набор кар: сессия и вне сессии",
  },
  {
    id: "contracts",
    group: "board",
    slash: "/контракты",
    aliases: ["/contracts"],
    labelRu: "Контракты",
    hintRu: "Открытые контракты дня",
  },
];

export function chatCommandGroupLabelRu(group: ChatCommandGroup): string {
  switch (group) {
    case "meta":
      return "Справка";
    case "habits":
      return "Привычки";
    case "session":
      return "Сессия";
    case "board":
      return "Доска";
    default: {
      const _exhaustive: never = group;
      return _exhaustive;
    }
  }
}

export type ParsedChatCommand =
  | { kind: "hit"; id: ChatCommandId }
  | { kind: "unknown"; token: string };

export function parseChatCommand(raw: string): ParsedChatCommand | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/")) return null;
  const token = (trimmed.split(/\s+/)[0] ?? "").toLowerCase();
  if (token.length < 2) return { kind: "unknown", token };
  for (const cmd of CHAT_COMMANDS) {
    if (cmd.slash === token || cmd.aliases.includes(token)) {
      return { kind: "hit", id: cmd.id };
    }
  }
  return { kind: "unknown", token };
}

export function matchChatCommands(prefix: string): ChatCommandDef[] {
  const q = prefix.trim().toLowerCase();
  if (!q.startsWith("/")) return [];
  return CHAT_COMMANDS.filter(
    (cmd) =>
      cmd.slash.startsWith(q) || cmd.aliases.some((alias) => alias.startsWith(q)),
  );
}

export function formatCommandHelp(): string {
  const lines = ["Команды чата — как у бота. Можно набрать или выбрать из меню."];
  for (const group of CHAT_COMMAND_GROUPS) {
    lines.push("");
    lines.push(chatCommandGroupLabelRu(group));
    for (const cmd of CHAT_COMMANDS.filter((c) => c.group === group)) {
      lines.push(`${cmd.slash} — ${cmd.hintRu}`);
    }
  }
  return lines.join("\n");
}

function moodLabelRu(mood: MistressMood): string {
  switch (mood) {
    case "sweet":
      return "сладкое";
    case "horny":
      return "возбуждённое";
    case "calm":
      return "спокойное";
    case "bored":
      return "скучающее";
    case "cruel":
      return "жестокое";
    case "chaotic":
      return "хаотичное";
    default: {
      const _exhaustive: never = mood;
      return _exhaustive;
    }
  }
}

function wearLabelRu(kind: "cage" | "plug"): string {
  switch (kind) {
    case "cage":
      return "клетка";
    case "plug":
      return "пробка";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function formatLiveStatusRu(
  state: ControlState,
  live: ControlLiveSnapshot,
): string {
  const mood = moodFromScore(state.moodScore);
  const lines = [
    `Фаза: ${dispatchPhaseLabelRu(state.dispatch.phase)}`,
    `Настроение: ${moodLabelRu(mood)} (${state.moodScore})`,
  ];
  if (live.wear) {
    lines.push(
      `${wearLabelRu(live.wear.kind)}: ${formatHoursLeft(live.wear.remainingMs)} из ${live.wear.hours}ч`,
    );
  } else {
    lines.push("Клетка / пробка: нет");
  }
  if (live.denial) {
    lines.push(
      `Denial: ${formatHoursLeft(live.denial.remainingMs)}, эджи ${live.denial.edgesDone}/${live.denial.edgesTarget}`,
    );
  } else {
    lines.push("Denial: нет");
  }
  if (live.checkIn) {
    const wait = live.checkInOverdue ? "ждёт отчёт" : "ещё не время";
    lines.push(
      `Check-in: ${wait}${live.checkIn.note ? ` · ${live.checkIn.note}` : ""}`,
    );
  } else {
    lines.push("Check-in: нет");
  }
  const morning = listMorningContracts(state);
  if (morning.length > 0) {
    lines.push(`Утро: ${morning.map((row) => row.titleRu).join(", ")}`);
  }
  return lines.join("\n");
}

export function formatOpenContractsRu(): string {
  const board = loadContractBoard();
  const open = (board?.contracts ?? []).filter((row) => row.status === "open");
  if (open.length === 0) return "Открытых контрактов нет.";
  return [
    "Контракты дня:",
    ...open.map((row) => {
      const seal = row.acceptedAtMs ? "принят" : "на доске";
      return `· ${row.titleRu} (${seal})`;
    }),
  ].join("\n");
}

export function unknownCommandNote(token: string): string {
  return `Нет команды ${token}. Набери /помощь или открой меню команд.`;
}

export type ChatCommandEffect =
  | { kind: "note"; textRu: string }
  | { kind: "start_session" }
  | { kind: "refuse_session" }
  | { kind: "refresh"; textRu?: string };

export function runChatCommand(
  id: ChatCommandId,
  mistressId: MistressId,
  phase: DispatchPhase,
): ChatCommandEffect {
  switch (id) {
    case "help":
      return { kind: "note", textRu: formatCommandHelp() };
    case "status": {
      const state = loadControlState(mistressId);
      return {
        kind: "note",
        textRu: formatLiveStatusRu(state, controlLiveSnapshot(state)),
      };
    }
    case "contracts":
      return { kind: "note", textRu: formatOpenContractsRu() };
    case "morning": {
      const next = openMorningPack(mistressId, new Date(), { force: true });
      const rows = listMorningContracts(next);
      return {
        kind: "refresh",
        textRu:
          rows.length > 0
            ? `Утренний пак открыт: ${rows.map((r) => r.titleRu).join(", ")}.`
            : "Утренний пак пуст — нечего назначить.",
      };
    }
    case "checkin": {
      const live = controlLiveSnapshot(loadControlState(mistressId));
      if (!live.checkIn) {
        return { kind: "note", textRu: "Сейчас нет check-in. Жди, когда она назначит." };
      }
      submitCheckIn(mistressId);
      return { kind: "refresh", textRu: "Отчёт по check-in сдан." };
    }
    case "session":
      return { kind: "start_session" };
    case "offer":
      openSessionOffer(mistressId);
      return {
        kind: "refresh",
        textRu: "Оффер сессии открыт. Согласен — запустить, откажусь — кара.",
      };
    case "accept":
      if (phase !== "session_offer" && phase !== "idle") {
        return {
          kind: "note",
          textRu: "Сейчас не оффер сессии. /оффер — вызвать, /сессия — попросить сразу.",
        };
      }
      return { kind: "start_session" };
    case "refuse":
      if (phase !== "session_offer") {
        return {
          kind: "note",
          textRu: "Сейчас нет оффера сессии. /оффер — вызвать, /кара — сразу кару.",
        };
      }
      return { kind: "refuse_session" };
    case "task": {
      const pack = assignIdleTaskPack(mistressId);
      const titles = pack.contracts.map((c) => c.titleRu).join(", ");
      return {
        kind: "refresh",
        textRu:
          pack.contracts.length > 0
            ? `Задания вне сессии: ${titles}.`
            : "Не удалось назначить задание.",
      };
    }
    case "punish": {
      const pack = refuseSessionOffer(mistressId);
      const titles = pack.contracts.map((c) => c.titleRu).join(", ");
      return {
        kind: "refresh",
        textRu:
          pack.contracts.length > 0
            ? `Кара на карточках: ${titles}.`
            : "Кару назначить не вышло.",
      };
    }
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}
