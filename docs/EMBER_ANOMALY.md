# Ember Anomaly — Game Design Spec

Отдельный игровой модуль внутри **JOI Conductor**: Vampire Survivors–арены + сюжетный хаб с аномалиями.
Награды пишутся в тот же кошелёк **угольков (cinders)**.

**Текущее решение:** не строим все режимы сразу. Сначала доводим **один playable vertical-slice cycle**:
`карта → арена → win/lose → угольки → сцена → возврат`, параллельно ускоряя авторский пайплайн редактора и ассетов.

Госпожи = существующие packs (`hu_tao`, `furina`, `sunna`, `sparkle`), но для публичных материалов Hu Tao остаётся **прототипом / референсом**, а наружу нужен OC-эквивалент.

**Текущий стек:** Three.js + TypeScript (`src/game/three/`), оболочка React/Electron. `src/game/phaser/` сохранён как legacy/reference и не является активным runtime.
Level-up / сундуки / диалоги — React-оверлеи поверх canvas (переиспользуем эстетику рулетки).

**Связанные доки:** [AI handoff и архитектурный контракт](EMBER_AI_HANDOFF.md), [wallet / угольки](../src/lib/wallet.ts), [mistress packs](mistress-packs.md), [Hu Tao bible](character/hu-tao.md).

---

## 0. Концепт (зафиксировано)

### Два слоя

| Слой | Что это | Визуал |
|------|---------|--------|
| **Arena (Survivor)** | Top-down / лёгкая изометрия, орды, XP, оружие, боссы по таймеру | **Пиксель** (тайлы, спрайты врагов, героиня в бою, VFX) |
| **Story / Events** | Хаб-локации, диалоги, эро-ивенты, позже стелс/пазлы | **Аниме-арт**: портреты госпож, уникальные splash / CG ивентов |

### Фантазия

ГГ попадает в **Угольный Кондуит** — измерения госпож, которые пытаются его привязать.  
На карте госпожи — **аномалии-порталы**. Прохождение survivor-стадии ломает слой защиты.  
После серии порталов — confrontation / сцена.  
На арене играется **госпожа** (отбивается от «извращенцев»-монстров); в сюжете камера/аватар — **ГГ-мальчик**, где уместно.

### Экономика

Прохождение стадии / чекпоинты / ивенты → **угольки** → существующий магазин / разлоки Conductor.

### Дальняя фантазия (заметки, не текущий scope)

- Survival-арены, сюжетный хаб, аномалии-порталы, сцены как reward за mastery.
- Позже: несколько госпож, stealth / puzzles, более длинный story hub, gallery, Live2D bust.
- Референсы по ощущению: **Sinful Survivors**, **HoloCure**, **Scarlet Maiden**, **HuniePop** (сцены как награда за прогресс).
- Тон: cartoonish / playful, без ухода в тяжёлый реализм.

### Текущая рамка

| Решение | Что значит |
|---------|------------|
| **One cycle first** | Довести один полный путь игрока от выбора/карты до награды, сцены и возврата. |
| **Editor first-class** | Если контент нельзя быстро править без кода, это блокер P1, а не «потом». |
| **Asset velocity** | Воксельный редактор, библиотека ассетов и быстрый edit → save → playtest важнее расширения режимов. |
| **Hu Tao = prototype** | Можно использовать локально как рабочий pack; для публичного релиза нужен OC, чтобы убрать IP-риск. |

### Фазы (дорожная карта)

| Фаза | Цель |
|------|------|
| **1 — Vertical Slice сейчас** | 1 арена + 1 playable cycle + редактор контента enough-to-iterate + угольки + демо-сцена |
| 2 — Slice polish / Meta | Больше оружия/пассивов, разлоки, endless, баланс |
| 3 — Story hub v0 | 1 компактная локация, порталы, базовые события |
| 4 — Госпожа #2 + разнообразие стадий | Только после стабильного цикла и пайплайна |
| 5 | Live2D bust / стелс / длинный сюжет (опционально) |

