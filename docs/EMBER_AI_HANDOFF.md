# Ember — инструкция и handoff для ИИ

Актуально на 24 августа 2026 года. Этот документ — рабочий контекст для Cursor/Codex при продолжении разработки Ember. Он описывает не только существующий код, но и намерение системы: чего добивались, какие решения уже приняты и куда двигаться дальше.

**AI-агенты: механики (телепорт, зоны, ходьба, камера, тайлы, интерьеры, растительность, editor round-trip) проверять на стадии `agent_sandbox` / «Песочница агента». Не использовать арену `hu_tao_p1` и двор `hu_tao_yard` — там волны бьют по HP до того, как агент дойдёт до пада.**

Для задач Ember этот handoff имеет приоритет над старой пометкой «Ember не трогаем» в общем `docs/IMPROVEMENTS.md`: пользователь явно продолжает разработку Ember.

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
- `SceneEditorPanel.tsx` — нарративные сцены. `EmberScene.use`: `cutscene` | `talk` | `shop_intro`. Один граф, один `ScenePlayer`. Play overlay — HSR (без коробки). Кнопки **+ Сцена** / **+ Болтовня**. На объект вешается `scriptId` (dropdown сцен + `scripts/`). Trigger `scriptId` — action list (`talk` / `change_map` / `open_shop` / `give_item` / `set_flag` / `wait` / `run_script`) или id сцены.
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

Хаб (контент, не тестовый двор): старт `start` (16,29) южные ворота; дверь `vil_house_door` (12,9) + trigger `house_enter` → карта `hu_tao_house_interior`; **лавка на улице** `vil_shop_kiosk` (13,19) `wangsheng_kiosk` — прилавок/навес на перекрёстке тропы, видно с ворот если идти на север (подход (13,20)); talk `vil_talk_porter` (17,28) / `vil_talk_auntie` (11,21); quest `vil_quest_sign` (10,20) available; сундук `side_chest` (1,13) `coin`+`herb`; NPC `vil_npc_keeper` idle (14,18) / `vil_npc_plaza` wander. Чиби `vox_chr_*` на карту не ставить. **Полы домов и лавки на z0** (тот же ground plane, что улица); стены z1, крыши cutaway на z2, не наступать на крышу. Не оставлять walkable interior slab только на z1 без ступеньки.


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
- F4 создаёт stress crowd 120, Shift+F4 — 180 и включает неуязвимость.

### Профилирование

F3 показывает FPS, CPU/GPU frame time, draw calls, triangles, chunks/workers, lights/shadows, instances, AI/physics/LOD/reflection.

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
- `dynamicPointShadows` (0..числу объектов света) ближайших видимых ламп временно меняют target на actor-aware cube (слои 0+1) через кадр; приоритет у игрока. При выходе из пула восстанавливается закешированная static-карта без шести граней;
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
4. **Сделано:** таблица предметов + 16×16 пиксельные иконки + редактор **Предметы** (`items/catalog.json`, `emberItem.ts`, `ItemsEditorPanel.tsx`). Две полосы оружия: `weapon_arena` / `weapon_jrpg` + `useIn`. Боевые числа (`atk`/`def`/`hpRestore`) резолвятся в `playerCombatStats` (`emberCombatStats.ts`).
5. **Сделано:** магазин. Конструктор: interactivity `shop` + `shopId` из `shops/catalog.json` (не зона Shop). Play: F открывает панель купить/продать, Esc закрывает. Валюта `coin`. Песочница: прилавок `sbx_shop_kiosk` (8,20) → `village_kiosk`. Редактор: вкладка **Магазины**. Продажа любого предмета из инвентаря: цена листинга, иначе каталог `sellPrice`; `unsellable` / `coin` — отказ. Продажа листинга с конечным `stock` restock +1. ember-agent / MCP: `interact`, затем `buy` / `sell` (`itemId`, опционально `shopId`). `get_state` включает `inventory`, `equipment` и `wallet`.
6. **Сделано:** экран инвентаря / экипировки и боевые статы. Play: **I** и HUD **Сумка**; слоты `weapon` / `arena_weapon` / `head` / `body` / `accessory`. `weapon_jrpg` → `weapon` (explore), `weapon_arena` → `arena_weapon` (пули `hu_tao_p1`). Без экипа: atk 4, def 0. Explore-удар = JRPG atk; входящий `max(1, raw − def)`. Арена: `weapons.json.damage + atk_арены − 4`. Стартовый `starterWeaponId` на арене автонадевается в `arena_weapon`. Расходники с `hpRestore` > 0 — **Использовать**. Магазин эксклюзивен. Headless: dump `equipment`; CLI `equip --item` / `use --item`.
7. **Сделано:** сейвы explore (`emberSave.ts`). Слоты 0–9 на пак. Play: localStorage; CLI/MCP: `debug/ember-saves/<packId>/slot-N.json`. Автосейв на карту / сундук / магазин / выход. Пустой слот = текущий старт инвентаря. Vitest: dump → save → load.

