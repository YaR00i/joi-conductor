# JOI Conductor — V1 Spec (Phase 1)

Личный **дирижёр сессии**: каталог функций дрочки + BPM/паттерны + параметры финала.  
Персонаж (Ху Тао / 3D) **не входит в Phase 1**, но шина событий и слот UI уже рассчитаны на него.

Связанный, но отдельный проект: `fitness-coach` (упражнения). Сюда упражнения **не** переносятся.

---

## 1. Цели Phase 1

1. Зафиксировать каталог **функций**, **паттернов**, **finish**, **cumplay**.
2. Задать контракты данных для `SessionParams` → очередь `Block` → runtime.
3. Сделать **тест-UI** для проверки механики (без NSFW-аватара).
4. Заложить `SessionEvent` bus так, чтобы потом:
   - подключить voice templates → local LLM;
   - подключить 3D-модель (жест / рот / эмоция) к тем же событиям.

**Не в Phase 1:** персонаж, LLM, Lovense API, roulette-пресеты «heavy/feet», история в IndexedDB (можно простой JSON dump).

---

## 2. Архитектура

```
┌──────────────────────────────────────────────────────────┐
│ UI Shell                                                 │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│  │ ParamsPanel │  │ StageView    │  │ AvatarViewport  │ │
│  │ (editable)  │  │ block+BPM    │  │ STUB → 3D later │ │
│  └──────┬──────┘  └──────▲───────┘  └────────▲────────┘ │
│         │                │                   │           │
│         │         SessionEventBus ───────────┘           │
│         ▼                ▲                               │
│  ┌──────────────┐  ┌─────┴──────┐  ┌─────────────────┐  │
│  │ Conductor    │──│  Runtime   │──│ BeatClock       │  │
│  │ (build queue)│  │  (state)   │  │ (BPM + pattern) │  │
│  └──────────────┘  └─────┬──────┘  └─────────────────┘  │
│                          │                               │
│                   ┌──────▼──────┐                        │
│                   │ VoiceLayer  │  templates now /        │
│                   │             │  local LLM later       │
│                   └─────────────┘                        │
└──────────────────────────────────────────────────────────┘
                         ▲
                         │ load
              data/*.json (catalog)
```

### Принципы

| Правило | Смысл |
|--------|--------|
| Механика > речь | Числа, BPM, функция меняются только Conductor/Runtime/UI override |
| Voice read-only на план | VoiceLayer получает блок и пишет текст/emotion/gesture **не меняя** план |
| Avatar = consumer | AvatarViewport только слушает `SessionEvent`, ничего не решает |
| Три оси блока | `function` × `pattern` × `modifiers[]` (+ `mode`) |

---

## 3. Каталоги (источник правды)

Файлы в `data/`:

| Файл | Назначение |
|------|------------|
| `functions.json` | Способы стимуляции (stroke / vibe / cbt / nipples / anal thrust…) |
| `patterns.json` | Ритм-паттерны долей и спец-режимы (RLGL, cluster…) |
| `finish.json` | Куда кончить |
| `cumplay.json` | Что сделать со спермой после |
| `toys.json` | *(Phase 1.1)* инвентарь; пока пустой stub / optional |

Редактируются руками. Conductor только читает + валидирует совместимость.

---

## 4. Модель данных

### 4.1 Function

```ts
type SessionMode = "stroke" | "anal";

type FunctionCategory =
  | "stroke"
  | "vibe"
  | "nipple"
  | "cbt"
  | "anal"
  | "combo";

interface FunctionDef {
  id: string;
  name: string;
  nameRu: string;
  category: FunctionCategory;
  /** В каких session mode разрешена */
  modes: SessionMode[];
  intensity: 1 | 2 | 3 | 4 | 5;
  hands: "none" | "one" | "two";
  bodyFocus: Array<
    "shaft" | "head" | "balls" | "nipples" | "ass" | "mixed"
  >;
  /** Нужные toys (id из toys.json). Пусто = без игрушек */
  requiresToys: string[];
  /** Нельзя комбинировать в одном блоке */
  incompatibleWith: string[];
  /** Короткие cues для UI / voice */
  cuesRu: string[];
  /** Подсказка жеста для будущего аватара */
  avatarHint?: {
    gesture: string;   // e.g. "point", "count", "laugh"
    energy: 1 | 2 | 3;
  };
  enabled: boolean;
}
```

### 4.2 BeatPattern

