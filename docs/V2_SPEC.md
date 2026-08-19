/**
 * JOI Conductor — Phase 2 Spec
 *
 * Phase 1 = механика сессии (каталоги, runtime, бит, медиа, confirms).
 * Phase 2 = голос персонажа + умные пресеты поверх той же шины событий.
 * Phase 3 = 3D avatar (VRM) — только AvatarAdapter, без переписывания Conductor.
 */

# Phase 2 — Voice + Presets

## Цели

1. **Character bible** Ху Тао (тон, табу, diminutives, emoji) — данные, не код механики.
2. **LocalLlmVoice** (Ollama / OpenAI-compat) с тем же `VoiceLayer` интерфейсом.
3. **Roulette presets** (light / medium / heavy / feet / cei…) → фильтры `SessionParams`.
4. **Toys inventory** UI + `allowedToyIds` реально влияет на очередь.
5. Улучшить **special-pattern UX** (RLGL red/green banner, cluster bursts).

**Не в Phase 2:** Three.js / VRM / lip-sync (это Phase 3). Lovense Bluetooth — optional Phase 2.1.

---

## Архитектура (без ломки Phase 1)

```
SessionEventBus
   ├── SessionRuntime / BeatClock   (механика, уже есть)
   ├── VoiceLayer
   │     ├── TemplateVoice          (Phase 1, fallback)
   │     └── LocalLlmVoice          (Phase 2) → только speech events
   ├── AvatarAdapter
   │     ├── DebugAvatar            (Phase 1/2 stub)
   │     └── ThreeAvatar            (Phase 3)
   └── UI Stage / Media             (уже есть)
```

Правила те же:
- Voice **не** меняет BPM / queue / params
- Avatar **только** слушает bus
- Presets = пресеты params + allowed* ids, не отдельный runtime

---

## 2.1 Character bible

Файл: `data/character/hu-tao.json` (+ markdown notes в `docs/character/`).

```ts
interface CharacterBible {
  id: string;
  nameRu: string;
  locale: "ru";
  tone: string[];           // short style bullets
  taboo: string[];          // never say / never do
  diminutives: string[];
  emojiAllowed: boolean;
  systemPrompt: string;     // for LocalLlmVoice
  fallbackLines: Record<string, string[]>; // keyed by event type / goal
}
```

TemplateVoice может читать `fallbackLines` в Phase 2.1; LocalLlmVoice всегда получает `systemPrompt` + JSON блока.

---

## 2.2 LocalLlmVoice

```ts
class LocalLlmVoice implements VoiceLayer {
  constructor(opts: {
    endpoint: string;      // e.g. http://127.0.0.1:11434/v1/chat/completions
    model: string;
    bible: CharacterBible;
    /** If LLM fails → TemplateVoice */
    fallback: VoiceLayer;
  })
}
```

- Вход: `SessionEvent` (обычно `block_start` / `edge_request` / `finale_roll`)
- Выход: 0..N `{ type: "speech", text, emotion, gesture?, durationMs? }`
- Таймаут + abort на `block_end` / pause
- Никаких tool-calls, меняющих план

Settings UI (Сегодня): endpoint, model, enable LLM toggle.

---

## 2.3 Roulette presets

Файл: `data/presets.json`

```ts
interface SessionPreset {
  id: string;
  nameRu: string;
  descriptionRu: string;
  /** Partial SessionParams merged over DEFAULT_PARAMS */
  params: Partial<SessionParams>;
}
```

UI: чипы на «Сегодня» → apply preset → rebuild queue.

Примеры: `light`, `medium`, `heavy`, `anal_focus`, `feet_finish`, `denial`.

---

## 2.4 Toys + special UX

- `toys.json` заполнить реальным инвентарём (owned flags)
- Today: чекбоксы owned / allowed
- Session: для `special_rlgl` — красный/зелёный оверлей; cluster — «пауза» бейдж

---

## 2.5 Критерии готовности Phase 2

- [x] Bible загружается, TemplateVoice использует fallbackLines
- [x] LocalLlmVoice работает с Ollama offline; при ошибке → templates
- [x] ≥5 presets применяются к params (7: light…cei)
- [x] Toys filter реально сужает function pool
- [x] RLGL/cluster читаемы в Session UI
- [x] DebugAvatar показывает emotion/gesture из speech
- [x] Экспорт JSON включает voice mode + preset id

---

## Порядок работ (рекомендуемый)

1. Bible + DebugAvatar в Session HUD (этот prep уже кладёт stubs)
2. Presets JSON + UI chips
3. Toys owned UI
4. LocalLlmVoice + settings
5. Special-pattern banners
6. Polish TemplateVoice from bible

Phase 3 start only after LocalLlmVoice stable.