Дальше в этом файле — **только Phase 1**, с упором на данные, редактор и asset workflow.
Дальняя фантазия хранится как direction notes, но не расширяет текущий scope.

---

## 1. Phase 1 — Vertical Slice: цели

Собрать **играбельный вертикальный срез** и **инструменты**, чтобы контент (карты, стадии, сцены, ивенты, splash, простые ассеты) правился **без кода**.

Ключевой цикл P1:

```
Map / entry point → Arena run → win/lose result →
  credit cinders → run scene/event → return to shell/editor
```

Цель ближайших недель — не «добавить все режимы», а сделать этот цикл приятным, воспроизводимым и быстрым для автора.

### Must ship

1. Одна playable арена (Ху Тао), top-down с объёмными стенами; слой `height` (стены 0/1+), слой `elevation` (пол Z), рампы/лестницы, прыжок (Space), teleport-зоны, ночной ambient + лампы.
2. Орда + автоатака + движение; XP → level-up рулетка; сундук-лут.
3. Таймер стадии; **мини-босс ~5:00**; clear / fail.
4. Strip tiers (оголение от урона) + хотя бы один debuff «пачкает / замедляет».
5. Награда угольками в `wallet` при clear (и урезанная при fail — по желанию).
6. **Content Editor** (dev / desktop): карты, стадии, сцены, ивенты, splash-арт регистрация.
7. Один демо-ивент после clear (портрет + CG + простой выбор) — proof пайплайна «аниме поверх пикселя».

### Explicitly NOT now / out of Phase 1

- Полноценный сюжетный хаб / сложная карта мира
- Стелс / головоломки / отдельные adventure-механики
- Вторая госпожа как playable
- Несколько параллельных режимов игры
- Live2D  
- Онлайн, лидерборды  
- Баланс «навсегда» (цифры — плейсхолдеры в JSON)  
- Полный gallery / gallery unlock UI (достаточно data-ready)
- Публичный IP-риск на Hu Tao: для релиза нужен OC / заменённые ассеты и тексты

---

## 2. Геймплей арены (P1)

### 2.1 Loop

```
Map / play entry → Arena run → (level-up / chest roulette) →
  @5:00 mini-boss → time/goal clear OR death →
  Result → cinders → Event scene → back to shell/editor
```

### 2.2 Параметры стадии (данные)

Хранятся в content pack, не в коде:

| Поле | Пример P1 |
|------|-----------|
| `durationSec` | 900 (15 мин) или короче для теста 300 |
| `bossAtSec` | 300 |
| `playerMistressId` | `hu_tao` |
| `mapId` | `maps/hu_tao_yard` |
| `spawnTableId` | `spawns/hu_tao_p1` |
| `weaponPoolId` | `pools/p1_weapons` |
| `chestPoolId` | `pools/p1_chests` |
| `cindersClear` / `cindersFail` | 25 / 5 |
| `onClearEventId` | `events/hu_tao_clear_demo` |

### 2.3 Игрок

- Движение WASD / stick; атаки автоматические от экипированных оружий.
- Старт: 1 оружие (например «Бабочка Ху Тао» — орбита / веер снарядов).
- Max оружий / пассивов в P1: **4 + 4** (как упрощённый VS).

### 2.4 Strip & status

| Система | P1 поведение |
|---------|----------------|
| **Strip tiers** | 0..3. Урон (и опц. «grab» атака) повышает tier. Каждый tier = другой sprite layer / набор кадров. |
| **Filth / slime** | Статус: `moveSpeedMul < 1`, визуал пятен на спрайте или overlay; снимается временем или пикапом «очищение». |
| Смерть | HP → 0; strip max сам по себе не убивает (но может давать vulnerability mul). |

### 2.5 XP / лут-казино

- Гемы XP на земле → level-up → **React roulette** (3–4 варианта: оружие / upgrade / пассив / heal).
- Сундук → отдельная roulette с весами редкости (common/rare/epic) — визуально как существующая ChoiceRoulette.
- Пулы и веса — JSON в content pack.

### 2.6 Враги (минимальный набор P1)