```ts
type PatternKind =
  | "meter"      // обычный размер: 1-2, 1-2-2
  | "special";   // RLGL, cluster, accel…

interface BeatPatternDef {
  id: string;
  name: string;
  nameRu: string;
  kind: PatternKind;
  /** Для meter: доли такта. 1=слабая, 2=сильная (или просто акценты) */
  steps?: number[];
  /** Спец-параметры */
  params?: Record<string, number | string | boolean>;
  cuesRu: string[];
  enabled: boolean;
}
```

### 4.3 Finish / Cumplay

```ts
interface FinishDef {
  id: string;
  nameRu: string;
  tags: string[]; // e.g. ["feet","food"]
  enabled: boolean;
}

interface CumplayDef {
  id: string;
  nameRu: string;
  /** Порядок «лестницы» (ниже = мягче). null = вне лестницы */
  ladderRank: number | null;
  enabled: boolean;
}
```

### 4.4 SessionParams (редактируемые)

```ts
interface SessionParams {
  durationSec: number;
  mode: SessionMode;          // stroke | anal
  edgesTarget: number;
  ruinsTarget: number;        // 0 = без обязательных ruins
  pCum: number;               // 0..1
  pRuin: number;              // 0..1  (остаток → deny, нормализовать)
  finishId: string;
  cumplayId: string;
  bpmMin: number;
  bpmMax: number;
  blockSecMin: number;        // длина одного блока
  blockSecMax: number;
  allowedFunctionIds: string[]; // пусто = все enabled совместимые
  allowedPatternIds: string[];
  /** Phase 1.1 */ allowedToyIds?: string[];
}
```

**Finale roll:** после min edges (и optional ruins) или near end → `EDGE_HOLD` → roll:

- если `u < pCum` → `cum`
- else if `u < pCum + pRuin` → `ruin`
- else → `deny`

(при необходимости нормализовать `pCum+pRuin ≤ 1`).

### 4.5 Block (единица дирижирования)

```ts
type BlockGoal =
  | "stroke"         // просто следовать биту
  | "edge"           // дойти до края, подтвердить
  | "hold"           // удержать край N сек
  | "ruin_attempt"   // попытка ruined
  | "rest"
  | "finale";        // финальная инструкция

interface Block {
  id: string;
  durationSec: number;
  functionId: string;
  patternId: string;
  bpm: number;
  mode: SessionMode;
  modifiers: Array<{ toyId: string; role: string; intensity?: number }>;
  goal: BlockGoal;
  /** Для hold / edge */
  holdSec?: number;
}
```

Phase 1 Conductor может строить очередь **просто**:
- пока время не вышло и edges < target → случайный совместимый `stroke`/`edge` блок;
- затем `finale`.

Умные пресеты — Phase 2.

### 4.6 Runtime state

```ts
interface SessionState {
  status: "idle" | "running" | "paused" | "ended";
  params: SessionParams;
  queue: Block[];
  index: number;
  elapsedSec: number;
  edgesDone: number;
  ruinsDone: number;
  finaleOutcome?: "cum" | "ruin" | "deny";
  seed?: number;
}
```

---

## 5. SessionEvent bus (контракт для UI / Voice / Avatar)

Все подсистемы слушают один поток событий.  
Это ключ к будущей 3D-модельке: анимация = реакция на события, не отдельная логика.

```ts
type Emotion = "neutral" | "tease" | "strict" | "amused" | "intense" | "soft";

type SessionEvent =
  | { type: "session_start"; params: SessionParams; seed?: number }
  | { type: "session_pause" }
  | { type: "session_resume" }
  | { type: "session_end"; reason: "complete" | "abort" }
  | {
      type: "block_start";
      block: Block;
      function: FunctionDef;
      pattern: BeatPatternDef;
      index: number;
      total: number;
    }
  | { type: "block_end"; blockId: string }
  | {
      type: "beat";
      blockId: string;
      stepIndex: number;
      accent: number;     // из pattern.steps
      bpm: number;
      atMs: number;
    }
  | { type: "edge_request"; blockId: string }
  | { type: "edge_done"; total: number }
  | { type: "ruin_request"; blockId: string }
  | { type: "ruin_done"; total: number }
  | { type: "finale_roll"; outcome: "cum" | "ruin" | "deny" }
  | { type: "finish"; finishId: string }
  | { type: "cumplay"; cumplayId: string }
  | {
      type: "speech";
      text: string;
      emotion: Emotion;
      /** Для лип-синка / жестов позже */
      gesture?: string;
      durationMs?: number;
    }
  | { type: "counters"; edgesDone: number; ruinsDone: number; elapsedSec: number };
```

### VoiceLayer (Phase 1 = templates)

```ts
interface VoiceLayer {
  onEvent(event: SessionEvent): SessionEvent[]; // может эмитить speech
}
```

