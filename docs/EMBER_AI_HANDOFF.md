# Ember — инструкция и handoff для ИИ

Актуально на 25 августа 2026 года. Этот документ — рабочий контекст для Cursor/Codex при продолжении разработки Ember. Он описывает не только существующий код, но и намерение системы: чего добивались, какие решения уже приняты и куда двигаться дальше.

**AI-агенты: механики (телепорт, зоны, ходьба, камера, тайлы, интерьеры, растительность, editor round-trip) проверять на стадии `agent_sandbox` / «Песочница агента». Не использовать арену `hu_tao_p1` и двор `hu_tao_yard` — там волны бьют по HP до того, как агент дойдёт до пада.**

Для задач Ember этот handoff имеет приоритет над старой пометкой «Ember не трогаем» в общем `docs/IMPROVEMENTS.md`: пользователь явно продолжает разработку Ember.

**Перед любой правкой проекта прочитать корневой [`AGENTS.md`](../AGENTS.md). Перед декомпозицией или добавлением подсистемы также прочитать [`EMBER_RESTRUCTURE_PLAN.md`](EMBER_RESTRUCTURE_PLAN.md).** Эти документы запрещают параллельные `V2/New`-реализации, рост legacy-монолитов и копирование общей математики между editor, preview и runtime.

## 0. Текущий контракт crowd-навигации — читать перед изменением AI

С 25 августа 2026 года источником правды для перемещения большой толпы является **baked height-surface grid**, а не старые плоские этажи и не специальные маршруты для отдельных лестниц.

- `enemyCrowdOpenField.ts` при создании runtime запекает карту с разрешением `2×2` навигационные ячейки на тайл. Для `hu_tao_yard` это `96×96 = 9216` ячеек. В ячейке хранятся высота центра и высоты четырёх границ.
- Высота берётся через общий `navigationSurfaceElevAtWorld`: terrain, ramp и physical voxel supports видны AI так же, как игроку. Нельзя вводить отдельную «лестничную» геометрию, не совпадающую с физикой игрока.
- Ребро направленное: подъём проверяется по цепочке `центр → граница → граница соседа → центр`. Каждый положительный шаг обязан быть не выше `MAX_AUTO_STEP_VOXELS = 4`; падение вниз разрешено. Это и есть единое правило «если игрок может шагнуть, враг тоже может».
- `enemyCrowdFlowField.ts` маркирует связные компоненты один раз при bake. При перемещении цели перестраиваются только distance/direction arrays, а не геометрия карты. Враг читает направление O(1), сохраняет свою поперечную полосу на ступенях и использует быстрый baked-height move; точная voxel collision остаётся страховкой для сомнительного случая.
- После сохранения геометрии в World Editor новый запуск или `Reload` создаёт bake заново. Не добавлять ручную кнопку «перестроить путь» и не сериализовать производный flow в JSON карты без отдельного решения о cache versioning.
- F3 должен показывать `Flow baked <cells> cells <edges> edges`. На составной лестнице `Move stairs` больше не должен быть ограничен старым бюджетом точных connector-проверок; массовый подъём проходит через baked-height fast path.
- Physical voxel placements имеют общий horizontal seam bleed `0.05` voxel на сторону в `voxelPlacement.ts`. Renderer, instancing и collision footprint используют одну величину. Не возвращать локальные `scale: 1.04` в JSON лестниц: они искажают authored asset и не чинят системную щель.
- Не восстанавливать прежние connector-chain integration layers, route hashing или единый «администраторский» коридор. Они схлопывали толпу в один длинный обход и плохо переживали составные лестницы. Текущий flow строится по реальной высотной поверхности и допускает все равноправные подходы.

Минимальная проверка после изменения: `npx vitest run src/game/three/enemyCrowdOpenField.test.ts src/game/three/enemyCrowdFlowField.test.ts src/game/tile/mapCollision.elev.test.ts src/game/tile/mapCollision.physical.test.ts`. Для живого профиля: F3 + F4/Shift+F4/F6/Shift+F6; stress-режимы обязаны оставлять XP равным нулю.

## 1. Что такое Ember

Ember — встроенная в JOI Conductor игра и редактор контента с кубичной/воксельной стилистикой.

Основные игровые направления:

1. Исследование объёмных карт: прогулка, поиск путей, головоломки, интерактивные объекты, триггеры, события и сюжетные зоны.
2. Разломы/аномалии: отдельные карты с боем в духе Vampire Survivors — толпы врагов, автоматические атаки, опыт, сундуки и развитие билда.
3. Редактор должен позволять собирать оба типа карт без правки кода.

Источник правды режима — `EmberMap.playProfile` (`arena` | `explore`, omit = `arena`). Это один Three.js play loop (`EmberThreeWorld`), не два движка. В play мышь крутит камеру с pointer lock с клика «Начать». Esc открывает меню паузы (курсор виден). Chromium после Esc ~1.25 с отвергает `requestPointerLock` даже с клика, поэтому «Продолжить» активна после этой паузы и берёт lock с жеста. Пока lock нет, Windows ClipCursor по HWND окна + SetCursorPos в центр (как в играх): курсор не уходит на второй монитор и камера не упирается в край. Не открывать меню на каждый `pointerlockchange`/`pointerlockerror`. ЛКМ не атакует. Explore грузит всю карту до `api.ready` и не пересобирает свет при смене чанка.

- **Арена** (в т.ч. существующий `hu_tao_yard` без поля): волны из spawn table, F4/Shift+F4 орда, enemy LOD/crowd, мало PointLight cube-shadow, геометрия может быть простой.
- **Исследование** (деревня / JRPG): орда и F4 выключены; bake-солнце, уличные фонари (cube только у ближайших), окна = emissive fill без cube, стоячие/гуляющие NPC (кап 24, без боя). Диалоги и лавка висят на объектах (`talk` / `shop` / `quest_marker`), не на регионах NPC.

Бюджеты профиля: `resolvePlayProfileBudget` в `renderBudget.ts`. Stage не дублирует профиль: если stage ссылается на explore-карту, волны просто не идут.

Главная инженерная цель: не набор независимых редакторов и специальных случаев, а единый надёжный «скелет мира», похожий по понятиям на Unity/Blender:

- Scene и иерархия объектов;
- GameObject/WorldObject;
- Transform;
- компоненты Renderer, Collider, Light, Trigger, Volume и т. п.;
- asset defaults и instance overrides;
- единые gizmo, Inspector, Outliner, Library, selection и placement;
- один контракт данных для editor, runtime, collision, lighting и serialization.

## 2. Точки входа

### Приложение

- `src/pages/EmberPlayPage.tsx` — загрузка пака, запуск/остановка игры, HUD, loot и переходы к сценам.
- `src/pages/EmberEditorPage.tsx` — оболочка редактора, вкладки, загрузка/валидация/сохранение контента.
- `src/game/index.ts` — публичный barrel API Ember.
- `src/game/bridge/events.ts` — минимальный мост runtime → React (`hud`, loot, result, event, toast).

### Активный игровой runtime

- `src/game/three/createEmberThreeGame.ts` — фабрика Three.js runtime.
- `src/game/three/EmberThreeWorld.ts` — главный runtime мира, движения, боя, камеры, streaming, света и рендера.
- `src/game/phaser/` — legacy-реализация. Использовать только для сверки старого поведения. Новые системы не дублировать туда без отдельного решения о миграции.

### Главный редактор карты

- `src/components/ember/editor/MapEditorPanel.tsx` — orchestration UI карты. Сейчас крупный монолит; новые алгоритмы желательно выносить в сервисы/хуки, а не увеличивать файл бесконечно. Изоляция: Shift+H / `/` (Alt+H показать все). Collision overlay: стены + AABB физических вокселей + капсула игрока на spawn. **Explore · Q** — камера как в play.
- `src/game/three/editorThreePreview.ts` — Three.js viewport редактора: сцена, pick, placement preview, gizmo, overlays, свет и shadow bake.
- `src/components/ember/editor/MapSceneOutliner.tsx` — иерархия объектов карты.
- `src/components/ember/editor/MapObjectInspector.tsx` и `WorldObjectSchemaInspector.tsx` — Inspector.
- `src/components/ember/editor/MapLibraryTray.tsx` и `mapLibraryPlacement.ts` — библиотека и постановка объектов.

### Специализированные редакторы

- `TileEditorPanel.tsx` — тайлы и материалы поверхности.
- `SpriteEditorPanel.tsx` — пиксельные спрайты.
- `VoxelSculptPanel.tsx` — воксельные модели и сцены.
- `SceneEditorPanel.tsx` — нарративные сцены. `EmberScene.use`: `cutscene` | `talk` | `shop_intro`. Один граф, один `ScenePlayer`. Play overlay — HSR (без коробки), якорится на `.ember-play-shell` (холст), не на `position: fixed` всего окна. F11 прячет шапку/сайдбар/play-bar, игра на весь экран. Кнопки **+ Сцена** / **+ Болтовня**. На объект вешается `scriptId` (dropdown сцен + `scripts/`). Trigger `scriptId` — action list (`talk` / `change_map` / `open_shop` / `give_item` / `set_flag` / `wait` / `run_script`) или id сцены.
- `StageEditorPanel.tsx`, `SpawnEditorPanel.tsx` — стадии и волны.
- `ArtsEditorPanel.tsx` — библиотека артов/портретов и связанного контента.
- `ItemsEditorPanel.tsx` — каталог предметов и 16×16 иконки (вкладка **Предметы**).

### 2.1. AI-агенты: тестируйте здесь

Пак: `ember_p1` (`content/ember/pack.json`). Default stage пака по-прежнему арена — **не менять**. Для тестов механик явно выбирать песочницу.