| Id | Роль |
|----|------|
| `perv_walker` | базовая орда |
| `perv_runner` | быстрые |
| `slime_spitter` | ranged + накладывает filth |
| `grabber` | ближний, сильный strip damage |
| `boss_tourist` | мини-босс @5:00 |

Спавн по timeline / density curve в `spawnTable`.

### 2.7 Карта арены

- Тайловая карта из редактора (коллизии, spawn regions, safe/player start, chest spots, decor).
- Размер P1: порядка 64×64 — 96×96 тайлов (уточняется в редакторе).
- Камера следует за игроком; край карты = clamp или soft wall.

---

## 3. Визуальный стиль (P1)

| Слой | Стиль | Форматы |
|------|-------|---------|
| Тайлы, враги, VFX, HUD-пиксель | Pixel art, единый PPU (напр. 16 или 32) | PNG spritesheet / atlas |
| Героиня **в бою** | Pixel, наборы кадров на strip tier | spritesheet + `anim` json |
| Аватары в сценках | Аниме-портреты госпожи (mood / expression keys) | PNG/WebP |
| Уникальные ивенты | Полноэкранный / panel **CG splash** | PNG/WebP, регистрируется в editor |
| UI оболочки (рулетка, результат) | Существующий Conductor chrome + theme tokens госпожи | React CSS |

Правило: **в canvas Phaser — только пиксель**. Аниме-арты рисует React поверх / в scene player.

---

## 4. Сцены и ивенты (P1 data model)

Даже с одним демо-ивентом модель должна покрывать редактор.

### 4.1 Определения

- **Scene** — упорядоченный граф шагов (диалог, показ CG, выбор, флаг, выдача угольков, конец).
- **Event** — триггер + ссылка на scene (после clear, при заходе в зону, по флагу…). В P1 достаточно триггера `on_stage_clear`.
- **Splash art** — именованный ассет + мета (госпожа, NSFW flag, thumb).

### 4.2 Scene step kinds (P1)

| `type` | Поля | UI |
|--------|------|-----|
| `dialogue` | `speaker`, `portraitKey`, `textRu`, `voiceLineId?` | Портрет + текст |
| `splash` | `artId`, `captionRu?` | Показ CG |
| `choice` | `promptRu`, `options[{ id, labelRu, next, setFlags? }]` | Кнопки |
| `set_flag` | `flag`, `value` | invisible |
| `grant_cinders` | `amount` | toast |
| `end` | `nextEventId?` | закрыть player |

Линейный граф + ветки через `next` / choice. Без скриптового языка в P1.

### 4.3 Пример демо-ивента

`events/hu_tao_clear_demo` → scene:

1. `dialogue` Ху Тао (smug) — подкол за «выживание»  
2. `splash` — CG (плейсхолдер ok)  
3. `choice` — две реплики ГГ → разные `dialogue`  
4. `grant_cinders` +5  
5. `end`

---

## 5. Content Editor (P1 — отдельный объём работ)

Редактор — **first-class** часть Phase 1, не «потом».  
Запуск: пункт меню Electron вроде **«Ember Editor»** (только desktop / dev flag), не смешивать с JOI-сессией.

### 5.1 Принципы редактора

| Принцило | Смысл |
|----------|--------|
| Data-driven | Игра читает только JSON + файлы ассетов из content pack |
| Hot reload | Сохранил карту/сцену → можно сразу Playtest без полного rebuild |
| Validate on save | Сломанные ссылки (`mapId`, `artId`, `portraitKey`) — ошибки в панели, не тихий fail в рантайме |
| Non-destructive | Ассеты лежат в `content/ember/…`; git-friendly |
| Playtest from editor | Кнопка «Play stage» / «Play scene» поднимает runtime с выбранным id |

### 5.2 Структура content pack

