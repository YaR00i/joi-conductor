import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const raw = JSON.parse(
  fs.readFileSync(path.join(root, "data/character/hu-tao-prompts.json"), "utf8"),
);

const EFFECT_RU = {
  feeling_good: "мягче настроение (+1); фраза «хорошо»",
  feeling_bad: "жёстче настроение (−1); фраза «плохо»",
  mute: "молчание (−2 mood); фраза mute",
  wager_yes: "+1 mood; prefs preferKeys +1.5; подмена медиа по tags",
  wager_no: "−1 mood; prefs preferKeys −1.5; в harsh mood ~35% → rest 15с",
  confess_like: "+1 mood; prefs[preferKey] +2",
  confess_dislike: "0 mood; prefs[preferKey] −2",
  loyalty_yes:
    "+1 mood; вставляет блок по loyaltyAction: rest | hold | tip (sec = loyaltySec)",
  loyalty_no: "−1 mood; в harsh mood → rest 12с",
  obey_ok: "+2 mood",
  obey_fail: "−2 mood; rest 18с",
  dare_accept:
    "+1 mood; дальше по taskType (timed_report / cage_hijack / cum_eat_promise / edge_ad / dice_chaos)",
  dare_refuse: "−1 mood; в harsh mood → rest 15с",
  dare_done: "+2 mood (самоотчёт после timed dare)",
  dare_fail: "−2 mood (самоотчёт / сдался)",
  promise_done: "+2 mood",
  promise_fail: "−2 mood",
  equip_yes: "+1 mood; надеть toyId и пересобрать хвост сессии",
  equip_no: "−1 mood; в harsh mood → rest 12с",
  mood_harsher: "жёстче params + rebuild; ~55% edge-ad; mood −2",
  mood_softer: "мягче params + rebuild; mood +2",
  mood_horny: "horny params + rebuild; moodScore → 1",
  mood_refuse: "отказ от смены mood; mood 0",
  beg_please: "+1 mood; soften finale params; −1 beg credit",
  beg_skip: "−1 mood; −1 beg credit",
  beg_deny_want: "−1 mood; deny-lean params + denial quest; −1 beg credit",
  finale_want_cum: "+1 mood; bias params к кончу",
  finale_want_deny: "−1 mood; bias к deny + denial quest",
  finale_want_ruin: "0 mood; bias к ruin",
};

const LOYALTY_ACTION_RU = {
  rest: "пауза / hands off (rest-блок)",
  hold: "ход «держи грань» (hold-блок + grace)",
  tip: "ход только кончиком (tip stroke-блок)",
};

const TASK_TYPE_RU = {
  timed_report: "таймер → кнопки Успел / Провалил",
  cage_hijack: "режим chastity + часы клетки + rebuild",
  cum_eat_promise: "флаг promiseCumEat до финала",
  edge_ad: "вставить серию edge в очередь",
  dice_chaos: "случайная мутация сессии",
};

const kindOrder = [
  "feeling",
  "wagerGood",
  "wagerBad",
  "wager",
  "confess",
  "loyalty",
  "obey",
  "dare",
  "equip",
  "moodOffer",
  "mood_offer",
  "permission",
  "finaleBias",
  "finale_bias",
];

const keys = [
  ...kindOrder.filter((k) => Array.isArray(raw[k])),
  ...Object.keys(raw).filter((k) => !kindOrder.includes(k) && Array.isArray(raw[k])),
];

let total = 0;
for (const k of keys) total += raw[k].length;

let md = `# Вопросы Ху Тао — проверка логичности

Сгенерировано из \`data/character/hu-tao-prompts.json\`.
Всего промптов: **${total}**.

## Легенда эффектов (\`effect\`)

| effect | Что делает в рантайме |
| --- | --- |
`;

for (const [k, v] of Object.entries(EFFECT_RU)) {
  md += `| \`${k}\` | ${v} |\n`;
}

md += `
### loyaltyAction (только при \`loyalty_yes\`)

| action | Смысл |
| --- | --- |
`;
for (const [k, v] of Object.entries(LOYALTY_ACTION_RU)) {
  md += `| \`${k}\` | ${v} |\n`;
}

md += `
### dare taskType (при \`dare_accept\`)

| taskType | Смысл |
| --- | --- |
`;
for (const [k, v] of Object.entries(TASK_TYPE_RU)) {
  md += `| \`${k}\` | ${v} |\n`;
}

md += `
---

`;

for (const key of keys) {
  const list = raw[key];
  md += `## ${key} (${list.length})\n\n`;
  for (const p of list) {
    md += `### \`${p.id}\`\n\n`;
    md += `- **Вид:** ${p.kind ?? key}\n`;
    md += `- **Вопрос (RU):** ${p.labelRu ?? "—"}\n`;
    if (p.speakEn) md += `- **Speak EN:** ${p.speakEn}\n`;
    if (p.loyaltySec != null) md += `- **loyaltySec:** ${p.loyaltySec}\n`;
    if (p.loyaltyAction)
      md += `- **loyaltyAction:** \`${p.loyaltyAction}\` — ${LOYALTY_ACTION_RU[p.loyaltyAction] ?? "?"}\n`;
    if (p.taskType)
      md += `- **taskType:** \`${p.taskType}\` — ${TASK_TYPE_RU[p.taskType] ?? "?"}\n`;
    if (p.taskSec != null) md += `- **taskSec:** ${p.taskSec}\n`;
    if (p.taskCount != null) md += `- **taskCount:** ${p.taskCount}\n`;
    if (p.instructionRu) md += `- **Инструкция:** ${p.instructionRu}\n`;
    if (p.tags) md += `- **tags:** \`${p.tags}\`\n`;
    if (p.preferKeys?.length)
      md += `- **preferKeys:** ${p.preferKeys.join(", ")}\n`;
    if (p.pool) md += `- **pool:** ${p.pool}\n`;
    if (p.toyId) md += `- **toyId:** ${p.toyId}\n`;
    if (p.cageHours != null) md += `- **cageHours:** ${p.cageHours}\n`;
    if (p.cageHoursMin != null || p.cageHoursMax != null)
      md += `- **cageHours range:** ${p.cageHoursMin ?? "?"}–${p.cageHoursMax ?? "?"}\n`;
    if (p.moods?.length) md += `- **moods:** ${p.moods.join(", ")}\n`;
    if (p.correctOptionId)
      md += `- **correctOptionId:** \`${p.correctOptionId}\`\n`;
    md += `- **Ответы:**\n`;
    for (const o of p.options ?? []) {
      const effectHint = EFFECT_RU[o.effect] ? ` — ${EFFECT_RU[o.effect]}` : "";
      let line = `  - **${o.labelRu}** (\`${o.id}\`) → \`${o.effect}\`${effectHint}`;
      if (o.preferKey) line += ` · preferKey: \`${o.preferKey}\``;
      md += `${line}\n`;
    }
    md += `\n`;
  }
  md += `---\n\n`;
}

const outDir = path.join(root, "docs");
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "hu-tao-prompts-review.md");
fs.writeFileSync(outPath, md, "utf8");
console.log(`Wrote ${outPath} (${md.length} chars, ${total} prompts)`);