- Phase 1: `TemplateVoice` — словарь строк по `block_start` / `edge_request` / `finale_*`.
- Phase 2+: `LocalLlmVoice` — тот же интерфейс; на вход JSON блока + character bible; на выход только `speech` events.

**Запрет:** VoiceLayer не эмитит `block_start`, не меняет BPM/params.

### AvatarViewport (Phase 1 = stub)

```ts
interface AvatarAdapter {
  onEvent(event: SessionEvent): void;
}
```

- Phase 1: `DebugAvatar` — показывает emotion/gesture/text в панели.
- Later: `ThreeAvatar` — blendshapes / lip-sync / idle по `beat` и `speech`.

Stage и Avatar **оба** подписаны на bus → можно крутить механику без модели, потом вставить модель без переписывания Conductor.

---

## 6. UI Phase 1 (факт реализации)

Продуктовый shell (не лабораторный трёхколоночный макет из черновика):

```
SideNav: Сегодня | Сессия
┌─────────────────────────────────────────────┐
│ Сегодня: params, presets chips, media, queue │
│ Сессия: media stage + instruction + beat bar │
│         confirm dock · FABs · AvatarStub HUD │
└─────────────────────────────────────────────┘
```

Поток старта: **3-2-1 → медиа-разогрев → «Готов» → биты**.

### Обязательные контролы

- Edit params до старта (+ presets Phase 2 prep).
- Start / Pause / Abort / Ready (warmup).
- Confirm Edge / Confirm Ruin (+ unauthorized E/R/C).
- Skip block / Force finale / Export JSON.
- Mute metronome.
- Seed для повторяемости.

### Визуал бита

FI-style highway (шарики R→L, удар по центру) + Web Audio tick.

---

## 7. Conductor Phase 1 — алгоритм

Вход: `SessionParams` + catalogs + optional `seed`.

1. Отфильтровать functions: `enabled`, `modes` содержит `params.mode`, toys ok (пока requiresToys пустые или игнор).
2. Отфильтровать patterns: `enabled`.
3. Пока `elapsed < duration` и (edges < target или время > 80%):
   - выбрать random function + pattern + bpm ∈ [bpmMin, bpmMax];
   - duration ∈ [blockSecMin, blockSecMax];
   - goal: с весом (например 75% stroke, 20% edge, 5% rest) пока edges < target; если нужен edge — периодически `edge` / `hold`.
4. Добавить `finale` block → runtime делает roll → emit finish + cumplay.
5. Emit `session_end`.

**Anal mode:** function pool = `modes` includes `"anal"` (в каталоге `anal_thrust` и совместимые combo). Бит = thrust cue, не hand stroke.

---

## 8. Стек Phase 1

- **TypeScript + Vite + React** (удобный путь к Three.js / R3F позже).
- Каталоги: JSON в `/data`, импорт в код.
- Без бэкенда.
- Состояние сессии в памяти; кнопка «Export session JSON».

Позже (не блокирует Phase 1): Electron-оболочка как у fitness-coach, IndexedDB.

---

## 9. Критерии готовности Phase 1

- [x] Каталоги загружаются, типы валидны.
- [x] Можно задать params и запустить сессию.
- [x] Блоки сменяются, BPM тикает, accent слышен/виден.
- [x] Edge/Ruin counters работают (+ unauthorized punishment).
- [x] Finale roll → finish + cumplay (speech + state.finaleOutcome).
- [x] Event log буфер → Export JSON.
- [x] Avatar stub (DebugAvatar HUD) отражает speech / emotion / gesture.
- [x] Skip / force finale / mute / seed работают.
- [x] Preflight: 3-2-1 → warmup media → Ready.
- [x] Документ `V1_SPEC.md` совпадает с кодом (см. также `V2_SPEC.md`).

**Сознательно не «done» в Phase 1 (перенесено):** mid-session param override UI, полный special-pattern banner UX, IndexedDB.

---

## 10. Что сознательно отложено

| Тема | Когда |
|------|--------|
| Ху Тао character bible | Phase 2 voice |
| Local LLM (Ollama) | Phase 2+ VoiceLayer |
| Полный toys.json + Lovense | Phase 1.1 / 2 |
| Roulette presets | Phase 2 |
| 3D VRM / lip-sync | Phase 3 AvatarAdapter |
| Minecraft / chastity long-run | позже |
| Связка с fitness-coach | никогда в одном runtime |

---

## 11. Именование

- Пакет / папка: `joi-conductor`
- Runtime: `SessionRuntime`
- Планировщик: `Conductor`
- UI: `ConductorLab`
