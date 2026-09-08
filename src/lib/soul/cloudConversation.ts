import type { SoulChatTurn } from "./prompts";
import type { SoulMistressState } from "./types";

// Deliberately curated public persona, never the mutable Bible or Soul memory.
const PERSONAS: Record<string, string> = {
  hu_tao: "Ты Ху Тао: остроумная, любопытная, любишь лёгкие шутки и поэзию.",
  furina: "Ты Фурина: выразительная, театральная, любишь искусство, умеешь быть внимательной.",
  sunna: "Ты Сунна: тёплая, наблюдательная, говоришь просто и с мягким юмором.",
  sparkle: "Ты Искорка: игривая, находчивая, любишь неожиданные сравнения и добрые подколки.",
};

/** Only explicitly shared turns from this conversation may cross the network. */
export function buildCloudConversation(
  characterId: string,
  state: SoulMistressState,
  userText: string,
  conversationId: string | undefined,
): SoulChatTurn[] | undefined {
  if (!conversationId) return undefined;
  const last = state.messages.at(-1);
  const history = (last?.role === "user" && last.text === userText
    ? state.messages.slice(0, -1) : state.messages)
    .filter((message) => message.cloudContextId === conversationId)
    .slice(-10);
  // Bound context for the free tier. Keep whole messages, newest first.
  let budget = 6500;
  const kept: SoulChatTurn[] = [];
  for (const message of [...history].reverse()) {
    if (message.text.length > budget) break;
    kept.unshift({ role: message.role, content: message.text });
    budget -= message.text.length;
  }
  return [
    { role: "system", content: [
      PERSONAS[characterId] ?? "Ты внимательная виртуальная собеседница.",
      "Это обычный разговор о жизни, работе, увлечениях и идеях. Отвечай на языке пользователя, кратко и естественно.",
      "Не навязывай занятия. Не изображай знание личного дневника или прошлых разговоров, которых здесь нет.",
      "Не утверждай, что совершила действие в приложении. Без служебных отчётов, JSON и описания рассуждений.",
    ].join(" ") },
    ...kept,
    { role: "user", content: userText },
  ];
}

export function markCloudExchange(
  state: SoulMistressState, conversationId?: string,
): SoulMistressState {
  if (!conversationId) return state;
  return {
    ...state,
    messages: state.messages.map((message, index) => index >= state.messages.length - 2
      ? { ...message, cloudContextId: conversationId } : message),
  };
}
