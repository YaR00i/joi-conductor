/**
 * Hu Tao reaction lines for the gate runner (display banner, roulette-line
 * tone). Pools are cycled without immediate repeats.
 */

import type { MistressEmojiId } from "./huTaoEmoji";

export interface RunnerLine {
  text: string;
  emoji: MistressEmojiId;
}

export type RunnerLineEvent =
  | "start"
  | "redGate"
  | "fightWin"
  | "bossWin"
  | "taskOk"
  | "taskFail"
  | "death"
  | "finish"
  | "ruleOk"
  | "ruleFail";

const POOLS: Record<RunnerLineEvent, RunnerLine[]> = {
  start: [
    { text: "Беги. Я посмотрю, на что годится твоя толпа — и на что годишься ты.", emoji: "smug" },
    { text: "Вперёд, беглец. Красные врата кусаются, но ты же любишь, когда больно?", emoji: "pout" },
    { text: "Забег начинается~ Постарайся не сгореть в первых же вратах. Это было бы скучно.", emoji: "shy" },
  ],
  redGate: [
    { text: "Ай-яй. Красное ворото. Ты специально или просто невнимательный?", emoji: "pout" },
    { text: "Минус бегуны. Кто-то не смотрит под ноги~", emoji: "smug" },
    { text: "Больно? Это ещё ласково.", emoji: "smug" },
  ],
  fightWin: [
    { text: "Вот это уже похоже на толпу. Продолжай в том же духе.", emoji: "smug" },
    { text: "Размазал их. Мне нравится~", emoji: "shy" },
    { text: "Хм. Не ожидала, что справишься так легко.", emoji: "pout" },
  ],
  bossWin: [
    { text: "Босс пал?! Ладно… признай, это было красиво.", emoji: "shy" },
    { text: "Трофей твой. Ты его заработал — сегодня я щедрая.", emoji: "smug" },
    { text: "Вот это финал! Снимаю шляпу… ненадолго.", emoji: "smug" },
  ],
  taskOk: [
    { text: "Выполнил. Хорошему бегуну — бонусная толпа.", emoji: "smug" },
    { text: "Вижу, старался. Держи награду.", emoji: "shy" },
    { text: "Неплохо. Огонь доволен.", emoji: "shy" },
  ],
  taskFail: [
    { text: "Провалил задание? Толпа платит за твою лень.", emoji: "pout" },
    { text: "Я засекла, как ты халтурил. Минус бегуны.", emoji: "pout" },
    { text: "В следующий раз — лучше. Или следующего раза не будет~", emoji: "smug" },
  ],
  death: [
    { text: "Толпа пала… Хоронить будем угольками. Сгоревшими.", emoji: "pout" },
    { text: "И всё? Я ждала зрелища, а получила пыль.", emoji: "pout" },
    { text: "Ну вот. Кто теперь будет меня забавлять?", emoji: "pout" },
  ],
  finish: [
    { text: "Финиш! Пусть толпа отдышится — а ты иди забирать угольки.", emoji: "smug" },
    { text: "Дошёл~ Приятно удивлён(а) не буду, но угольки отдам.", emoji: "smug" },
    { text: "Забег окончен. Ты справился… на удивление.", emoji: "shy" },
  ],
  ruleOk: [
    { text: "Моё правило исполнено. Бонус твой, заслужил.", emoji: "smug" },
    { text: "Слово держишь. Редкое качество~ Награда прилагается.", emoji: "shy" },
    { text: "Хм. Я поставила это правило не подумав, а ты всё равно справился.", emoji: "pout" },
  ],
  ruleFail: [
    { text: "Правило нарушено. Бонус уходит в огонь, туда же, где твоя дисциплина.", emoji: "pout" },
    { text: "Я же сказала — никакой красноты. Придётся попрощаться с бонусом.", emoji: "pout" },
    { text: "Почти. «Почти» не считается~", emoji: "smug" },
  ],
};

const lastIndex: Partial<Record<RunnerLineEvent, number>> = {};

/** Pick a line for an event, avoiding the previous one for the same event. */
export function pickRunnerLine(event: RunnerLineEvent): RunnerLine {
  const pool = POOLS[event];
  if (pool.length === 1) return pool[0];
  let i = Math.floor(Math.random() * pool.length);
  if (i === lastIndex[event]) i = (i + 1) % pool.length;
  lastIndex[event] = i;
  return pool[i];
}