Не добавлять отдельные виды зон Door / Talk / Shop в библиотеку.

Опциональные хвосты после этапа 7: restock UX; MCP tool `equip`; вкладка **Магазины** уже есть. Talk/custom скрипты — dialog overlay + `scriptId`. Облако сейвов не делать.

## 11. Ближайший план

### Сначала — стабилизация мира

1. Проверить полный static shadow bake на нескольких authored и emissive источниках: стены, voxel props, спрайты, разные Z и максимальное мерцание.
2. Если 1.5× окажется недостаточно или слишком дорого, вынести `shadowBakeReachMultiplier` в компонент/Inspector света с безопасным диапазоном, но не возвращать per-frame bake.
3. Прогнать collision regression: проход под блоком, лестницы, стены неполной высоты, stacked voxel props, падение, step-up и разные Scale.
4. Убедиться, что Library placement, Outliner selection и Inspector дают одинаковый объект и одинаковые undo/redo операции.
5. В play проверить map-wide sun bake (тени объектов за игроком не обрываются) и свет ламп внутри солнечной умбры. Дальние лампы не должны пересобирать cube maps. F3 и F4.

### Скульптор (MagicaVoxel-паритет)

1. Watch `.vox` / открыть MagicaVoxel — **сделано**.
2. Shape brushes: линия — 3D drag; коробка/сфера — плоскость грани клика, затем выдавливание по нормали (ЛКМ/Enter, ПКМ/Esc) + поворот/дубль выделения — **сделано** (`voxelShapeBrush.ts`, N / ] / [ / Ctrl+D).
3. Replace-color по палитре — **сделано** (`voxelPaletteOps.ts`: инструмент **Замена**/P, Alt+клик слота, Shift стирает цвет; выделение ограничивает область).
4. Isolation + overlay коллизии + preview explore-камеры — **сделано**: Shift+H / `/` изоляция, Alt+H показать все; collision overlay рисует AABB физических вокселей и капсулу игрока на `player_start`; Q / Explore — камера как в play; в скульпторе **Капсула** и **Игра** (Shift+F).
5. Library tags + Find References — **сделано**: теги на voxel/sprite, поиск и чипы в лотке библиотеки, Find References в инспекторе (**К размещению** на открытой карте).
6. Редактор персонажа (чиби) — **в работе**: не отдельная вкладка. Сцена с `role: character`, шаблоны `chibi_32` (объём) и `chibi_25d` (`facing: card4`, Octopath-подмена анфас/затылок/бока + билборд в play). Стиль заливки `chibi` (по умолчанию) или `slasher` (Dungeon Slasher: `docs/EMBER_CHARACTER_STYLE.md`, кадр `docs/refs/dungeon-slasher-character.png`). Кнопки **+ Чиби** / **+ 2.5D** / **+ Slasher** / **+ Slasher 2.5D**. Капсула 22 vx, макушка 32. Скелет — иерархический FK (`voxelSkeleton.ts`): поворот родителя (торс) крутит детей (голова/волосы/руки); скульптор и `buildVoxelSceneMesh` делят один солвер. Play-привязка `characterId` и runtime-swap ещё нет; в скульпторе виды переключаются вручную. Resolver: `characterView.ts`. В спрайтовом редакторе пресет **+ Slasher** (`slasherCharacterPreset.ts`).

   Спрайтовый редактор (пиксель), порядок:
   1. Один холст `W×H`, без полос крышка/стена — **сделано**.
   2. Вёрстка: шапка ассетов не вылезает в инспектор; роли ровной сеткой; палитра крупнее + ячейка «+»; тулбар с зазорами — **сделано**.
   3. **P2.5** четыре вида (`front` / `back` / `side_l` / `side_r`) на одном спрайт-ассете; в play подмена текстуры билборда от yaw (как voxel `characterCardViewFromYaw`), плоскость не крутить — **сделано**.
   4. **P2 слои** — optional `artLayers[]`, композит в `pixels`. Вместе со слоями — кисти: **смягчение**, **затемнение по тону**, **осветление по тону**, **размазывание** (не копировать voxel shape-brushes) — **сделано**.
   5. **P3 кадры** — optional `frames[]` + `durationMs`; не копировать voxel `EmberVoxelAnimClip` — **сделано**.
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

1. Прочитать этот файл (сначала §2.1 песочница) и релевантный раздел `docs/EMBER_ANOMALY.md`. Если задача — **воксельные модельки для Grok / Voxel bro**, вместо движка читать `docs/EMBER_VOXEL_BOT.md`.
2. Выполнить `git status --short`. Рабочее дерево содержит пользовательские и предыдущие незакоммиченные изменения — не применять reset/checkout и не удалять несвязанные файлы.
3. Проверить browser overrides перед правкой content JSON.
4. Найти существующий общий контракт до добавления нового поля или helper.
5. Реализовать минимальный вертикальный slice через schema → editor → runtime.
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