```
content/ember/
  pack.json                 # version, mistress defaults
  maps/
    hu_tao_yard.json        # tile layers + collision + regions
  tilesets/
    graveyard_16.json
    graveyard_16.png
  sprites/
    hu_tao_player/
    enemies/
  stages/
    hu_tao_p1.json
  spawns/
    hu_tao_p1.json
  pools/
    p1_weapons.json
    p1_chests.json
  arts/
    registry.json           # splash / CG metadata
    files/…
  portraits/
    hu_tao/                 # expression keys → files
  scenes/
    hu_tao_clear_demo.json
  events/
    hu_tao_clear_demo.json
```

В проде pack копируется/бандлится в asar или `resources/ember`; в dev — путь на диск (удобно править).

### 5.3 Модули редактора

#### A. Asset Browser

- Импорт PNG/WebP в нужную папку (tileset / sprite / art / portrait).
- Превью, теги (mistressId, nsfw, tags).
- Регистрация splash в `arts/registry.json` (id, path, size, mistressId, nsfw).

#### B. Tileset Editor (минимальный)

- Нарезка листа → tile size, collision flags per tile (solid / free / slow?).
- P1 можно упростить: collision рисуется отдельным слоем на карте, tileset только visual + auto solid mask.

#### C. Map Editor ← основной кусок работы

Обязательный функционал P1:

| Фича | Зачем |
|------|--------|
| Слои: ground / decor / collision / height / elevation | База + стены + пол Z |
| Кисть, ластик, fill, eyedropper | Рисование |
| Grid + zoom + pan | Навигация |
| Collision paint (отдельный слой) | Физика |
| **Regions** (полигон или rect): `player_start`, `spawn`, `chest`, `trigger`, `camera_bound` | Геймплейные якоря |
| Properties панели для region (id, spawnGroup, weight) | Связь со spawn table |
| Place **entity stamps** (опц.): декоративные props с z-sort | Атмосфера |
| **Bottom library tray** (DnD спрайты / свет / зоны / тайлы на карту) | Быстрый штамп ассетов |
| Undo / redo | Must |
| Save / load JSON карты | Must |
| **Playtest**: заспавнить игрока на `player_start` | Must |

**Trigger `scriptId` (stub):** у region `kind: "trigger"` поля `scriptId` / `note` пишутся из библиотеки как заглушка под будущий runtime скриптов. Пока не исполняются.

Желательно в P1, если успеется:

- Multi-select regions  
- Copy/paste chunk тайлов  
- Snap guides  
- Minimap  

Не в P1: автотайлинг wang, procedural brush, высота/3D.

**Формат карты (черновик):**

```json
{
  "id": "hu_tao_yard",
  "tileSize": 16,
  "width": 80,
  "height": 80,
  "tilesetId": "graveyard_16",
  "layers": [
    { "name": "ground", "type": "tile", "data": [] },
    { "name": "decor", "type": "tile", "data": [] },
    { "name": "collision", "type": "tile", "data": [] },
    { "name": "height", "type": "tile", "data": [] },
    { "name": "elevation", "type": "tile", "data": [] }
  ],
  "regions": [
    { "id": "start", "kind": "player_start", "x": 40, "y": 40, "w": 2, "h": 2 },
    { "id": "spawn_n", "kind": "spawn", "group": "north", "x": 10, "y": 2, "w": 60, "h": 4 }
  ]
}
```

**Semantic tile fields (optional):** тайлы в tileset могут задавать `slow` (`true` или `{ "multiplier": 0.7 }`), `stain` (`true` или `{ "kind": "filth", "durationMs": 2500 }`), `hazard` (`true` или `{ "damage": 6, "stripDamage": 0, "intervalMs": 800 }`), `portal` (`true` или `{ "targetMapId": "...", "targetRegionId": "...", "targetX": 1, "targetY": 2, "cooldownMs": 500 }`) и `trigger` (`true` или `{ "eventId": "...", "scriptId": "...", "once": true, "note": "..." }`). Сейчас runtime легко обрабатывает `slow` / `stain` / `hazard`; `portal` / `trigger` — authoring metadata под будущие tile-based системы.

#### D. Stage Editor