| Что | Значение |
| --- | --- |
| Карта | `content/ember/maps/agent_sandbox.json` (`id: agent_sandbox`, `playProfile: explore`) |
| Стадия | `content/ember/stages/agent_sandbox.json` — id `agent_sandbox`, имя **«Песочница агента»** |
| Спавн | `content/ember/spawns/agent_sandbox.json` — `entries: []` |
| Бой | Выключен: explore + пустая spawn table + нет регионов `spawn` |
| Старт | регион `start` — клетки **(10,20)–(13,21)** |
| Телепорт A↔B | `teleport_a` **(4,12)** ↔ `teleport_b` **(19,12)** (1×1, occupancy как у двора) |
| Камера | `camera` — (1,1) 22×22 |
| Домик | сруб NE, крыша `ground_z2`, interior `cabin` (17,3) 2×2, вход с юга. Trigger `cabin_enter` → карта `agent_sandbox_interior` (регион `start`). |
| Тайник | регион `chest` **(10,16)** 1×1, `lootIds: ["coin","herb"]`, модель `vox_ms8vsb53`. F / `interact` открывает один раз. |
| Интерьер | `content/ember/maps/agent_sandbox_interior.json` (12×12, доски, сруб-стены). Выход `exit` (5,9) → `agent_sandbox` / `cabin_enter`. |
| Растительность | кусты (2,2)/(2,21)/(21,21), кадки (8,8)/(15,8) — без hydrant/mailbox |

**Play (человек):** `http://127.0.0.1:5173/` → боковое меню **Аномалия** → стадия **Песочница агента** → Начать. Волны/F4 орда не идут (explore).

**Play (AI-агент): только headless.** Не водить WASD в Chromium / Browser MCP / Playwright. Не заходить на арену `hu_tao_p1`. Ядро — `src/game/agent/exploreSim.ts` (`createExploreSim`, `step`, `walkToward`, `interact`, `dump`). Обёртки:

| Как | Команда |
| --- | --- |
| Vitest | `npx vitest run src/game/agent/exploreSim.test.ts` |
| CLI JSON | `npm run ember-agent -- state` |
| CLI шаг | `npm run ember-agent -- step --dir east` |
| CLI до региона | `npm run ember-agent -- walk-toward --to teleport_a` |
| CLI interact | `npm run ember-agent -- interact` |
| CLI сундук | `npm run ember-agent -- --reset walk-toward --to chest` затем `interact` |
| CLI смена карты | `npm run ember-agent -- --reset walk-toward --to cabin_enter` |
| CLI с нуля | `npm run ember-agent -- --reset walk-toward --to notice` |
| CLI лавка | `npm run ember-agent -- --reset walk-toward --tx 13 --ty 20` затем `interact`, `buy --item herb`, `sell --item herb` |
| CLI экип | `npm run ember-agent -- --reset walk-toward --to chest` затем `interact`, `equip --item funeral_polearm`, `use --item herb` |
| CLI сейв | `npm run ember-agent -- save --slot 1` |
| CLI загрузка | `npm run ember-agent -- load --slot 1` |
| CLI сброс сейва | `npm run ember-agent -- reset-save` или `reset-save --slot 1` |
| CLI копия слота | `npm run ember-agent -- copy-save --from 0 --to 2` |
| Vitest сейв | `npx vitest run src/game/content/emberSave.test.ts` |
| MCP stdio | `npm run ember-agent-mcp` |

CLI печатает один JSON-объект в stdout (`tile`, `occupyingId`, `lastWarp`, `nearby`, `lastInteract`, `inventory`, `equipment`, `wallet`). Сессия между вызовами — `%TEMP%/joi-conductor/ember-agent-session.json`. Слоты прогресса (не путать с сессией CLI) — `debug/ember-saves/<packId>/slot-N.json` (пак по умолчанию `ember_p1`, слоты **0–9**, по умолчанию 0). Карта по умолчанию `agent_sandbox`. Контент читается с диска (`content/ember`), Vite не нужен.

**MCP в Cursor:** проектный файл `.cursor/mcp.json` (сервер `ember-agent`). Инструменты: `get_state`, `step`, `walk_toward`, `interact`, `buy`, `sell`, `save`, `load`, `reset_save`. `get_state` отдаёт `inventory`, `equipment` (слоты `weapon` / `arena_weapon` / `head` / `body` / `accessory`) и `wallet` (монеты). Экип/юз — CLI `equip --item` / `use --item` (MCP buy/sell не расширяли). `buy` / `sell` принимают `itemId` и опциональный `shopId` (иначе последний киоск после `interact`). `save` / `load` / `reset_save` принимают опциональный `slot` (0–9). Не используйте `npx` — на Windows он часто зависает на Connecting. Команда:

```json
"ember-agent": {
  "command": "node",
  "args": ["./node_modules/tsx/dist/cli.mjs", "src/game/agent/emberAgentMcp.ts"]
}
```

После правки: Settings → MCP → ember-agent → Reload. Stdio — **построчный JSON-RPC**, не Content-Length. `cwd` — корень `joi-conductor`.

`step` / `walk_toward` — оси карты (north = −Y, east = +X), не yaw камеры. Коллизия вокселей — тот же `moveWithVoxels`, что и в play. `interact` не запускает Phaser: стоя на trigger/chest/teleport **или** лицом к объекту с модификатором интерактивности возвращает `wouldFire`. Сундук: `action: "open_chest"`, `loot` (id каталога) + `lootNames` (русские имена, иначе stub id) и `inventory` id→count; `empty`/`alreadyOpen`; `opened` держится в сессии (`openedChests`, поле `opened` на регионе). Если у trigger есть `targetMapId`, **карта реально меняется** (play и headless): спавн в `targetRegionId`, иначе `targetX/Y`, иначе `player_start`. Вход в такую зону тоже меняет карту (как телепорт, с occupying чтобы не отскочить сразу назад). Песочница: `notice` + `sbx_quest_sign` (quest_marker **available**), `sbx_quest_active` / `sbx_quest_done`, `sbx_talk_npc` (`sandbox_guard_talk`), `sbx_branch_npc` (`sandbox_branch`), trigger `chain_demo` → `sandbox_chain`, лавка `sbx_shop_kiosk` + `sandbox_shop_intro`, `cabin_enter` + `sbx_cabin_door` (door → `agent_sandbox_interior`), интерьер `exit` обратно в `cabin_enter`, `chest` у (10,16) лут `coin`+`herb`+`funeral_polearm`. Play: **F** — interact (E по-прежнему крутит камеру). **I** / кнопка **Сумка** — инвентарь и экипировка (Esc закрывает; пока открыт магазин I не открывает сумку). Explore-сундук не автоподбирается с подхода — только F; арена без `lootIds` по-прежнему открывает пул стадии при подходе. Dialog overlay в play — HSR-стиль (белый текст снизу, градиент, золотой треугольник; Skip/Auto/Hide). `scriptId` на trigger/talk/custom исполняется: сначала `pack.scripts`, иначе `pack.scenes`. Флаги, карта+тайл, инвентарь, экип, сундуки, сток лавок и HP пишутся в explore-сейв (`emberSave.ts`).

**Сейвы explore:** play — localStorage ключ `ember-save-v1:<packId>:<slot>` (активный слот `ember-save-v1:active:<packId>`). Облака нет. Пустой слот не трогает старт: в play песочницы это `{ coin: 20 }`, в headless — `{}`. Загрузка слота 0 при входе в explore play. Автосейв: смена карты, сундук, покупка/продажа, выход в меню / Стоп / закрытие вкладки. Пауза Esc: Сохранить / Загрузить / Новая (wipe слота и рестарт). HUD кнопка **Сейвы** — список 0–9, Save / Load / Delete / копировать слот. Редактор: вкладка **Validate**. Тесты: `npx vitest run src/game/content/emberSave.test.ts`.

**Редактор:** `http://127.0.0.1:5173/` → **Ember Editor** → Мир / **Карты** → селект **Песочница агента**. Каталог лута: вкладка **Предметы** (`sellPrice`, флаг **Не продаётся**). Ассортимент лавок: вкладка **Магазины** → `shops/catalog.json` (цены, сток; киоск на карте по-прежнему interactivity `shop` + `shopId`, не зона Shop).

Не ходить на `hu_tao_yard` / стадию `hu_tao_p1` («Двор Ху Тао — срез») для этих проверок: там spawn-зоны и волны. `hu_tao_village` / `village_stroll` — JRPG-хаб на уже существующих объектах (дверь+`targetMapId`, лавка, talk NPC, quest marker, сундук). **Механики (interact / shop / смена карты / fade) проверять только на `agent_sandbox`.** Деревню не водить в Chromium для проверки движка; контент-тест — `villageExploreContent.test.ts`.

Хаб (контент, не тестовый двор): старт `start` (16,29) южные ворота; дверь `vil_house_door` (12,8) + trigger `house_enter` → карта `hu_tao_house_interior`; **лавка на улице** `vil_shop_kiosk` (13,19) `wangsheng_kiosk` — прилавок/навес на перекрёстке тропы, видно с ворот если идти на север (подход (13,20)); talk `vil_talk_porter` (17,28) / `vil_talk_auntie` (11,21); quest `vil_quest_sign` (10,20) available; сундук `side_chest` (1,13) `coin`+`herb`; NPC `vil_npc_keeper` idle (14,18) / `vil_npc_plaza` wander. Чиби `vox_chr_*` на карту не ставить. **Полы домов и лавки на z0** (тот же ground plane, что улица); стены z1, крыши cutaway на z2, не наступать на крышу. Не оставлять walkable interior slab только на z1 без ступеньки.


## 3. Контент-пак

Исходные данные находятся в `content/ember/`:

