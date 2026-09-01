# Система профилей Госпож (Mistress Packs)

Живая спека. Обновляй по мере внедрения. Картинки аватаров/портретов: SVG-плейсхолдеры; положи PNG с теми же именами — `MistressImg` подхватит.

## Статус

| Пак | id | Статус |
|-----|-----|--------|
| Ember — Ху Тао | `hu_tao` | Есть · база hand-stroke · **онахол** только у неё |
| Tide — Фурина | `furina` | **Закрыта** до CBT/plapping/prone + censored/blacked · **CBT + Prone** только у неё · мало hand-stroke |
| Idol Soft — Санна | `sunna` | **Закрыта** до вибро + клетка/орал + архетип · **орал** только у неё · **без дрочки руками** (vibe-first) |
| Mask Circus — Искорка / Искра | `sparkle` | **Закрыта** (правила ниже); phantom + SessionFx при разблоке |

«Её вкусы» (пресеты плана) — **по госпоже**: [`presets.ts`](../src/lib/presets.ts) `listMistressPresets` · каталог [`presets.json`](../data/presets.json).

## Разблок Mask Circus (Искорка / Искра) — «Две души»

Все условия сразу:

1. Открыты **Фурина** и **Санна**
2. Куплены `mode_anal` + `mode_chastity`
3. Куплены оба пака `censored_court` + `blacked_court`
4. Оба магазин-ключа: **Маска Искорки** (`sparkle_mask`) + **Клык Искры** (`iskra_fang`)
5. ≥1 завершённая сессия в режиме клетки

При разблоке авто-выдаются флаги `sparkle_phantom` + `sparkle_session_fx`, включаются secondary censored/blacked. Логика: [`mistressUnlocks.ts`](../src/lib/mistress/mistressUnlocks.ts). Настройки эффектов сессии (спираль, артефакты, темы надписей): [`sessionFx.ts`](../src/lib/sessionFx.ts), Настройки → Геймплей → Эффекты.

## Furina Tide (готово)

- Mood lines: все `MoodPhraseKey`, defaultMood `cruel` — [`furina-mood-lines.json`](../data/character/furina-mood-lines.json)
- Shop: [`shopDialogueFurina.ts`](../src/lib/shopDialogueFurina.ts) через registry в [`shopDialogue.ts`](../src/lib/shopDialogue.ts)
- Roulette: [`furinaRouletteLines.ts`](../src/lib/furinaRouletteLines.ts) через [`rouletteLines.ts`](../src/lib/rouletteLines.ts) → pick*
- Prompts: [`furina-prompts.json`](../data/character/furina-prompts.json) (~91 defs, CBT/prone/verdict) via [`mistressPrompts.ts`](../src/lib/mistressPrompts.ts)
- PlayBias: preferred `cbt` + `prone`; квесты + focusTags; cumplay bias
- Verdict: [`furinaVerdict.ts`](../src/lib/furinaVerdict.ts) — outcome hooks (в т.ч. `cbt`)
- **Mechanics identity**:
  - Режимы **CBT** и **Prone** exclusive + auto-grant при разблоке Tide
  - Prone ≠ дрочка: член упирается в поверхность, ритм бёдрами без рук (`stroke_prone`)
  - Conductor: pain/prone BPM mid-band; scoring даунскейлит generic stroke в CBT
  - **Tide counters v1**: «+1 удар» на `cbt_light` / `cbt_medium` / `plapping`

## Sunna Idol — Mechanics identity (vibe-first)

- Нет `stroke` / `onahole` / `cbt` / `prone` пока активна Санна
- Режимы: **oral** (exclusive) + **chastity** (+ anal)
- Каталог: `oral_*` + vibe assists; preferredModes `oral` / `chastity`
- Идея: вибрации вместо hand-stroke; феминные задания (горло / дилдо / клетка)
- Mood/prompts/shop/roulette: **паритет контента с Tide** по ключам (см. блок P1 ниже); голос всё ещё vibe/cage/oral, не hand-stroke

## Сделано в коде (общий каркас)

- Registry / picker / `data-mistress` themes ([`src/lib/mistress/`](../src/lib/mistress/))
- MediaProfile + Gelbooru bias packs ([`secondaryCache.ts`](../src/lib/mistress/secondaryCache.ts)) — доп. теги в запрос Gelbooru, **не** второй хост
- PlayBias: mode / function / quest weights; Sparkle phantom + anal gate
- SessionFx overlay (Sparkle): [`SessionFxOverlay.tsx`](../src/components/SessionFxOverlay.tsx)
- PNG prefer: [`MistressImg.tsx`](../src/components/MistressImg.tsx)

## Sunna / Sparkle content parity (P1)

Сделано ближе к Furina-уровню для того, что уже слышно в roulette/session/voice:

- **Mood lines**: полные `MoodPhraseKey` (~51 ключ, ~876 строк) — [`sunna-mood-lines.json`](../data/character/sunna-mood-lines.json), [`sparkle-mood-lines.json`](../data/character/sparkle-mood-lines.json); генератор [`generate-sunna-sparkle-mood-lines.mjs`](../scripts/generate-sunna-sparkle-mood-lines.mjs)
- **Bible fallbacks**: расширены до finale/cumplay/unauthorized/pause (как Tide) — [`sunna.json`](../data/character/sunna.json), [`sparkle.json`](../data/character/sparkle.json)
- **Roulette landByOption**: duration/edges/ruins/finale/… — [`sunnaRouletteLines.ts`](../src/lib/sunnaRouletteLines.ts), [`sparkleRouletteLines.ts`](../src/lib/sparkleRouletteLines.ts)
- **Sparkle dual-persona (лёгкий слой)**: в mood lines префиксы `Sparkle:` / `Iskra:` / `Mask:` по настроению (sweet→Искорка, cruel→Искра, calm→Маска). Отдельного speaker-поля в `MoodPhrase` пока нет
- Prompts / shop dialogue уже были по объёму ≈ Furina

## Очередь (дальше)

1. Настоящие dual-persona speaker tags в типе `MoodPhrase` + UI/TTS ветвление
2. Реальные secondary booru hosts (сейчас честно: только Gelbooru bias / доп. теги)
3. Voice refs `voice-refs/sunna|sparkle|furina/`
4. Пользовательские PNG поверх SVG
5. Дошлифовка prompts Sparkle (часть dared ещё «tide-adjacent»)

## Roulette bias (по Госпоже)

Пулы **динамически заменяются** (`replacePools` в [`rouletteBias.ts`](../src/lib/mistress/rouletteBias.ts)):
другие цифры длительности/эджей/руинов/финала и веса. План и настройки
рулетки читают те же лимиты.

| Пак | Пулы | План |
|-----|------|------|
| Hu Tao | дефолт + soft weights | полный диапазон |
| **Furina** | 10–25 мин · 5–10 эджей · 1–3 руина · cum≤50% · без sweet/slow | ≥10м · ≥5 edges · ≥1 ruin · cum≤50% |
| Sunna | 5–15 мин · 2–6 эджей · 0–2 руина · soft finale | короче, soft |
| Sparkle | 10–25 мин · 4–10 эджей · 1–3 руина · cum≤45% | жёсткий |

Тема рулетки/расклада: aura, CTA, meters → CSS vars (`--accent`, `--roulette-*`).

## MediaProfile

- Furina secondary: censored + blacked (**Gelbooru bias / доп. теги**, не отдельный хост)
- Sunna: censored
- Sparkle: censored + blacked
- Cumplay prefetch учитывает `cumplayBiasTags`
- UX в хабе рулетки: «Gelbooru bias» — без обещаний `*.booru (скоро)`