- Привязка `mapId`, duration, bossAt, pools, cinders, `onClearEventId`.
- Превью timeline спавна (density keyframes).
- Кнопка Playtest stage.

#### E. Spawn Table Editor

- Timeline: time → enemyId → count → region group → interval.
- Preview curve (simple chart).

#### F. Pool Editor (weapons / chests)

- Список entry: `itemId`, weight, rarity, minLevel.
- Ссылка на существующие def (оружия пока в `data/weapons.json`).

#### G. Scene / Event Editor ← второй крупный кусок

| Фича | Детали |
|------|--------|
| Список сцен / ивентов | CRUD |
| Graph или ordered list шагов | P1: вертикальный список + `next` id достаточно; визуальный node-graph — nice-to-have |
| Step inspector по `type` | portrait picker, art picker, text, choices |
| **Portrait picker** | превью из `portraits/{mistress}/` |
| **Splash picker** | превью из arts registry |
| Choice branches | список options → next step |
| Validate | битые next / artId |
| **Scene Playtest** | прогон player без арены |
| Event bindings | trigger type + stageId filter |

#### H. Splash / Art desk

- Upload + crop guides (16:9 / 4:3 / portrait panel).
- Metadata: NSFW toggle, mistress, notes.
- Используется Scene Editor’ом.

### 5.4 Editor UX shell

```
┌────────────────────────────────────────────────────────────┐
│ Ember Editor          [Pack ▼]  [Validate]  [Playtest ▼]   │
├──────────┬─────────────────────────────────────┬───────────┤
│ Maps     │                                     │ Inspector │
│ Stages   │         Canvas / Form workspace     │           │
│ Spawns   │                                     │           │
│ Pools    │                                     │           │
│ Arts     │                                     │           │
│ Scenes   │                                     │           │
│ Events   │                                     │           │
│ Assets   │                                     │           │
└──────────┴─────────────────────────────────────┴───────────┘
```

Редактор = React UI; map canvas может быть:

- **Phaser** в editor-mode (те же тайлы, что в игре), или  
- **Pixi / canvas2d** только для рисования тайлов.

Предпочтение: **один tiles renderer** shared между game и editor → меньше рассинхрона.

### 5.5 Почему редактор — «немало работы»

Честный scope внутри P1:

| Подсистема | Оценка сложности |
|------------|------------------|
| Map editor (layers, brush, regions, undo, save) | **Высокая** |
| Shared tile render + collision sync | Средняя–высокая |
| Scene/Event editor + playtest | Средняя |
| Asset registry + splash desk | Средняя |
| Stage/Spawn/Pool forms | Низкая–средняя |
| Validation + hot reload | Средняя |
| Arena runtime (VS loop) | Высокая (отдельно) |
| Strip / status / roulette bridge | Средняя |
| Wallet hook | Низкая |

P1 сознательно режет **сюжетный хаб**, чтобы бюджет ушёл в **runtime арены + editor**. Без editor контент снова упрётся в разработчика — это противоречит цели «чтобы я сам мог делать».

### 5.6 Editor acceptance (Definition of Done)

Автор (ты) без правок TypeScript может:

1. Нарисовать/поправить карту `hu_tao_yard`, сохранить, playtest.  
2. Завести/поменять spawn timeline и пройти мини-босса на 5:00.  
3. Импортировать CG, зарегистрировать splash, вставить в сцену.  
4. Собрать ветвящийся ивент (2 choice), playtest сцены.  
5. Привязать ивент к `onClear` стадии и увидеть его после победы.  
6. Получить угольки на кошелёк Conductor.

### 5.7 Near-term editor priorities

Синхронизировано с кодом 2026-08-20. Текущий фокус — надёжный Unity/Blender-подобный каркас мира; расширение контента идёт после него.