- `pack.json` — метаданные и default stage;
- `maps/` — карты (`loadEmberPack` читает всю директорию; fallback — `hu_tao_yard`);
- `tilesets/` — тайлы, материалы, физика и семантика (директория; fallback — `graveyard_16`);
- `sprites/registry.json` — пиксельные спрайты;
- `voxels/models/<id>.json` + `voxels/models/<id>.vox` — пара prefab: JSON (id, теги, коллизия, свет, extra channels), MagicaVoxel `.vox` (форма + палитра). `writeVoxelRegistry` пишет оба файла; `loadEmberPack` склеивает пару. Старые JSON с `model.voxels` ещё читаются до первого save;
- обмен с внешним миром: `.vox` (форма + палитра), Ember JSON (коллизия/свет/id). Кодек: `src/game/voxel/vox/voxFile.ts`, `emberVoxCodec.ts`. Оси: MagicaVoxel Z-up → Ember Y-up (`ember(x,y,z) = vox(x,z,y)`). В скульпторе: **Импорт** / **Из .vox** / **В .vox** / **MagicaVoxel** (открыть файл и watch: save в MV → сетка в Ember, JSON не затирается); extra channels не ездят через MagicaVoxel. Куб/ластик: точка; линия — 3D drag; коробка/сфера — ЛКМ-drag по грани клика (XZ/XY/YZ), отпускание — выдавливание по нормали, ЛКМ/Enter подтверждают, ПКМ/Esc отмена (N), выделение ↻X/Y/Z и Дубль (`voxelShapeBrush.ts`). Палитра: **Замена** (P) и Alt+клик слота — remap индекса по всей модели или выделению (`voxelPaletteOps.ts`);
- библиотека карты: поиск по имени/id/тегу и чипы тегов (`libraryTags.ts`, `emberLibraryIndex.ts`). Теги пишутся на prefab (`tags` у модели и обёртки JSON) и спрайте; префиксы `vox_vil_` / `vox_fan_` / `vox_chr_` дают search-only `village` / `fantasy` / `character+chibi`, пока автор не сохранит явный список. Find References считает voxelProps, chest `closedModelId`/`sceneId` и чужие voxel-сцены; **К размещению** прыгает по открытой карте;
- `voxels/scenes/<id>.json` — multi-object workspace, если сцена не совпадает с id модели. Персонаж (`role: character`, шаблон `chibi_32`) пишется сюда: id `vox_chr_*`, части — отдельные `voxels/models/vox_chr_*_<slot>`;
- `loadEmberPack` читает `voxels/models/*.json` (и leftover `registry.json` / `village.json`, если они ещё лежат в корне), затем соседний `.vox` если `mesh.file` задан и occupancy в JSON пустая;
- сохранение через `writeVoxelRegistry(..., { dirtyIds })` пишет **только** изменённую пару json+`.vox`; отсутствие в памяти ≠ удаление;
- старые монолиты после сплита: `voxels/_legacy/` (локальный бэкап, не в git);
- `lights/registry.json`, `looks/registry.json` — пресеты света и внешнего вида;
- `stages/` — правила забега;
- `spawns/` — волны врагов;
- `weapons.json`, `enemies.json`, `pools/` — combat content;
- `regions` внутри карты — spawn/player/chest/teleport/trigger/camera и explore NPC (`npc_idle` / `npc_wander`);
- `items/catalog.json` — таблица предметов + 16×16 пиксельные иконки (kind/slot/rarity/useIn);
- `playProfile` на карте — `arena` (бой) или `explore` (деревня); omit = арена;
- `scenes/`, `scripts/`, `events/`, `arts/`, `portraits/` — нарратив (граф сцены + action list) и визуальные ресурсы.

`src/game/content/types.ts` — главный schema-контракт. `loadPack.ts` нормализует JSON в `EmberPack`, `validate.ts` проверяет ссылки и обязательные данные.

### Важно: disk content и browser override

`src/game/content/io.ts` читает данные с приоритетом:

1. browser local override (`ember-content-overrides-v1`);
2. Electron filesystem IPC;
3. `/ember/...` через Vite/fetch;
4. `.bak`, если основной JSON повреждён.

Поэтому заголовок редактора `override×N` / `voxel override` означает, что открытая карта/реестр может отличаться от файла на диске. Нельзя считать пустой `content/ember/voxels/registry.json` доказательством отсутствия вокселей и нельзя затирать диск пустым файлом. Пустой или «тонкий» voxel override игнорируется при чтении. Перед диагностикой проверять `listLocalOverrides()` и источник результата `readEmberJson()`. Кнопка **Voxel disk** сбрасывает только voxel override.

