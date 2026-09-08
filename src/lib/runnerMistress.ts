import { activeMistressNameRu } from "./mistress";

/**
 * Mistress lines for runner events — short toasts over the canvas
 * (text only; TTS can ride the same events later). One pool for every
 * mistress; the label shows the active name.
 */

export type MistressLineEvent =
  | "runStart"
  | "fireGate"
  | "fightWin"
  | "taskFail"
  | "bossWin"
  | "death"
  | "finish"
  | "ruleDone"
  | "ruleFail";

const LINES: Record<MistressLineEvent, string[]> = {
  runStart: [
    "Беги красиво — я смотрю.",
    "Толпа — это твоё достоинство. Не растрать его.",
    "Вперёд. Угольки сами себя не соберут.",
    "Покажи мне забег, который я запомню.",
  ],
  fireGate: [
    "Огонь зовёт — покажи, как ты горишь.",
    "Задание от меня. Не вздумай хитрить.",
    "Огненные врата любят смелых.",
    "Стой ровно. Буду смотреть.",
  ],
  fightWin: [
    "Хорошо сомнула. Дальше.",
    "Вот это напор. Мне нравится.",
    "Волна рассыпалась — а ты всё ещё мой.",
    "Не останавливайся.",
  ],
  taskFail: [
    "Слово «Готово» значит «готово».",
    "Хитришь? Я вижу.",
    "Ну-ну. Огонь всё помнит.",
  ],
  bossWin: [
    "Босс пал. Трофей твой — заслужил.",
    "Вот это финал. Люблю смотреть, как ты побеждаешь.",
    "Сняла корону с босса. Носи бережно.",
  ],
  death: [
    "Сгорел? Бедняжка. Ещё раз, с чувством.",
    "Толпа пала. Угли тоже.",
    "Больно? Запомни это ощущение.",
    "Ничего. Я никуда не спешу.",
  ],
  finish: [
    "Финиш. Посмотрим, что ты заработал.",
    "Доставил толпу. Я довольна… почти.",
    "Последний шаг — и награда твоя.",
  ],
  ruleDone: [
    "Правило выполнено. Удостоен похвалы.",
    "Слово держишь. Это мне нравится.",
  ],
  ruleFail: [
    "Правило нарушено. Я запомнила.",
    "Ты был ближе, чем думаешь. В следующий раз.",
  ],
};

export function pickMistressLine(
  event: MistressLineEvent,
  rng: () => number = Math.random,
): string {
  const pool = LINES[event];
  return pool[Math.floor(rng() * pool.length)];
}

/** Display name of the active mistress for toast labels. */
export function runnerMistressName(): string {
  try {
    return activeMistressNameRu();
  } catch {
    return "Госпожа";
  }
}