| Приоритет | Что сделать | Почему сейчас |
|-----------|-------------|---------------|
| **1. Unified Transform / Scale — готово** | Записываемый Scale X/Y/Z, связанный/раздельный ввод, gizmo, snap/reset, Renderer/Collider/outline/light pivot, группы и multi-selection вокруг общего pivot, live preview, undo/redo. | Закрыто 2026-08-20 как общий `WorldObject`/Inspector-контракт. |
| **2. Selection + placement — готово** | Фильтры viewport, locked/hidden, pick-cycle, явный multi-selection, общий Z/Drop/Lock/Hide/Delete, единый target Surface / Drop to Floor / Grid Z, серийная установка и invalid ghost с причиной. SpritePlacement имеет authored Z в editor/runtime/collision/light. | Закрыто 2026-08-20 как единый selection/placement contract. |
| **3. Creative mode** | Walk/fly от первого лица, raycast place/remove, hotbar библиотеки, свет и trigger volumes через общий CommandStack. | Даёт Minecraft-подобный быстрый способ сборки, не создавая второй редактор данных. |
| **4. Gameplay semantics** | Tile `portal`/`trigger` runtime, `scriptId`, `camera_bound`, единая диагностика trigger → event → action. | Региональные teleport и `on_region_enter` уже работают; нужно закрыть оставшиеся разрывы runtime. |
| **5. Asset library 2.0** | Tags/categories, bulk actions, usage references, безопасный rename/import, быстрые переходы в редакторы. | Нужны переиспользование и контроль зависимостей при росте пака. |
| **6. Balance editors** | Pool / Weapon / Enemy UI + playtest from editor. | Runtime уже читает JSON; формы нужны после стабилизации редактора мира. |

Уже закрытая база: `EditorCore`/CommandStack, единый `EmberWorldObject`, компонентный Inspector, Outliner и группы, библиотечная постановка, pick-cycle, воксельные prefab/variant/material/chest workflows, высотная физика и плавное падение. Региональные телепорты и события `on_region_enter` исполняются в runtime; tile-based `portal`/`trigger` и прямой `scriptId` пока нет. Этап производительности закрыт текущим профилем: terrain worker/chunks, voxel instancing, merged terrain, light streaming/budgets, batched debug overlays и reflection scheduling; повторный аудит нужен на большой наполненной карте.

Перед Creative mode закрыта стабильность динамического света (2026-08-20): retained object lights сохраняют яркость/animation state при смене streaming-окна; runtime flicker меняет видимый cutoff внутри заранее запечённого объёма и не пересобирает cube depth каждый кадр; static PointLight shadow bake временно расширяет сам `PointLight.distance` до 1.5 authored radius, потому что Three.js иначе перезаписывает `shadow.camera.far` текущим cutoff перед рендером. После bake живой радиус возвращается, а полная cube-depth карта и её decode range сохраняются. В локальные карты входят только статические объекты слоя 0; игрок и враги исключены. Редактор автоматически инвалидирует bake после правок геометрии/света и имеет ручную кнопку «Пересчитать статические тени». Bias/near приведены к масштабу вокселя, чтобы не терялась самотень. Вариант с динамическими cube maps был отклонён как слишком дорогой (~1880 draw calls уже при четырёх врагах).