Не складывать модели обратно в один `registry.json`. Генераторы пишут `voxels/models/<id>.json`. Для MagicaVoxel/бота сетка — `.vox` или `model.voxels` в JSON, не glTF. Инструкция контент-бота (Grok / Voxel bro): `docs/EMBER_VOXEL_BOT.md`. Визуальный просмотр стиля: [Sketchfab tag magicavoxel](https://sketchfab.com/tags/magicavoxel) — смотреть, не импортировать glTF.

## 4. Система координат и высот

Авторские координаты Ember:

- X — горизонталь карты;
- Y — глубина карты;
- Z/elevation — высота. Walkable полы explore (улица, лавка, интерьеры) авторятся на **z0**; стены z1; крыши cutaway на z2. Не класть пол дома только на z1 без ступеньки в 1 тайл.
- Gameplay-регионы и интерактивные placement-объекты проверяются в объёме **X/Y/Z**, а не только по X/Y. Явный `region.elev` задаёт этаж зоны; если `elev` не указан, зона наследует локальную walkable-поверхность через `regionVolumeElev` (включая крышу) и не является вертикальным wildcard. Поэтому trigger внутри дома под крышей нужно явно ставить на `elev: 0`. Вертикальный teleport с одинаковыми X/Y допустим, если отличаются исходный `elev` и `targetElevation`.
- Scale X/Y — плоскость земли, Scale Z — вверх.

Three.js:

- X Ember → X Three;
- Y Ember → Z Three;
- Z Ember → Y Three.

Использовать `logicToThree`, `elevToWorldY`, `blockStoryHeight`, `resolveEmberTransformScale` и placement helpers. Не писать ручные перестановки осей в отдельных компонентах.

`VOXELS_PER_BLOCK` задаёт разрешение одного блока. Высота collider хранится в вокселях, а gameplay support/feet — в elevation/story units.

`position.z: null` означает «наследовать поверхность клетки». Явный Z означает authored высоту экземпляра. Inspector должен показывать и authored, и resolved значения без скрытого изменения JSON.

## 5. Единая модель объекта

Основные файлы:

- `src/game/editor/world/EmberWorldObject.ts`;
- `emberWorldObjectAdapter.ts`;
- `EmberInspectorSchema.ts`;
- `EmberSceneHierarchy.ts`;
- `EmberVoxelPrefab.ts`.

Поддерживаемые виды: voxel, sprite, light, region, tile.

Компоненты включают:

- Transform;
- Voxel Renderer / Sprite Renderer;
- Block;
- Collider;
- Light / Emissive Light;
- Volume / Trigger / Teleport;
- Spawn / Chest / Camera Bounds;
- Interactivity (instance-only: `door` | `talk` | `quest_marker` | `shop` | `custom`).

Поля могут приходить из `asset`, `instance`, `legacy` или `default`. Instance override не должен незаметно переписывать asset. Удалённый у экземпляра компонент хранится как tombstone (`removedComponents`/`componentStates`) и может быть восстановлен из asset.

Любая новая функция объекта должна пройти один путь:

1. тип/схема в content types;
2. нормализация legacy-данных;
3. WorldObject adapter;
4. Inspector schema и UI;
5. CommandStack/undo-redo;
6. сохранение;
7. editor preview;
8. runtime renderer;
9. collision/light/selection, если применимо;
10. тесты asset default + instance override + reset/inherit.

## 6. Transform, selection и placement

Уже сделано:

- единый Transform с position/rotation/scale;
- World/Local UI и grid snap;
- gizmo move/rotate/scale;
- multi-selection и общий pivot;
- `Shift+ЛКМ` координатный X/Y/Z box select между двумя ближайшими видимыми поверхностями;
- `Alt+Shift+ЛКМ` ограничивает box select одним Z;
- Outliner с фильтрами, lock/hide и группами;
- pick-cycle для перекрывающихся объектов;
- alpha-aware selection спрайтов;
- библиотечный ghost preview;
- Surface / locked Z / Drop to Floor;
- invalid placement preview с причиной;
- серийная установка;
- undo/redo через editor core/command stack.

Правило: viewport, Outliner и Library обязаны приводить к одной `EmberWorldObjectRef` и одному Inspector. Нельзя создавать отдельный «инспектор библиотеки», который редактирует те же поля по другой логике.

Preview должен показывать будущий объект в месте commit, а не выбранный тайл под ним. Gizmo drag не должен перехватываться selection raycast до завершения transform operation.

Важно для рамки выбора: обе границы drag должны вычисляться одним surface-raycast-контрактом. Нельзя брать начало с фактической поверхности, а конец через paint/work-plane — в изометрии конечная точка перескакивает за стену и раздувает X/Y-прямоугольник. `mapPlanarMarquee.ts` отбирает только координаты внутри X/Y и диапазона высот начальной/конечной видимой поверхности; `Alt+Shift` фиксирует начальный Z. Preview — depth-aware world-space wireframe того же X/Y/Z-объёма, а не экранная X-Ray рамка.

## 7. Коллизии и вертикальная физика

Основной контракт: `src/game/world/worldPhysics.ts` и `worldObjectModifiers.ts`.

Тело и collider имеют вертикальные spans. Объект блокирует движение только при реальном пересечении объёмов. Это исправило старую 2D-логику, где блок на Z3 мешал игроку на Z0 проходить под ним.

Сохранять следующие свойства:

- `heightVoxels`, `offsetVoxels`, `walkableTop`, `isTrigger`, layer/mask;
- clearance над головой;
- auto-step только в пределах `stepHeightVoxels`;
- проход под поднятым объектом при достаточном просвете;
- верх блока может быть опорной поверхностью;
- `feetElev` непрерывен во время падения;
- падение использует ускорение и terminal velocity, а не мгновенную смену Z.

Нельзя возвращать проверку вида «в клетке есть solid → движение запрещено» без учёта вертикального span.

## 8. Three.js render/runtime

### Terrain и ресурсы

- `voxelTerrainChunks.ts` — чанки 16×16, load/unload hysteresis и стабильный root;
- `voxelTerrainMesher.worker.ts`, `terrainMesherWorkerClient.ts` — meshing вне main thread;
- `voxelMesh.ts`, `solidTerrainGeometry.ts` — геометрия тайлов/стен;
- `editorVoxelInstancing.ts` и runtime batching — объединение одинаковых объектов;
- `runtimeBillboardInstancing.ts` — батчи врагов/эффектов;
- `RuntimeObjectPool` — transient actors;
- `RuntimeActorSpatialIndex` — spatial hash для поиска целей/соседей.

Не делать в горячем кадре:

- полный `scene.traverse()`;
- `actors.filter()` для каждого снаряда;
- создание новых geometry/material/texture;
- перестройку всей карты при изменении одной клетки;
- отдельный draw call на каждого одинакового врага;
- обновление всех PointLight cube shadows из-за движения актёров.

### Симуляция толпы

- AI и combat работают fixed-step 30 Hz;
- render transform интерполируется каждый кадр;
- movement cadence распределена distance/crowd LOD (`enemySimLod`);
- полная tile/sprite collision только рядом с игроком; дальние члены толпы скользят кинематически и могут клипать стены/пропы;
- враги не гоняют voxel-prop collision — это остаётся у игрока;
- separation использует spatial hash, только on-screen, и 4–8 соседей;
- spatial hash пересобирается один раз после catch-up шагов, не на каждый 30 Hz step;
- bullets/gems/effects используют плотные списки, batching и pooling;
- F4 создаёт stress crowd 120, Shift+F4 — 180, F6 — 400, Shift+F6 — 700; все режимы включают неуязвимость, обнуляют XP и запрещают его получение до конца прогона, чтобы Level Up не искажал профиль. Повторный shortcut приводит crowd ровно к выбранному target, включая уменьшение после более тяжёлого пресета.
- при толпе ≥160 actor-aware PointLight cube отключается: статические cube-карты остаются закешированными, актёры сохраняют направленную тень, а шесть повторных shadow-pass сцены не выполняются.

### Профилирование

F3 показывает FPS, **frame p95** (реальный интервал между кадрами), CPU/GPU frame time, draw calls, triangles, chunks/workers, lights/shadows, instances, AI/physics/LOD/reflection. Для поиска неровного frame pacing CPU-кадр полностью размечен rolling p95 по `world / combat / AI / terrain / camera / billboards / environment / HUD / shadows / reflection / main render / profile`. Вычисляемый `other` — остаток CPU после суммы этих категорий: он ловит GC, промежутки между измеренными проходами и ещё не размеченную работу. Отдельно выводится фактический режим мыши: штатный `Look POINTER LOCK` либо аварийный `Look WARP FALLBACK`. Средний FPS без frame p95 может скрывать тяжёлый каждый второй/третий кадр.

Повторный аудит 2026-08-24: planar reflection в play работает адаптивно. При движении камеры обычная сцена обновляет зеркало с верхней границей 60 Hz, без движения — 30 Hz; cadence clock переносит дробный остаток, поэтому на 85 FPS целевые 60 Hz не превращаются в 42.5 Hz. При ≥160 врагах лимиты составляют 30 Hz в движении и 2 Hz в покое. В editor animation-only reflection остаётся 2 Hz. Между обновлениями используется последняя RT, а списки water/skip-FX/lights кешируются вместо трёх `scene.traverse()` на каждый mirror-pass. Сырые mouse-delta суммируются и применяются один раз за render frame. Electron session handler обязан разрешать permission `pointerLock`; иначе игра сваливается в менее ровный OS cursor-warp fallback. Fallback пропускает synthetic move только если `warpCenter` действительно был вызван. На `hu_tao_p1`, Shift+F4, до terrain batching было FPS 75, CPU 13.1 ms / p95 15.5, GPU 2.7 / p95 4.1, Draw 746 на cached-reflection кадре. После batching обычные non-solid ground cells перестали ошибочно жить как отдельные cutaway walls: фиксированные 180 врагов — FPS 80, CPU 12.1 ms / p95 15.0, GPU 2.2 / p95 3.4, Draw 377. В редакторе `hu_tao_yard` player-cutaway отключён полностью: elevated стены/крыши объединяются по material внутри chunk и строятся worker-ом. Контроль до/после: terrain renderables 3423 → 84, geometry 3418 → 170, Draw 2799 → 195, FPS 55–67 → 143, CPU 13–15 ms → 3.6 ms; tile raycast, Outliner/Inspector и ручной static shadow bake сохранены.

Повторная проверка F4 после пользовательского замера 2026-08-24 исправила неверный диагноз: на исходном кадре `AI p95 9.2 ms` при `31` точном movement probe, тогда как `shadow p95 0.2 ms`; свет не был узким местом. Порог actor-aware PointLight cube возвращён к ≥160, поэтому при обычном F4 с 120 врагами динамический свет не урезается. Горячий путь врагов теперь использует консервативную typed-array карту заведомо свободных плоских клеток: безопасные swept-circle перемещения проходят без `moveWithVoxels`, а стены, перепады, connectors, solid sprites и voxel AABB отправляют врага в прежнюю точную физику. Точные voxel-проверки дополнительно распределяются по времени: бюджет `8` на fixed step при 120 врагах и `6` при >160, начало обхода вращается для справедливости, отложенный враг сохраняет накопленный travel time. F3 разделяет `Move exact/open/free/defer`. В локальных фазовых прогонах F4 `exact` ограничен 8 вместо 31, а `AI p95` держался примерно 0.1–2.5 ms вместо 9.2 ms. Общий FPS нельзя приписывать только AI: его следует сравнивать вместе с `frame p95` и остальными work-pass. Браузерный harness закономерно показывает `WARP FALLBACK`; desktop Electron после полного перезапуска должен показывать `POINTER LOCK`.

Навигационный pass 2026-08-24: поверх baked open-field добавлено единое crowd flow field. Статическая проходимость строится один раз при загрузке/смене карты; BFS integration field и направления пересчитываются только когда игрок меняет tile или целый elevation-story. При толпе >40 каждый враг читает следующий waypoint из плотных `Int32Array`/`Int8Array`, затем применяет прежний local separation и collision fallback. Диагонали запрещают corner cutting. Консервативно заблокированные target-клетки привязываются к ближайшей открытой клетке физической компоненты. Изначально connector/stair cells и несовпадающий Z оставались на fallback; это ограничение снято последующим height-aware pass ниже. F3 выводит `Flow guided/miss/cells/rebuild`. Малые встречи ≤40 не меняют поведение.

Flow target fallback исправлен после Electron-проверки 700 врагов, где клетка игрока оказалась внутри большой консервативно заблокированной зоны и прежний поиск радиусом 4 вернул `cells 0 / guided 0 / miss 175`. Ограниченного радиуса больше нет: открытые клетки текущего elevation-story делятся на связные компоненты, в каждой выбирается собственная ближайшая к игроку approach-cell, затем один multi-source BFS заполняет все компоненты. Поэтому враги по разные стороны действительно непроходимой стены идут к ближайшей достижимой точке своей стороны, не теряя flow полностью. F3 теперь показывает `Flow goals selected/components` и `fallback N tiles`. Контроль Shift+F6 после исправления: `cells 1394`, `goals 2/2`, `guided 174`, `miss 1`; на открытой target-клетке fallback 0.0.

Profiler coverage pass 2026-08-24: прежние пять work-таймеров объясняли только часть Electron CPU p95, поэтому нельзя было отличить настоящий игровой hotspot от GC/неразмеченной работы. Теперь все крупные участки `EmberThreeWorld.tick` покрыты непересекающимися категориями, сбор `profilerExtras` измеряется как `profile`, а `other = max(0, CPU - sum(work))` считается для каждого кадра до rolling p95. Контрольный browser Shift+F6 (~695 живых врагов): CPU p95 6.5 ms, `main 4.0`, `environment 1.4`, `camera 0.7`, `profile 0.1`, `other 0.1`; стенд не воспроизвёл медленный Electron, но подтвердил, что новая разбивка сходится. Для следующего Electron-замера нужен Reload, F3, Shift+F6 и снимок четырёх строк `Work p95`.

Electron Shift+F6 затем выявил реальный hotspot: `environment p95 20.1 ms`, при `AI 2.3`, `shadow 0.3`, `other 0.1`. Причиной был emissive proximity: даже authored-режим `player` для каждой trigger-ячейки вычислял расстояние до каждого из 700 врагов, после чего отбрасывал этот результат. Теперь `player` вообще не запрашивает врагов, `either` short-circuit-ится при полном player amount, а настоящие `enemy/either` используют существующий `RuntimeActorSpatialIndex` вместо полного массива. Свет/эмиссивные эффекты не урезаны. Browser-контроль на 700: `environment p95 0.7–0.8 ms`.

Финальный пользовательский Electron-контроль после Reload подтвердил переносимость исправления: 700 врагов, FPS `31 → 102`, CPU p95 `36.2 → 13.1 ms`, frame p95 `37.9 → 13.9 ms`, `environment 20.1 → 0.7 ms`; AI 1.7, shadow 0.2, other 0.1. Камера работает через `POINTER LOCK`. Этот кадр также выявил архитектурный дефект старой flat-grid: на террасе было только 10 flow-клеток, `guided 0`, bullets `exact 50/open 0`, а враги снизу не находили подъём к игроку.

Height-aware crowd/collision pass 2026-08-24: baked-база теперь хранит высоту безопасной поверхности каждой клетки, отдельную flat collision-маску и параметры connector (`axis`, `low`, `high`). Raised walkable tops больше не блокируются только из-за `heightVoxels`; stair/ramp становится физическим ребром между нижней и верхней площадкой, но боковой выход и несовпадающие endpoints запрещены. Flow маркирует компоненты сразу по всем stories, поэтому связанная лестницей нижняя толпа получает waypoint наверх. На connector используется отдельный точный collision-бюджет 16 за fixed step, чтобы общий лимит 6 не создавал пробку; F3 показывает `Move stairs/defer`. Пули и плоское движение врагов используют `collisionOpen` только на гарантированно безопасной поверхности, connectors сохраняют точную `moveWithVoxels`. Интеграционный тест проводит врага с Z0 через stair на Z1. Browser Shift+F6 на `hu_tao_yard`: flow cells `10 → 2278`, guided 84, bullets `exact 16/open 51`, FPS около 153.

Voxel stair + route-distribution follow-up 2026-08-24: лестницы `hu_tao_yard` оказались не stair-тайлами, а цепочками physical voxel props. Baked-граф теперь автоматически распознаёт только монотонный, допустимый по `MAX_AUTO_STEP_VOXELS` профиль верхних колонок как connector, учитывает поворот объекта и оставляет ящики/декор заблокированными. Exact movement врагов получает `voxelModels/voxelScenes`; общий seam соседних секций больше не сбрасывает support elevation на Z0. Все девять реальных лестничных секций карты определяются как три цепочки Z0→Z3; симуляция 24 стартов дала 24/24 подъёма к игроку без flow miss. Для открытых участков flow хранит mask нескольких нисходящих направлений с допуском одного шага, а стабильный `uid` распределяет группы по этим lane: расстояние всегда уменьшается, но вся орда больше не выбирает один tie-break путь. На подходе/внутри height transition local separation не выталкивает врага поперёк лестницы. Stair exact-budget масштабируется от 16 до 48 с размером crowd. Browser Shift+F6 на обычном старте: 700 врагов, визуально несколько потоков, FPS 154, CPU p95 7.1 ms, AI p95 0.6 ms.

Administrator routing correction 2026-08-24: локальной маски соседей оказалось недостаточно — все варианты принадлежали одному integration field и снова сливались в глобальный shortest-path. Теперь каждая физически отдельная connector-цепочка получает собственный BFS-слой, где другие лестницы закрыты. Для конкретного врага диспетчер сравнивает полную длину маршрута через доступные ворота; `uid` даёт только 0–3 клетки tie-break и не может навязать большой обход. Внутри выбранной лестницы route фиксируется. Если враг и игрок на одном этаже и весь swept-circle коридор до цели гарантированно открыт, flow вообще не используется: идёт прямое радиальное сближение. Проверенный bake лестницы выполняет быстрый center-lane move с линейной support elevation вместо voxel narrow phase на каждой ступени; произвольный боковой вход сохраняет exact fallback. Целевая connector-клетка больше не означает преждевременный stop: враг продолжает вдоль axis до target elevation. F3 показывает `Flow routes used/available`. Реальная южная цепочка: 31/31 стартов достигли Z3, без miss; открытый browser Shift+F6 перестал строить «змею», AI p95 около 1.7–1.8 ms.

Height-surface rebake 2026-08-25 заменяет специальное распознавание «одна voxel-модель = один connector». При загрузке и при runtime-смене карты строится сетка 2×2 на каждый tile (для `hu_tao_yard` 96×96): каждый узел хранит высоту центра, min/max и высоты четырёх границ, полученные из того же terrain/ramp/physical-voxel support, что использует движение игрока. Направленное ребро существует только когда каждый промежуточный подъём не выше `MAX_AUTO_STEP_VOXELS = 4`; спуск разрешён. Поэтому составная лестница, короткая воксельная ступень и отредактированный рельеф не требуют ручного connector metadata. Компоненты графа маркируются один раз в bake, flow обновляет только target integration. На height cells lane hash отключён и сохраняется поперечная координата актёра, чтобы толпа не сходила со ступеней и не сжималась в центральную линию. Проверенные height-ребра используют allocation-free интерполяцию baked surface без лимита 44 актёра/такт; сложный случай остаётся на `moveWithVoxels`. F3 показывает `Flow baked cells/edges`. Любой новый запуск/Reload после сохранения карты строит граф заново из обновлённого контента.

Тот же полный профиль показал второй hotspot `combat`: отдельная строка `Combat p95 weapon/bullets/orbit/spawn` локализовала его в bullets. Пули раньше вызывали точную `circleHitsSolid` voxel-проверку каждый render frame. Теперь гарантированно открытый swept-circle путь проверяется по уже запечённому conservative open-field; стены, границы, перепады, connectors, solid sprites и physical voxel props по-прежнему идут в точную collision. F3 показывает `Bullet collision exact/open`. Browser 700/86 bullets: 72 open, 14 exact, bullets/combat p95 1.7 ms вместо 3.7–5.5, FPS около 139 вместо 109 в сопоставимом прогоне.

Village play (2026-08): closing a shop after talk must clear leftover `pausedLogic` (`playOverlayState.ts`); Esc order is shop → inventory → pause. Camera stutter on the hub was CPU: cutaway hide ran on every 0.01 rad yaw (`scene.traverse` of roofs/props), OrbitControls damping fought follow lerp, and play asked for `maxPointLights` cube maps (authored 12 + emissive windows) while recooking `dynamicPointShadows` (3) actor cubes. Explore play now clamps cubes to profile 6, no emissive cubes, 1 nearest dynamic lamp cube, cutaway only on tile / 45° sector via a tagged list, outdoor trees/lamps instanced. Expected F3: fewer Draw (repeated plum/lamp batches), Point cubes static ≤6 dynamic 1, CPU p95 down when orbiting. GPU still pays toon + remaining cubes; not a 10‑minute Chromium walk.

Оптимизировать по фактическому bottleneck. Низкая загрузка RTX не означает отсутствие CPU bottleneck: множество WebGL draw submissions и шесть граней каждого PointLight shadow выполняются через main/render thread.

## 9. Свет и тени — текущий контракт

Ключевые файлы:

- `threeLighting.ts` — authored lanterns;
- `emissiveLocalLights.ts` — PointLight от emissive sprite/voxel content;
- `torchFlickerTick.ts`, `emissiveAnimTick.ts` — мерцание;
- `renderBudget.ts` — общий лимит lights/shadow samplers;
- `dynamicShadowPolicy.ts` — разделение static/dynamic и shadow bake;
- `editorThreePreview.ts` / `EmberThreeWorld.ts` — orchestration bake.

Принятое решение:

- солнце/луна — **одна** map-wide ortho-карта, печётся со static layer 0 вместе с лампами и не следует за игроком;
- play и editor: sun map 1024 (одна cached atlas); не поднимать выше 1024 без замера F3;
- локальные PointLight **добавляют свет поверх** baked sun-umbra (toon — сумма источников). В тени от солнца факел всё равно освещает;
- игрок и враги на layer 1: не входят в sun bake, попадают в cube ближайшей лампы;
- fake ellipse/projected actor shadows удалены и не должны возвращаться автоматически;
- официальный Three.js CSM не используется — он патчит глобальные shader chunks;
- локальные PointLight cube maps 256: каждый shadow-requesting объект света на карте держит запечённый static cube; число семплируемых слотов = числу таких объектов и не меняется при ходьбе (`NUM_POINT_LIGHT_SHADOWS` стабилен). Не шаффлить baked-слоты вокруг игрока — переключение `castShadow` пересобирает toon-шейдеры;
- `dynamicPointShadows` (0..числу объектов света) ближайших видимых ламп временно меняют target на actor-aware cube (слои 0+1) через кадр; приоритет у игрока. При толпе ≥160 этот realtime-пул принудительно равен 0; при выходе из пула восстанавливается закешированная static-карта без шести граней;
- вход/выход динамического режима используют `dynamicShadowEnterScale` / `dynamicShadowExitScale` (по умолчанию 0.8/1.0 радиуса) с гистерезисом;
- CSM-аддон, screen-space contact shadows, follow-cascades и fake ellipse/blob не используются;
- PointLight cube maps кэшируются и обновляются только после изменения terrain/props/light или ручной команды;
- мерцание меняет `PointLight.distance`, но не пересобирает шесть cube faces каждый кадр.

Два play-профиля одной сцены:

- **арена** — меньше fill-ламп, horde; запечённый cube всё равно у каждого shadow-requesting источника; стадия завершается по таймеру;
- **explore** — больше fill-ламп и NPC; прогулка без победы по таймеру. Streaming выключен: play ждёт `api.ready` (вся местность + props + bake local cubes + первый dynamic bake + один полный present для компиляции шейдеров). Realtime cubes — пул `DYNAMIC_LOCAL_SHADOW_MAX_LIGHTS` (1 nearest lamp), не authored `dynamicPointShadows: 3` и не оконные emissive. Смена focus-чанка не делает `replaceLights` / не сбрасывает cached cubes. Authored `maxPointShadows: 12` на деревне/песочнице в play режется `playPointShadowCap` до 6.

F3 показывает `Point cubes static N dynamic M [source ids]`, чтобы переключение
между кэшированной и actor-aware картой можно было проверить в игре.

Критичная деталь Three.js: `PointLightShadow.updateMatrices()` перед рендером заменяет `shadow.camera.far` текущим `PointLight.distance`. Поэтому простое присваивание увеличенного `camera.far` не работает.

Правильный bake:

1. `beginStaticPointShadowBake(root)` сохраняет live distance;
2. временно ставит distance = authored distance × 1.5;
3. renderer создаёт полную cube-depth map;
4. `restore()` возвращает мерцающий cutoff, не меняя baked camera far/decode range.

В редакторе рядом с переключателем света есть кнопка «Пересчитать статические тени», вызывающая `EditorThreePreview.rebuildStaticShadows()`.

Если добавляется новая операция изменения статического объекта или света, она обязана вызвать `invalidatePointLightShadows` и поставить bake pending. Иначе viewport покажет старую тень.

## 10. Уже закрытые проблемы

- Свет и воксельные объекты снова видимы в editor/runtime после приведения light budgets и загрузки ресурсов.
- Удаление последнего authored light больше не создаёт синтетический невыбираемый PointLight в центре карты.
- Gizmo света/воксельного объекта использует сам объект, а placement preview показывает будущую позицию commit.
- Воксельные outlines следуют существующим вокселям, а не прямоугольному блоку модели.
- Размер voxel canvas применяется по Enter/commit, поэтому ввод размера не режет модель каждым символом.
- Pointer handling voxel sculptor защищён от двойного добавления/удаления.
- Цветовые и тяжёлые параметры используют deferred/commit input вместо полной перестройки на каждый input event.
- Terrain перестраивается чанками через worker.
- Пропы и враги инстансятся; временные объекты переиспользуются.
- Враги используют fixed-step/LOD/spatial hash вместо тяжёлой полной логики на render frame.
- Дальние враги в толпе не делают `moveWithVoxels`; voxel-пропы проверяются только для игрока.
- Падение игрока стало плавным с ускорением.
- Вертикальная collision-модель позволяет проходить под поднятыми блоками.
- Static PointLight shadows запекаются с полным запасом радиуса мерцания и имеют ручной rebuild.
- Игровые тени: одна cached map-wide sun-карта (static layer 0) плюс лампы поверх умбры и cube ближайшей лампы; без follow-cascades, blob и Three.js CSM.
- Combine каскадов в `voxelLightSnap` только через `#if NUM_DIR_LIGHT_SHADOWS` — GLSL-тернарник ломает editor (одно солнце).
- Sun probe смещать к свету, не вдоль нормали поверхности — иначе косой ключ рисует полосы на топе вокселя.

## 10.1. Этапы gameplay (конструктор, не зоопарк зон)

1. **Сделано:** модификатор интерактивности на размещённом объекте + bind к trigger (`interactivity.ts`, Inspector, exploreSim `wouldFire`). Shop больше не stub: `shopId` открывает UI.
2. **Сделано:** trigger `targetMapId` меняет карту в play и headless (`mapChange.ts`, exploreSim, EmberThreeWorld). Песочница: `cabin_enter` / дверь `sbx_cabin_door` → `agent_sandbox_interior`, выход `exit` обратно в `cabin_enter`.
3. **Сделано:** сундуки / stashes на существующей зоне `chest` (`chestLoot.ts`). `lootIds` резолвятся в каталог предметов; unknown id остаётся stub. once vs `repeatable`, `opened` в сессии. Play: F + toast с именами; explore без автоподбора. Редактор: поля лута в инспекторе зоны. Песочница: регион `chest` (10,16).
   Все region-механики (`player_start`, `spawn`, `chest`, `teleport`, `trigger`, NPC) и placement-интерактивность (`door`, `talk`, `shop`, custom) учитывают resolved elevation. Map-change выбирает только trigger с `targetMapId`, поэтому перекрывающий его script-only trigger не маскирует выход. `camera_bound` пока остаётся authoring/debug-объёмом и gameplay-камеру не ограничивает.
4. **Сделано:** таблица предметов + 16×16 пиксельные иконки + редактор **Предметы** (`items/catalog.json`, `emberItem.ts`, `ItemsEditorPanel.tsx`). Две полосы оружия: `weapon_arena` / `weapon_jrpg` + `useIn`. Боевые числа (`atk`/`def`/`hpRestore`) резолвятся в `playerCombatStats` (`emberCombatStats.ts`).
5. **Сделано:** магазин. Конструктор: interactivity `shop` + `shopId` из `shops/catalog.json` (не зона Shop). Play: F открывает панель купить/продать, Esc закрывает. Валюта `coin`. Песочница: прилавок `sbx_shop_kiosk` (8,20) → `village_kiosk`. Редактор: вкладка **Магазины**. Продажа любого предмета из инвентаря: цена листинга, иначе каталог `sellPrice`; `unsellable` / `coin` — отказ. Продажа листинга с конечным `stock` restock +1. ember-agent / MCP: `interact`, затем `buy` / `sell` (`itemId`, опционально `shopId`). `get_state` включает `inventory`, `equipment` и `wallet`.
6. **Сделано:** экран инвентаря / экипировки и боевые статы. Play: **I** и HUD **Сумка**; слоты `weapon` / `arena_weapon` / `head` / `body` / `accessory`. `weapon_jrpg` → `weapon` (explore), `weapon_arena` → `arena_weapon` (пули `hu_tao_p1`). Без экипа: atk 4, def 0. Explore-удар = JRPG atk; входящий `max(1, raw − def)`. Арена: `weapons.json.damage + atk_арены − 4`. Стартовый `starterWeaponId` на арене автонадевается в `arena_weapon`. Расходники с `hpRestore` > 0 — **Использовать**. Магазин эксклюзивен. Headless: dump `equipment`; CLI `equip --item` / `use --item`.
7. **Сделано:** сейвы explore (`emberSave.ts`). Слоты 0–9 на пак. Play: localStorage; CLI/MCP: `debug/ember-saves/<packId>/slot-N.json`. Автосейв на карту / сундук / магазин / выход. Пустой слот = текущий старт инвентаря. Vitest: dump → save → load.

Не добавлять отдельные виды зон Door / Talk / Shop в библиотеку.

Опциональные хвосты после этапа 7: restock UX; MCP tool `equip`; вкладка **Магазины** уже есть. Talk/custom скрипты — dialog overlay + `scriptId`. Облако сейвов не делать.

## 11. Ближайший план

### Архитектурная стабилизация

Полный измеримый план находится в [`EMBER_RESTRUCTURE_PLAN.md`](EMBER_RESTRUCTURE_PLAN.md). Порядок обязателен: **страховочные guard/smoke-тесты → декомпозиция `mapUtils` → CSS ownership → controllers редакторов → façade `EmberThreeWorld` последним**. Crowd/flow и hot path врагов выносятся только после отдельного benchmark gate.

Не начинать большой rewrite и не заводить новую систему рядом со старой. `mapUtils.ts` должен постепенно стать compatibility barrel, крупные React-панели — orchestration над controllers/hooks, а `EmberThreeWorld` — façade с явным lifecycle систем. Одна задача закрывает один seam и сохраняет поведение.

### Сначала — стабилизация мира

1. Проверить полный static shadow bake на нескольких authored и emissive источниках: стены, voxel props, спрайты, разные Z и максимальное мерцание.
2. Если 1.5× окажется недостаточно или слишком дорого, вынести `shadowBakeReachMultiplier` в компонент/Inspector света с безопасным диапазоном, но не возвращать per-frame bake.
3. Прогнать collision regression: проход под блоком, лестницы, стены неполной высоты, stacked voxel props, падение, step-up и разные Scale.
4. Убедиться, что Library placement, Outliner selection и Inspector дают одинаковый объект и одинаковые undo/redo операции.
5. В play проверить map-wide sun bake (тени объектов за игроком не обрываются) и свет ламп внутри солнечной умбры. Дальние лампы не должны пересобирать cube maps. F3 и F4.

Аудит 2026-08-24 — **закрыто**. Исправлена инвалидация editor-preview: fingerprint теперь учитывает все voxel-каналы и полный sprite asset, поэтому правка пикселя, материала или emissive-параметра не оставляет старые меши/свет/cube shadow. Sprite emissive-light следует authored `placement.elev` и вертикальному Scale. Collision regression закрепляет underpass, лестницы, step-up, stacked props и Scale. Глобальный свет, play profile и auto-attack теперь проходят через тот же CommandStack; живая проверка Inspector ↔ Outliner возвращает один instance и синхронный Undo. Множитель bake 1.5× оставлен фиксированным: карта теней покрывает authored reach, дополнительная настройка пока не нужна. Runtime F4 теперь фиксирует crowd: обычные волны и убийства при stress-run не меняют target. Контроль: F4 = ровно 120, Shift+F4 = ровно 180, XP 0, HP 100; при 180 `Point cubes static 9 / dynamic 0`, shadow bank `dirty 0`, cached-reflection кадр: FPS 75, CPU 13.1 ms / p95 15.5, GPU 2.7 / p95 4.1, Draw 746.

### Скульптор (MagicaVoxel-паритет)

1. Watch `.vox` / открыть MagicaVoxel — **сделано**.
2. Shape brushes: линия — 3D drag; коробка/сфера — плоскость грани клика, затем выдавливание по нормали (ЛКМ/Enter, ПКМ/Esc) + поворот/дубль выделения — **сделано** (`voxelShapeBrush.ts`, N / ] / [ / Ctrl+D).
3. Replace-color по палитре — **сделано** (`voxelPaletteOps.ts`: инструмент **Замена**/P, Alt+клик слота, Shift стирает цвет; выделение ограничивает область).
4. Isolation + overlay коллизии + preview explore-камеры — **сделано**: Shift+H / `/` изоляция, Alt+H показать все; collision overlay рисует AABB физических вокселей и капсулу игрока на `player_start`; Q / Explore — камера как в play; в скульпторе **Капсула** и **Игра** (Shift+F).
5. Library tags + Find References — **сделано**: теги на voxel/sprite, поиск и чипы в лотке библиотеки, Find References в инспекторе (**К размещению** на открытой карте).

Performance-контракт скульптора: undo/redo хранит typed-array snapshots с адаптивным лимитом по памяти; session recovery пишет только короткий хвост истории и имеет draft-only fallback при quota; автосохранение и history persistence отложены и flush-ятся при закрытии; drag preview двигает selection/gizmo без клона всей модели и полного remesh на каждый pointer move. В picker reference counts строятся одним индексом, а canvas-превью рисуются только рядом с viewport.

UX скульптора с 2026-08-25 разделён на четыре рабочих режима по модели Blockbench/Blender: **Модель** (форма, выделение, геометрия), **Материал** (палитра, emissive/shine/transparency/transmittance и параметры отдельного вокселя), **Сцена** (объекты, transform, свет, петли) и **Анимация** (кости, петли, клипы и timeline). Это только представление над теми же `EmberVoxelModel` / `EmberVoxelScene`: формат контента не менялся. Горячая клавиша скрытого инструмента сама переводит в подходящий режим. Timeline монтируется только в режиме анимации, поэтому не отнимает viewport при моделировании. Левая и правая панели независимо скрываются кнопками **Инструменты** / **Свойства**, а координаты, размер сетки, активный инструмент и объём выделения находятся в нижней status bar. `VoxelObjectPropsPanel` получает `mode` и показывает контекстные разделы: геометрия/физика в модели, цветовые группы и свет в материале, transform и свет в сцене, transform в анимации. Кнопка выбора модели называется **Меню** и находится рядом с **Авто**; в dropdown **Файл** остаются только файловые операции. Контекстные шорткаты: модель — `B` добавить, `E` стереть, `M` выделение, `V` сдвиг, `N` форма; материал — `B` краска, `G` заливка, `R` замена, `I` пипетка, `O` инспектор, `E/S/T/U` каналы; сцена — `W` сдвиг, `E` поворот, `J` joint; анимация — `W` сдвиг, `J` joint. Режимы выделения находятся на `Shift+1…6`, пустой — `Shift+0`, поворот выделения — `Alt+X/Y/Z`. Нельзя возвращать глобальные обработчики, в которых одна клавиша одновременно меняет инструменты двух рабочих режимов.

Outliner voxel-сцены с 2026-08-25 поддерживает привычное множественное выделение: клик задаёт primary object, `Ctrl`/`Cmd` добавляет или убирает объект, `Shift` выбирает диапазон, **Все** выбирает сцену. Массовые **Дубль / Скрыть / Показать / Убрать** выполняют один scene commit. Групповое изменение XYZ в свойствах и стрелки инструмента перемещения считают delta от primary object и двигают выбранные иерархические корни; выбранный родитель переносит потомков один раз. Дублирование связанной группы копирует только внутренние joints и соответствующие animation tracks с новыми id. Удаление чистит joints/tracks через общий `removeSceneObject`, не позволяет оставить пустую сцену и сохраняет обязательные слоты character template. Новых полей folders/groups в `EmberVoxelScene` не добавлено: это selection UX поверх совместимого формата. Чистая логика находится в `voxelSceneSelection.ts` и покрыта regression-тестами.

В режиме **Сцена → Сдвиг** viewport показывает отдельный world-space XYZ-gizmo на median pivot выбранных object origins. Оси и центральный handle дают live Three-preview без изменения `pack` и без записи на диск; один `translateVoxelSceneSelection` commit выполняется только на pointer-up. Базовый snap — 1 воксель, удержание `Shift` даёт крупный шаг 4. Для выбранного иерархического родителя preview двигает также видимых потомков, совпадая с итоговым scene commit. Sculpt-selection gizmo вне режима **Модель** скрыт, поэтому старое выделение вокселей не перехватывает объектный transform; стрелки в режиме сцены также всегда двигают объекты, а не клетки модели.

В режиме **Сцена → Поворот** (`E`, обратно к перемещению — `W`) loose-объекты вращаются вокруг общего округлённого median pivot только по мировой Y с шагом 90°. Кольцевой gizmo делает live Three-preview и записывает один `rotateVoxelSceneSelectionY` commit на pointer-up; те же четверть-обороты доступны в инспекторе объекта. `EmberVoxelSceneObject.rot` теперь применяется общим FK-контрактом `voxelSkeleton.ts`, поэтому editor-preview и `buildVoxelSceneMesh` после сохранения совпадают. Выбор, затрагивающий parent/child любого joint, не вращается: операция заблокирована намеренно, потому что без одновременного пересчёта `parentPivot`/`childPivot` она повредила бы риг. Независимый loose-объект можно вращать даже в сцене, где у других объектов есть joints.

Редакторы тайлов и спрайтов используют общий pixel-studio layout: навигатор ассетов слева, холст и параметры инструмента по центру, свойства/слои и цвет справа, строка состояния снизу. Боковые навигаторы фильтруются по имени/ID (спрайты также по тегам). Общая Photoshop-подобная панель цвета разделяет основной/фоновый цвет (`X` меняет местами, `D` сбрасывает), базовые, недавние и пользовательские образцы. ЛКМ по образцу выбирает основной, ПКМ — фоновый. **Заменить** меняет фоновый цвет на основной в текущем цветном слое, учитывает допуск `0–255`, выделение и блокировки слоя, создаёт одну операцию undo. Текстовый импорт безопасно добавляет до 24 валидных цветов к существующим пользовательским образцам; экспорт отдаёт только пользовательскую часть. На диск по-прежнему пишется совместимый `paletteFavorites`, временные FG/BG и recent не меняют формат пака. Инструмент `M` создаёт прямоугольное выделение, `L` — свободное пиксельное лассо, `W` — magic wand по цвету. У wand есть допуск `0–255`, режим **Смежные** (4-connected flood fill) и постоянные кнопки **Новое / + / − / ∩**; без «Смежные» выбираются все совпадающие пиксели активного цветового слоя. Временные модификаторы имеют приоритет: `Shift` добавляет область, `Alt` вычитает, `Shift+Alt` пересекает. Полностью прозрачные цвета сравниваются как одна прозрачность независимо от скрытого RGB. Drag внутри области перемещает цвет, свечение и блеск как одно целое. Маска сохраняется при Delete, стрелках, Copy/Paste, Cut (`Ctrl+X`), Duplicate со сдвигом 1 px (`Ctrl+J`), flip X/Y, повороте и масштабе, поэтому пиксели вне фактического контура не перезаписываются. `Ctrl+A` выделяет весь холст, `Ctrl+Shift+I` инвертирует маску. Четыре угловых handle масштабируют область по целым пикселям методом nearest-neighbor; `Shift` сохраняет исходные пропорции. Общая математика находится в `pixelSelection.ts` и создаёт только один history snapshot на законченную трансформацию, а не на каждый mousemove. `U` переключает общие геометрические инструменты **линия → прямоугольник → эллипс**. Они рисуют в канале цвет / свечение / блеск, используют размер кисти как толщину, поддерживают заливку прямоугольника и эллипса; `Shift` фиксирует линию по 45°, прямоугольник превращает в квадрат, эллипс — в круг. Предпросмотр всегда пересчитывается от снимка начала drag, не накапливает следы и фиксирует один history snapshot и одно сохранение после mouseup. Геометрия вынесена в `pixelShape.ts`. `F` включает локальную заливку активного канала с отдельным допуском `0–255` и режимом **Смежные**; кнопка **Fill all** по-прежнему заливает весь канал. Переключатели `X↔` и `Y↕` зеркалят обычную кисть, геометрические фигуры и точки локальной заливки относительно центра холста; совпадающие точки на оси дедуплицируются. Общая логика находится в `pixelPaint.ts` и `pixelSymmetry.ts`, одна заливка создаёт один history snapshot. Обычные кисти цвета / свечения / блеска имеют пресеты **Pixel / Soft / Dither / Stamp**, непрозрачность `10–100%`, Bayer-дизеринг `25/50/75%`, spacing `1–8 px` и Pixel Perfect для кисти 1 px. Штрих интерполируется между событиями мыши без дыр, всегда пересчитывается от исходного слоя, поэтому opacity не накапливается на самопересечениях, а history и сериализация выполняются один раз после mouseup. Художественные кисти спрайтов **См / Тн / Св / Рз** сохраняют отдельный алгоритм. Остальные горячие клавиши: `B` кисть, `I` пипетка, `G` свечение, `H` блеск, `1–4` или `[` / `]` — размер. В обоих редакторах колесо масштабирует относительно курсора, **Рука** / удержание `Space` / средняя кнопка панорамируют холст, `Ctrl+0` вписывает холст, `Ctrl+1` возвращает 100% (16 экранных пикселей на пиксель рисунка). Мини-навигатор показывает текущий bitmap и видимую область; кликом или drag можно быстро переместить viewport. Его scroll/resize-обновления объединяются через `requestAnimationFrame`. Общая навигационная логика находится в `pixelCanvasNavigation.ts` и `usePixelCanvasNavigation.ts`. Координаты пикселя обновляются напрямую в status DOM без React rerender на каждый mousemove.

6. Редактор персонажа (чиби) — **в работе**: не отдельная вкладка. Сцена с `role: character`, шаблоны `chibi_32` (объём) и `chibi_25d` (`facing: card4`, Octopath-подмена анфас/затылок/бока + билборд в play). Стиль заливки `chibi` (по умолчанию) или `slasher` (Dungeon Slasher: `docs/EMBER_CHARACTER_STYLE.md`, кадр `docs/refs/dungeon-slasher-character.png`). Кнопки **+ Чиби** / **+ 2.5D** / **+ Slasher** / **+ Slasher 2.5D**. Капсула 22 vx, макушка 32. Скелет — иерархический FK (`voxelSkeleton.ts`): поворот родителя (торс) крутит детей (голова/волосы/руки); скульптор и `buildVoxelSceneMesh` делят один солвер. Play-привязка `characterId` и runtime-swap ещё нет; в скульпторе виды переключаются вручную. Resolver: `characterView.ts`. В спрайтовом редакторе пресет **+ Slasher** (`slasherCharacterPreset.ts`).

   Общий блок **Коррекция** тайлов и спрайтов выполняет HSV-сдвиг (тон, насыщенность, яркость) и контраст, медианное ограничение до `2–32` цветов с режимами без дизеринга / Bayer 4×4 / Floyd–Steinberg и внешний контур толщиной `1–4` пикселя по 4 или 8 соседям. Операции пропускают прозрачные пиксели, работают только в активной грани или цветовом слое, ограничиваются маской выделения, сохраняют alpha, уважают pixel/alpha lock и создают не более одного undo; параметры не сериализуются в пак.

   Общий **Вид холста** тайлов и спрайтов содержит session-only пиксельную сетку с шагом `1–8` и прозрачностью, вертикальные/горизонтальные направляющие с точным вводом, центром, drag и удалением, а также локальный референс до 20 МБ в режимах **поверх / под рисунком / рядом**. У референса настраиваются opacity, масштаб `10–400%`, сдвиг по X/Y и отражение. В редакторе спрайтов blob и настройки референса сохраняются в IndexedDB `ember-pixel-editor/references` по ключу `packId:sprite:spriteId` и восстанавливаются после смены ассета или перезапуска; это рабочее состояние редактора, оно не входит в pack, undo или экспорт. Object URL всегда освобождается при замене/закрытии. У тайлов референс остаётся session-only. Сетка, guides и reference — отдельные DOM/CSS-оверлеи: они не вызывают перерисовку bitmap при переключении.

   `EmberPixelSprite.worldOffsetVoxels?: { x, y, z }` — единый визуальный offset ассета в вокселях: X/Y лежат в плоскости карты, Z направлен вверх, 16 вокселей равны одной клетке. Поле нормализуется и сериализуется через `pixelSprite.ts`; Three runtime/editor-preview, tile preview и emissive local light используют тот же offset. Он намеренно не двигает authored placement, collider или logical cell. Нельзя добавлять отдельный placement-only offset поверх этого поля. Панели тайлов и спрайтов используют подписанные русские кнопки с общими SVG-иконками `PixelToolIcon`, а не одиночные неоднозначные буквы/символы.

   Спрайтовый редактор (пиксель), порядок:
   1. Один холст `W×H`, без полос крышка/стена — **сделано**.
   2. Вёрстка: шапка ассетов не вылезает в инспектор; роли ровной сеткой; палитра крупнее + ячейка «+»; тулбар с зазорами — **сделано**.
   3. **P2.5** четыре вида (`front` / `back` / `side_l` / `side_r`) на одном спрайт-ассете; в play подмена текстуры билборда от yaw (как voxel `characterCardViewFromYaw`), плоскость не крутить — **сделано**.
   4. **P2 слои** — optional `artLayers[]`, композит в `pixels` — **сделано**. Панель поддерживает inline-переименование, видимость, дубликат, удаление, порядок, opacity одной операцией history, режимы **Обычный / Умножение / Экран / Добавление**, блокировку пикселей и фиксацию alpha. Старые ассеты совместимы: новые поля опциональны, одиночный обычный непрозрачный слой по-прежнему схлопывается в `pixels`. `Clear` пишет в активный слой, а не только во временный композит. Вместе со слоями — кисти: **смягчение**, **затемнение по тону**, **осветление по тону**, **размазывание** (не копировать voxel shape-brushes).
   5. **P3 кадры** — optional `frames[]` + `durationMs`; не копировать voxel `EmberVoxelAnimClip` — **сделано**. Timeline показывает пиксельные миниатюры и поддерживает пустой кадр / дубликат рядом с активным, перестановку, удаление, пошаговый просмотр, диапазон **От–До**, loop/one-shot и onion skin (предыдущий красным, следующий зелёным, opacity 10–60%). Изменение `durationMs` записывается одной операцией undo после завершения ввода. Playback только переключает live-буферы: не сериализует спрайт и не вызывает `onChangePack` на каждом тике.
7. Creative Mode — **позже**, не в работе сейчас. Контент-боту Grok его не давать.

### Затем — Creative Mode

Цель: Minecraft-подобное редактирование от первого лица поверх той же системы данных, а не второй редактор.

- walk/fly;
- mouse look;
- raycast place/remove;
- hotbar из общей Library;
- переключение Surface/Grid Z;
- place voxel/sprite/light/trigger/region;
- тот же WorldObject adapter и CommandStack;
- undo/redo, validation и autosave;
- переход Creative ↔ orbit/editor без потери selection.

### После Creative Mode

1. Gameplay semantics: tile portal/trigger — **частично**: `scriptId` теперь action list или диалог (`emberScript.ts`). Экран инвентаря — **сделано**. Сейвы explore — **сделано** (`emberSave.ts`). Map fade — в play при смене карты.
2. Asset Library 2.0: tags/categories, usage references, safe rename/import, bulk actions.
3. Balance editors: enemies, weapons, pools, stages и playtest from editor.
4. Декомпозиция `MapEditorPanel.tsx` на editor services/hooks без изменения поведения.
5. `loadEmberPack` уже грузит `maps/`, `stages/`, `tilesets/`, `spawns/` и `voxels/models/*.json` как директории. Один воксельный объект = json+`.vox`; save пишет только dirty id. Песочница агента: карта/стадия `agent_sandbox` (механики). Explore-хаб `hu_tao_village`, стадия `village_stroll`, интерьер `hu_tao_house_interior`. Default stage остаётся ареной `hu_tao_p1`.
6. Решить судьбу Phaser legacy после достижения feature parity Three runtime.

## 12. Критерии готовности изменений

Изменение объекта считается завершённым только если:

- оно одинаково работает в Inspector, viewport и Library;
- preview совпадает с commit;
- undo/redo восстанавливает исходное состояние;
- JSON сохраняется компактно и проходит normalization/validation;
- runtime отображает тот же Transform и Scale;
- collider/light/outline используют тот же transform;
- изменение не вызывает полной перестройки мира без необходимости;
- есть targeted regression test;
- нет ошибок консоли и исчезающих shader/material classes.

Изменение производительности считается завершённым только после замера F3 на обычной сцене и stress crowd. FPS без CPU/GPU/draw-call данных недостаточен.

## 13. Рабочий процесс для следующего ИИ

1. Прочитать корневой `AGENTS.md`, этот файл (сначала §2.1 песочница) и релевантный раздел `docs/EMBER_ANOMALY.md`. Для рефакторинга прочитать `docs/EMBER_RESTRUCTURE_PLAN.md`. Если задача — **воксельные модельки для Grok / Voxel bro**, читать также `docs/EMBER_VOXEL_BOT.md`; это не даёт боту права менять движок.
2. Выполнить `git status --short` и `git fetch`. Grok / Voxel bro параллельно кидают PR с пропами в `main` — не считать локальный снимок актуальным remote. Перед пушем rebase на `origin/main`; не reset/checkout и не затирать `voxels/models` из этих PR. Мержить их PR только после явного «всё ок».
3. Проверить browser overrides перед правкой content JSON.
4. Найти существующий owner, общий контракт, всех потребителей и тесты до добавления нового поля, helper или файла. Для нового модуля объяснить, какую ответственность он забирает у существующего кода и почему это не вторая система.
5. Реализовать минимальный вертикальный slice через schema/types → validation → editor → preview → runtime → serialization → tests.
6. Добавить targeted tests.
7. Выполнить:

```bash
npx tsc --noEmit
npm test
npm run build
```

8. Визуально проверить редактор и игру. Для света дождаться крайних фаз flicker, а не оценивать один кадр.
9. Для performance-задач записать F3 до/после; при толпе использовать F4 и Shift+F4.
10. Обновить этот handoff, если принято новое архитектурное решение.

## 14. Что не делать

- Не раздувать `MapEditorPanel`, `VoxelSculptPanel`, `SpriteEditorPanel`, `TileEditorPanel`, `mapUtils`, `EmberThreeWorld` и глобальный `styles.css` новой самостоятельной подсистемой.
- Не создавать `Utils2`, `ManagerNew`, `ServiceV2`, второй controller или временный compatibility-path без owner, плана миграции и условия удаления.
- Не создавать третий renderer или отдельную collision-систему для Creative Mode (сам режим отложен).
- Не чинить editor отдельно от runtime копированием формул.
- Не возвращать глобальную 2D solid-проверку, игнорирующую высоту.
- Не поднимать point shadow map выше 256 и sun map выше 1024 без замера F3.
- Не подключать `three/addons/csm/CSM` — он конфликтует с voxel-light-snap и lamp-disc шейдерами.
- Не возвращать follow-volume / nested sun cascades: кастеры за игроком выпадают из карты, края umbra мерцают при движении.
- Не ставить `key.shadow.autoUpdate = true` на запечённое солнце.
- Не комбинировать каскады теней GLSL-тернарником по `NUM_DIR_LIGHT_SHADOWS`: обе ветки type-check, editor с одним DirectionalLight не компилирует шейдер и мир пропадает.
- Не пересчитывать все PointLight cube maps каждый кадр. Только ближайшая лампа в радиусе игрока может обновлять cube вместе с актёрами, и то через кадр.
- Не гонять `moveWithVoxels` / voxel-prop collision на каждого дальнего врага. On-screen tile collision + кинематика за экраном.
- Не пересобирать `RuntimeActorSpatialIndex` на каждый fixed AI step — один rebuild после catch-up.
- Не сохранять промежуточное значение тяжёлого input до commit/Enter.
- Не смешивать authored X/Y/Z с Three X/Y/Z напрямую.
- Не затирать local override содержимым пустого disk registry.
- Не дампить весь voxel-каталог в один JSON. Один объект = `voxels/models/<id>.json` + `<id>.vox`; отсутствие в памяти не удаляет диск.
- Не считать пустой `voxels/*.json` на диске доказательством, что вокселей нет (сначала `voxels/models/`, override и `.bak`).
- Не делать git reset/checkout Ember JSON.
- Не считать задачу исправленной только по unit-тесту, если дефект визуальный.

## 15. Главный принцип

Каждая следующая функция Ember должна укреплять единый каркас мира. Если изменение добавляет ещё один специальный путь для тайла, света, вокселя или Library, сначала нужно попытаться выразить его через общий WorldObject, Transform, Components, Modifiers, CommandStack и единый renderer/runtime contract.
