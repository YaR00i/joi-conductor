# Hu Tao — character notes (Phase 2)

Source of truth: `data/character/hu-tao.json` (`systemPrompt` + tone/taboo/fallbackLines).

**Locale: English** — LLM lines and SoVITS TTS both use EN (no translate delay).

## Style (from bible)

- Teasing, mocking, playful degradation, dirty talk in English
- Short 1–2 sentence replies as JSON `{ text, emotion, gesture }`

## Mood phrase library (wired — phase 1)

File: `data/character/hu-tao-mood-lines.json`  
Types / picker: `src/lib/voice/moodLines.ts`  
Engine: `src/lib/moodEngine.ts`  
Voice: `TemplateVoice` uses `pickMoodLine` for all template speech.

Mood is a session-facing state (who she is right now). TTS `Emotion` on each line is how to speak it. Legacy `fallbackLines` remain as last-resort fallback only.

| Mood | RU | Flavor |
|------|----|--------|
| `sweet` | Добрая | Praise + soft degradation, possessive |
| `cruel` | Злая | Hard mock, denial, humiliation |
| `calm` | Спокойная | Cold short orders, almost no emoji |
| `chaotic` | Хаотичная | Whiplash jokes, unpredictable commands |
| `horny` | Возбуждённая | Raw body/cock focus |
| `bored` | Скучающая | Lazy contempt, “prove it” |

### Score → mood

| score | mood |
|------:|------|
| ≥ +2 | `sweet` |
| +1 | `horny` |
| 0 | `calm` |
| −1 | `bored` |
| −2 | `cruel` |
| ≤ −3 | `chaotic` |

Session starts at score `+2` (`sweet`). Early/on-time edge·ruin confirm raises score; late confirm / unauthorized lowers it. Mood shifts speak `mood_shift`.

When LLM is **off**, all narratable events (including `block_start`) come from the mood library. When LLM is **on**, block narration may still use the model; obedience / unauthorized / pause / skip / like / ready / mood_shift / prompts always use templates.

Regenerate JSON via `node scripts/generate-hu-tao-mood-lines.mjs` if you edit the script banks.

### Toy loadout (blocks / moves)

Toys are **not** randomly assigned per block from inventory.

1. Session starts with **empty** `equippedToyIds` → only hand / nipple / CBT / rest moves.
2. Mistress **equip** prompts («Засунь пробку» → Засунул / Не хочу / Промолчал).
3. On accept: toy enters loadout (slot-aware: anal / front / external — Edge 2 replaces plug).
4. **Remaining queue is rebuilt** so every following block only uses functions whose `requiresToys ⊆ equipped`, and **all equipped toys stay as modifiers** on those blocks.
5. Chip «На тебе» shows the current loadout.

Conductor: `src/lib/conductor.ts` + `src/lib/toyLoadout.ts`.

### Edge-ad

Mood-scaled **edge clusters**: several `edge` blocks in a row with short `rest` pauses between.

- Planned in `buildQueue` when mood is meaner / hornier (chance + size from `moodSessionBias.ts`).
- Also injectable mid-session via dare `edge_ad` or after accepting a «станьте злее» mood offer.
- Sweet/calm → rare, 2 edges, longer pauses; cruel/chaotic → common, 3–5 edges, short pauses.

### Hold / countdown / ladder

| Goal | Behavior |
|------|----------|
| **hold** | Timed hold-on-edge; confirm «Удержал ✓» only after timer |
| **countdown** | Stroke stretch; spoken 10…1 in the last seconds, then auto-advance |
| **ladder** | 3 tempo steps (slow→mid→fast) with tiny rests |

### Permission beg + finale bias

- Session starts with **2 beg credits** (chip «Beg»).
- Prompt kinds `permission` / `finale_bias` (and a **forced permission gate** before finale if credits remain).
- `beg_please` → +pCum; `beg_deny_want` / `finale_want_deny` → pCum=0 + post-session denial quest.
- Finale bias can stack toward cum / ruin / deny.

### Dice chaos

Dare `dice_chaos`: roll 1–6 → edge-ad / long rest / +edges / harsher rebuild / denial bias / soft mercy.

### Post-session denial quest

Like the cage pill: `pendingDenialHours` + optional edge quota → titlebar **Denial** pill (`denialQuest.ts`). Triggers from unauthorized cum, deny finale, beg-for-denial, dice denial bias.

### Mood offers + rebuild

Prompt kind **`mood_offer`** (tag «Настроение»):

| Example | Moods | Accept |
|---------|-------|--------|
| «Хочешь, я стану злее?» | sweet/calm | `mood_harsher` → score −2, more edges / less cum chance, **rebuild tail** |
| «Хочешь, я буду жёстче?» | horny/bored | same |
| «Хочешь, я стану добрее?» | cruel/chaotic/bored | `mood_softer` → score +2, softer params, rebuild |
| «Хочешь, я буду похотливее?» | sweet/calm | `mood_horny` → score → horny, rebuild |

Refuse = `mood_refuse` (no rebuild). Harsh accept often also splices an edge-ad.

### Mood biases (audit)