Повторный crowd-аудит runtime начат 2026-08-20. Этап 1 закрыт: PointLight cube shadows теперь запекают только статический слой мира и не пересчитываются от движения толпы; игрок/враги остаются в плавной направленной тени, а пули, XP и orbit-эффекты не являются дорогими shadow casters. Этап 2 закрыт: одинаковые враги собраны в плотные runtime `InstancedMesh`-батчи по enemy visual key со swap-remove и общей alpha-cutout тенью. Этап 3 закрыт: voxel props, модели chest-регионов и solid sprites живут в постоянном tile-bucket collision index; движение запрашивает только соседние кандидаты с allocation-free дедупликацией, сохраняя точную проверку voxel-колонок, Scale и вертикального clearance. Этап 4 закрыт: AI/физика врагов работают fixed-step 30 Hz, а billboard-поза и направленная тень интерполируются на каждом render frame; отдельный переиспользуемый spatial hash обслуживает bullets, nova, orbit и nearest-target без полного прохода по `actors`. Этап 5 закрыт: bullets, XP gems и orbit сведены в четыре не отбрасывающих тень instanced-батча, transient Actor/proxy переиспользуются через pool, а общие `actors.filter()` заменены плотными списками со swap-remove. В dev добавлен воспроизводимый stress-mode: `F4` = 120 врагов, `Shift+F4` = 180 и неуязвимость. Этап 6 закрыт: combat/contact остаются 30 Hz, но дорогие `moveWithVoxels` распределяются по distance/crowd LOD на 10–15 Hz с индивидуальной фазой и накопленным travel time; уже касающиеся игрока melee не вызывают лишнюю map-физику, а render-поза интерполируется на протяжении своего LOD-интервала. Этап 7 закрыт: локальное separation steering использует тот же spatial hash, учитывает максимум 12 соседей, симметрично раздвигает даже совпавшие позиции и смешивается с направлением погони до единственной map-физики. Для экстремальных >160 врагов movement LOD снижается до 7.5 Hz. Финальный stress на 180 врагах: CPU 14.6 ms, GPU 3.7 ms, ~536 draw calls; толпа визуально распределена, ошибок консоли нет. Обычная волна до 16 врагов остаётся full-rate и показывает около 6 ms CPU. Crowd/runtime pass закрыт; следующий этап по roadmap — Creative Mode.

Текущие реальные точки кода: `src/pages/EmberEditorPage.tsx`, `src/components/ember/editor/MapEditorPanel.tsx`, `src/components/ember/editor/VoxelSculptPanel.tsx`, `src/components/ember/editor/StageEditorPanel.tsx`, content pack в `content/ember/`.

---

## 6. Техническая архитектура (P1)

```
┌─────────────────────────────────────────────────────────────┐
│ Electron shell (JOI Conductor)                              │
│  SideNav → «Аномалия» (play) / «Ember Editor» (author)      │
│                                                             │
│  ┌────────────────────┐   ┌──────────────────────────────┐  │
│  │ React Shell        │   │ Phaser Game (src/game)       │  │
│  │  Result / Roulette │◄─►│  ArenaScene, systems         │  │
│  │  ScenePlayer       │   │  reads content/ember         │  │
│  │  Wallet credit     │   └──────────────────────────────┘  │
│  └────────────────────┘                                     │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Ember Editor (React + shared tile view)                │ │
│  │  writes content/ember/**                               │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Модули кода (предложение)

```
src/game/
  phaser/           # config, ArenaScene, entities, systems
  content/          # loaders + zod/types для JSON
  bridge/           # events → React (levelUp, chest, scene, result)
src/pages/
  EmberPlayPage.tsx
  EmberEditorPage.tsx
src/components/ember/
  LevelUpRoulette.tsx
  ScenePlayer.tsx
  editor/           # MapEditor, SceneEditor, …
content/ember/      # data pack (git)
```

### Bridge события (черновик)

`ember:level_up` · `ember:chest` · `ember:pause` · `ember:stage_result` · `ember:run_scene` · `ember:grant_cinders`

---

## 7. Балансные плейсхолдеры P1

Не догма — крутилки в JSON:

- HP игрока: 100; hit → 8–15; filth slow: ×0.7 на 2–4s  
- Strip: каждые ~25% потерянного HP max → +1 tier (или отдельный strip HP)  
- XP to level: кривая мягкая, первые 6 level-up за 2–3 минуты  
- Boss @5:00: телеграф-атаки, 2 фазы max  
- Cinders clear: 20–40 (настраивается в stage)

---

## 8. Порядок реализации Phase 1

### Now — редактор мира

1. **Unified Transform / Scale:** Renderer + Collider + Inspector + gizmo + группы/multi-selection + live preview + undo/redo. *(Готово 2026-08-20.)*
2. **Selection / placement pass:** фильтры, lock/hide, multi-edit, Surface / Floor / Grid Z, Serial и invalid reason. *(Готово 2026-08-20.)*
3. **Creative walk/fly:** использует тот же `EditorCore`, Selection, Library и команды сохранения.
4. **Gameplay semantics:** tile portal/trigger, region `scriptId`, `camera_bound`, debug chain.
5. **Asset Library 2.0:** tags, usage references, bulk rename/import, dependency-safe navigation.

### Next — playable и баланс

1. Pool / Weapon / Enemy UI поверх существующих JSON.
2. Отполировать короткий map/stage playtest и возврат в тот же editor context.
3. Отполировать playable cycle: результат, cinders, сцена, возврат, подсказки.
4. Добавить 2–3 tile hazards, enemy variant, chest/voxel prop и улучшенную сцену.
5. Повторить performance-аудит на максимальной целевой карте и контентной плотности.

### Later

1. Story hub v0.
2. Вторая госпожа / второй pack.
3. Stealth / puzzles / длинные narrative systems.
4. Live2D / gallery / meta-progression beyond slice.

---

## 9. Открытые решения (решить в P1, не блокирует старт)

| Вопрос | Варианты | Наклон |
|--------|----------|--------|
| Tile size | 16 vs 32 | 16 — плотнее орды; 32 — проще рисовать |
| Strip: от общего HP или отдельный meter | linked / separate | linked проще для MVP |
| Editor map backend | Phaser vs Pixi | Phaser shared с игрой |
| Где хранить pack в prod | `resources/ember` vs userData | userData — если хочешь моды; resources — ship default |
| Смерть на арене | soft fail + ивент стыда / hard fail | soft fail лучше для JOI-тона |

---

## 10. Phase 1 checklist

Состояние на сейчас: база playable slice и editor уже сильно продвинута, но следующий риск — не «нет идей», а расползание scope и медленное производство контента.

**Runtime**

- [x] Phaser arena boot from Electron page  
- [x] Hu Tao pixel player + 3 strip tiers  
- [x] 4 enemy types + 1 boss  
- [x] XP, level-up roulette, chest roulette  
- [x] Filth slow status  
- [x] Timer + boss (shortMode ~45s / full stage.bossAtSec)  
- [x] Result screen → cinders  

**Content / Editor**

- [x] Pack layout on disk (`content/ember/`)  
- [x] Map editor (layers, collision, regions JSON, undo, save)  
- [x] Stage + spawn editors (pools — JSON in pack; UI later)  
- [x] Splash art registry  
- [x] Scene editor + scene playtest  
- [x] Validation panel  
- [x] Demo stage + demo clear event playable end-to-end  

**Integration**

- [x] Nav entries: «Аномалия» / «Ember Editor»  
- [ ] Theme tokens Hu Tao on overlays (uses accent vars)  
- [x] Wallet credit via same `creditCinders`  

**Known P1 gaps**

- Creative walk/fly ещё не реализован  
- Semantic overlays есть; `slow`/`stain`/`hazard` работают, но tile `portal`/`trigger` runtime ещё отсутствует  
- Региональные teleport и `on_region_enter` работают; прямой `scriptId` и gameplay `camera_bound` ещё отсутствуют  
- Pool / Weapon / Enemy UI ещё не first-class, хотя данные уже есть в `content/ember/`
- Asset Library нужна tags/usage/bulk/dependency навигация
- Map/stage playtest loop из редактора нужно сделать максимально коротким
- Full 15‑min balance pass — позже, после короткого reproducible slice

**Deferred / not current work**

- Story hub complexity
- Stealth / puzzles
- Multiple mistresses
- Public OC replacement pass
- Gallery / Live2D / long-form narrative

---

## 11. Главный риск и рабочее правило

Главные риски:

- **Scope:** дальняя фантазия легко раздувает P1.
- **Content bottleneck:** без быстрых ассетов и playtest авторский цикл тормозит.
- **IP:** Hu Tao годится как локальный прототип, не как публичная финальная оболочка.

Рабочее правило до конца P1: если задача не ускоряет `map → arena → win/lose → cinders → scene → return` или authoring этого цикла, она уходит в Next/Later.

---

*Документ = источник правды по Ember Anomaly до появления отдельных `EMBER_P2_*.md`. Меняем фазы — правим этот файл.*