| Area | Mood effect |
|------|-------------|
| Wagers | good vs bad pools |
| Prompt kind roll | harsh → more dare/obey; soft → more feeling/wager |
| Dare / loyalty / obey / mood_offer cards | `moods[]` filter + weights |
| Timed dare seconds | shorter when cruel/chaotic |
| Cage hours | longer when harsh |
| Queue edge/ruin rates + edge-ad | `BuildQueueOptions.mood` |
| Precum / punishments | existing harsh checks |
| Cumplay lines | mood-aware text |

### Mid-session ruin

When `ruinsTarget > 0`, the conductor inserts `ruin_attempt` blocks mid-queue. Confirming «Руин ✓»:

1. Counts the ruin (`ruinsDone`).
2. Starts a **short mid cumplay ritual** (`context: "mid"`) — show drip → scoop/smell → «Продолжаем».
3. Session does **not** end; after the last step the queue advances and teasing continues.
4. Finale cumplay stays separate (`context: "finale"`) and still gates «Завершить».

### Unauthorized FAB (E / R / C)

Left FAB = edged / ruined / came **without** a command:

| Button | Flow |
|--------|------|
| **E** edge | Mood −2 → hands-off 30с + extra required edge(s) |
| **R** ruin | Mood −2 → **shame ritual** (`unauthorized`) → hands-off 45с + extra edge(s); ruin **not** counted |
| **C** cum | Mood −3 → **shame ritual** → hands-off 60с + **denial** (`pCum=0`) +2 edges |

### Precum play

After an authorized **edge/hold** confirm, or after a **heavy** segment (intensity ≥4, bpm ≥95, or strong vibe), a short **precum ritual** may gate (`context: "precum"`):

- show string / taste / smear as lube / drip catch / balls smear / smell (2 random commands + feeling + continue)
- Cooldown: at least 2 countable blocks between precum gates
- Mistress Q&A still wins if due on the same advance

### Post-finale cumplay ritual

After roulette lands on **cum** or **ruin** (not deny):

1. Finish target is spoken (`finish` event).
2. A multi-step **cumplay ritual** starts (`promptPhase: cumplay_ritual`):
   - open / show the mess
   - finish-specific command (feet / hand / face / …)
   - main cumplay from Today settings (+ forced eat if earlier promise)
   - feeling question
   - thank / hands-off close
3. **Завершить** stays locked until the ritual is `done`.
4. Deny skips ritual and unlocks immediately.

Library: `src/lib/cumplayRitual.ts` · catalog: `data/cumplay.json`.

## Mistress prompts (wired — phase 2–4)

File: `data/character/hu-tao-prompts.json`  
Loader: `src/lib/mistressPrompts.ts`

Every **2–4** countable blocks (not rest/finale), session gates on a question:

| Kind | RU tag | Answers | Effect |
|------|--------|---------|--------|
| **feeling** | Ху Тао спрашивает | Хорошо / Плохо / … | Mood ±1 |
| **wager** | Ставка | Да / Нет / Не отвечу | Media overlay on Да; mood ±1 |
| **confess** | Признайся | Fetish picks | Writes `fetishPrefs` (+like / −dislike) |
| **loyalty** | Лояльность | Стерплю / Не могу | Hands-off rest block on yes |
| **obey** | Послушание | Quiz | +2 / −2 mood; fail → rest |
| **dare** | Команда | Да / Нет → task | See dare tasks below |
| **equip** | Надень / вставь | Засунул / Не хочу / Промолчал | Loadout + rebuild queue |
| **mood_offer** | Настроение | Злее / Добрее / … | Big mood shift + **rebuild remaining queue** |
| **permission** | Умолять? | Умоляю / Не буду / Denial | Spends beg credit; biases finale / denial quest |
| **finale_bias** | Финал | Кончить / Руин / Denial | Tweaks `pCum`/`pRuin` |

### Dare tasks

| `taskType` | Flow |
|------------|------|
| `timed_report` | Да → countdown HUD → Успел / Провалил (or Сдаюсь); timer scaled by mood |
| `cage_hijack` | Да → mode=`chastity`, rebuild queue tail, `pendingCageHours` → post-session **Cage Timer** in titlebar |
| `cum_eat_promise` | Да → flag; after finale cum/ruin → dock «Съел / Не смог» before «Завершить» |
| `edge_ad` | Да → splice multi-edge sequence (short rests) into the queue |
| `dice_chaos` | Да → roll 1–6 chaos outcome (edge-ad / rest / rebuild / denial / …) |

Cage timer: `src/lib/cageTimer.ts` (localStorage). Pill: `CageLockPill` in titlebar — «Снял» clears.

**Wager pools by mood**
- **sweet / horny / calm** → `wagerGood`
- **cruel / chaotic / bored** → `wagerBad` (biased to dislikes from confess)

Spoken question is EN (`speakEn`). Buttons are RU.

### Mood deltas (answers)

| Effect | Δ score |
|--------|--------:|
| feeling_good / wager_yes / loyalty_yes / confess_like / dare_accept / equip_yes | +1 |
| obey_ok / dare_done / promise_done | +2 |
| feeling_bad / wager_no / loyalty_no / dare_refuse | −1 |
| confess_dislike | 0 |
| mute | −2 |
| obey_fail / dare_fail / promise_fail | −2 |