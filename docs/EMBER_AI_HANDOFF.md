# Ember — инструкция и handoff для ИИ

Актуально на **29 августа 2026**. Этот документ — рабочий контекст для Cursor/Codex. Он описывает существующий код, принятые решения и куда двигаться дальше.

**Статус:** Ember через **Three.js приостановлен**. Не развивать JOI play (`EmberThreeWorld`), World Editor viewport, crowd, atlas и свет в `src/game/three`. **Фокус — Godot 4** (sibling `../ember-godot`) и постепенная миграция: `.tscn` после импорта, тот же `content/ember`. Приёмка — `../ember-godot/MIGRATION_TEST_PLAN.md`. Нижележащие §0–§8 и §9.1 — frozen контракт legacy, не backlog фич.

**AI-агенты:** продуктовые механики проверять в Godot `agent_sandbox`. JOI `ember-agent` / MCP — сверка пака. Не использовать арену `hu_tao_p1` и двор `hu_tao_yard`. Не водить WASD в Chromium.

Для задач Ember этот handoff имеет приоритет над старой пометкой «Ember не трогаем» в `docs/IMPROVEMENTS.md`. Three-пауза имеет приоритет над волнами в `EMBER_RESTRUCTURE_PLAN.md`.

**Целевой продуктовый vision:** [`EMBER_JRPG_DESIGN.md`](EMBER_JRPG_DESIGN.md). Это цветастая top-down party JRPG с графом зон, пошаговой стихийной боёвкой, спутниками, отношениями и сюжетной романтикой. Исследованные официальные референсы и границы заимствования находятся в [`EMBER_JRPG_REFERENCES.md`](EMBER_JRPG_REFERENCES.md). Vampire Survivors-подобный Arena/Anomaly снят с продуктового направления; его JOI/Three runtime — frozen legacy, а не будущий режим. GDD не разрешает напрямую менять schema: открытые боевые и нарративные решения сначала проходят D0/D1-прототип.

**Перед любой правкой проекта прочитать корневой [`AGENTS.md`](../AGENTS.md).** Новые системы — в Godot. JOI pack + voxel sculptor остаются writer'ами моделей. `EMBER_RESTRUCTURE_PLAN.md` не исполнять.

## 0. Frozen контракт crowd (JOI/Three) — не развивать

С 29 августа 2026 crowd/Three на паузе. Ниже — как было; не расширять bake/flow в JOI. Продуктовое движение — Godot.

С 25 августа 2026 года источником правды для перемещения большой толпы в legacy Three являлся **baked height-surface grid**, а не старые плоские этажи и не специальные маршруты для отдельных лестниц.

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

Целевая игра — Godot 4 (`../ember-godot`). JOI Conductor держит пак `content/ember` и voxel-скульптор; встроенные вкладки Аномалия / Ember Editor — **приостановленный Three-shell**.

Основные игровые направления:

1. Исследование объёмных карт: прогулка, поиск путей, головоломки, интерактивные объекты, триггеры, события и сюжетные зоны — **в Godot**.
2. Legacy Arena/Anomaly в JOI: только совместимость; новый контент для этого режима не планируется.
3. Авторство карт после импорта — Godot `.tscn`; voxel-модели по-прежнему пишутся в JOI.

Источник правды режима в паке — `EmberMap.playProfile` (`arena` | `explore`, omit = `arena`). **JOI Three play loop (`EmberThreeWorld`) заморожен**, не развивать и не плодить второй Three-движок. Богатые локальные умбры — §9.2 (Godot).

Frozen JOI play (не backlog): мышь крутит камеру с pointer lock с клика «Начать». Риг — `EmberMap.camera` (`emberCamera.ts`): FOV, дистанция, polar, yaw, lookHeight, near/far, pitch lock. Omit = iso JRPG (FOV 40°, polar 0.95, dist tile×7.5). Встроенные пресеты Iso / Ближе / Высоко / Широкий (FOV 60°). Пользовательские — `pack.cameraPresets` (`cameras/registry.json`, id `cam_*`): **все карты** или `mapId` только этой карты. Dock Камера и пауза play сохраняют в реестр; слайдеры play по-прежнему сессия и карту не пишут. Esc открывает меню паузы (курсор виден) с теми же слайдерами камеры (сессия, карту не пишет). Alt-tab / другое окно / скрытая вкладка тоже открывают паузу (`playBackgroundShouldPause`); сами не снимают. Chromium после Esc ~1.25 с отвергает `requestPointerLock` даже с клика, поэтому «Продолжить» активна после этой паузы и берёт lock с жеста. Пока lock нет, Windows ClipCursor по HWND окна + SetCursorPos в центр (как в играх): курсор не уходит на второй монитор и камера не упирается в край. Не открывать меню на каждый `pointerlockchange`/`pointerlockerror`. ЛКМ не атакует. Explore грузит всю карту до `api.ready` и не пересобирает свет при смене чанка.

- **Арена** (в т.ч. существующий `hu_tao_yard` без поля): волны из spawn table, F4/Shift+F4 орда, enemy LOD/crowd, мало PointLight cube-shadow, геометрия может быть простой.
- **Исследование** (деревня / JRPG): орда и F4 выключены; bake-солнце, уличные фонари (cube только у ближайших), окна = emissive fill без cube, стоячие/гуляющие NPC (кап 24, без боя). Диалоги и лавка висят на объектах (`talk` / `shop` / `quest_marker`), не на регионах NPC.

Бюджеты профиля: `resolvePlayProfileBudget` в `renderBudget.ts`. Stage не дублирует профиль: если stage ссылается на explore-карту, волны просто не идут.

Главная инженерная цель сейчас — Godot-скелет мира (сцена, Inspect, один owner на систему). JOI Three editor не наращивать. Понятия ниже относятся к паку и к Godot, не к новым Three-системам:

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

### JOI/Three runtime — пауза

Не развивать. Справка для hotfix и сверки с Godot:

- `src/game/three/createEmberThreeGame.ts` — фабрика Three.js runtime.
- `src/game/three/EmberThreeWorld.ts` — бывший play loop.
- `src/game/phaser/` — ещё более старый legacy. Не дублировать системы ни туда, ни в Three.

Продуктовый play и authoring карт — `../ember-godot`.

### Главный редактор карты

- `MapEditorPanel.tsx` — orchestration UI карты. Сейчас крупный монолит; новые алгоритмы желательно выносить в сервисы/хуки, а не увеличивать файл бесконечно. Изоляция: Shift+H / `/` (Alt+H показать все). Collision overlay: стены + AABB физических вокселей + капсула игрока на spawn. **Explore · Q** — камера как в play (`map.camera` риг). Dock **Камера**: ракурс + authored FOV/дистанция/наклон/пресеты (`EmberCameraRigFields` + `EmberCameraPresetLibrary`, контракт `emberCamera.ts` / `cameraPresets.ts`).
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

**Play (человек):** `http://127.0.0.1:5173/` → боковое меню **Мини-игры** → вкладка **Аномалия** → стадия **Песочница агента** → Начать. Волны/F4 орда не идут (explore). Сайдбар: [HUB.md](HUB.md).

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

**Редактор:** `http://127.0.0.1:5173/` → **Мини-игры** → вкладка **Ember Editor** → Мир / **Карты** → селект **Песочница агента**. Каталог лута: вкладка **Предметы** (`sellPrice`, флаг **Не продаётся**). Ассортимент лавок: вкладка **Магазины** → `shops/catalog.json` (цены, сток; киоск на карте по-прежнему interactivity `shop` + `shopId`, не зона Shop).

Не ходить на `hu_tao_yard` / стадию `hu_tao_p1` («Двор Ху Тао — срез») для этих проверок: там spawn-зоны и волны. `hu_tao_village` / `village_stroll` — JRPG-хаб на уже существующих объектах (дверь+`targetMapId`, лавка, talk NPC, quest marker, сундук). **Механики (interact / shop / смена карты / fade) проверять только на `agent_sandbox`.** Деревню не водить в Chromium для проверки движка; контент-тест — `villageExploreContent.test.ts`.

Хаб (контент, не тестовый двор): старт `start` (16,29) южные ворота; дверь `vil_house_door` (12,8) + trigger `house_enter` → карта `hu_tao_house_interior`; **лавка на улице** `vil_shop_kiosk` (13,19) `wangsheng_kiosk` — прилавок/навес на перекрёстке тропы, видно с ворот если идти на север (подход (13,20)); talk `vil_talk_porter` (17,28) / `vil_talk_auntie` (11,21); quest `vil_quest_sign` (10,20) available; сундук `side_chest` (1,13) `coin`+`herb`; NPC `vil_npc_keeper` idle (14,18) / `vil_npc_plaza` wander. Чиби `vox_chr_*` на карту не ставить. **Полы домов и лавки на z0** (тот же ground plane, что улица); стены z1, крыши cutaway на z2, не наступать на крышу. Не оставлять walkable interior slab только на z1 без ступеньки.


## 3. Контент-пак

Исходные данные находятся в `content/ember/`:

- `pack.json` — метаданные и default stage;
- `maps/` — карты (`loadEmberPack` читает всю директорию; fallback — `hu_tao_yard`);
- `tilesets/` — тайлы, материалы, физика и семантика (директория; fallback — `graveyard_16`);
- `sprites/registry.json` — пиксельные спрайты (Ember JSON: пиксели, слои, кадры, collider/emissive). Рисование — Aseprite. Исходник `sprites/source/<id>.aseprite` (как `.vox` у вокселей), не второй формат пака. Импорт: `npm run ember-aseprite -- import file.aseprite [--id spr_foo]`, в редакторе кнопки **Из Aseprite** / **Aseprite**. Кодек: `asepriteFile.ts` / `asepriteImport.ts`. Холст 4–64 px, до 8 слоёв и 12 кадров. Имена слоёв `front`/`back`/`side_l`/`side_r` → `views`; `emissive`/`glow` и `shine` → каналы. Остальные поля спрайта при повторном импорте того же id сохраняются.
- `voxels/models/<id>.json` + `voxels/models/<id>.vox` — пара prefab: JSON (id, теги, коллизия, свет, extra channels), MagicaVoxel `.vox` (форма + палитра). `writeVoxelRegistry` пишет оба файла; `loadEmberPack` склеивает пару. Старые JSON с `model.voxels` ещё читаются до первого save;
- обмен с внешним миром: `.vox` (форма + палитра), Ember JSON (коллизия/свет/id). Кодек: `src/game/voxel/vox/voxFile.ts`, `emberVoxCodec.ts`. Оси: MagicaVoxel Z-up → Ember Y-up (`ember(x,y,z) = vox(x,z,y)`). В скульпторе: **Импорт** / **Из .vox** / **В .vox** / **MagicaVoxel** (открыть файл и watch: save в MV → сетка в Ember, JSON не затирается); extra channels не ездят через MagicaVoxel. Куб/ластик: точка; линия — 3D drag; коробка/сфера — ЛКМ-drag по грани клика (XZ/XY/YZ), отпускание — выдавливание по нормали, ЛКМ/Enter подтверждают, ПКМ/Esc отмена (N), выделение ↻X/Y/Z и Дубль (`voxelShapeBrush.ts`). Палитра: **Замена** (P) и Alt+клик слота — remap индекса по всей модели или выделению (`voxelPaletteOps.ts`);
- библиотека карты: поиск по имени/id/тегу и чипы тегов (`libraryTags.ts`, `emberLibraryIndex.ts`). Теги пишутся на prefab (`tags` у модели и обёртки JSON) и спрайте; префиксы `vox_vil_` / `vox_fan_` / `vox_chr_` дают search-only `village` / `fantasy` / `character+chibi`, пока автор не сохранит явный список. Find References считает voxelProps, chest `closedModelId`/`sceneId` и чужие voxel-сцены; **К размещению** прыгает по открытой карте;
- `voxels/scenes/<id>.json` — multi-object workspace, если сцена не совпадает с id модели. Персонаж (`role: character`, шаблон `chibi_32`) пишется сюда: id `vox_chr_*`, части — отдельные `voxels/models/vox_chr_*_<slot>`;
- `loadEmberPack` читает `voxels/models/*.json` (и leftover `registry.json` / `village.json`, если они ещё лежат в корне), затем соседний `.vox` если `mesh.file` задан и occupancy в JSON пустая;
- сохранение через `writeVoxelRegistry(..., { dirtyIds })` пишет **только** изменённую пару json+`.vox`; отсутствие в памяти ≠ удаление;
- старые монолиты после сплита: `voxels/_legacy/` (локальный бэкап, не в git);
- `lights/registry.json`, `looks/registry.json`, `cameras/registry.json` — пресеты света, образа и камеры. Пустой `cameras/registry.json` (`{ "presets": [] }`) обязателен: 404 этого файла блокировал «Начать»;
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

## 8. Three.js render/runtime (frozen)

Не расширять. Ниже — как было на момент паузы 29 августа 2026, для сверки с Godot.

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
- `pointShadowAtlas.ts` — layout 4×2 + sticky слоты;
- `pointShadowAtlasGpu.ts` — cache tile / blit / dispose;
- `pointShadowAtlasPass.ts` — 6-face bake в кэш + bind uniforms. Bake обязан снимать `scene.background`/`fog`. Корпус/рамки лампы **пекутся** как у WebGLShadowMap (`MeshDistanceMaterial`, BackSide, маленький near) — не discard-сфера и не cube-near, иначе умбра от решётки пропадает. Пустой атлас = far-depth (белый). `shadow.intensity` (leak) идёт в `mix`.
- `editorThreePreview.ts` / `EmberThreeWorld.ts` — orchestration bake.
- `mapAtmosphere.ts` / `fogDensity.ts` / `postFx.ts` — туман, погода, блёстки, bloom/grade/tilt-shift.

Принятое решение:

- солнце/луна — **одна** map-wide ortho-карта, печётся со static layer 0 вместе с лампами и не следует за игроком;
- play и editor: sun map 1024 (одна cached atlas); не поднимать выше 1024 без замера F3;
- локальные PointLight **добавляют свет поверх** baked sun-umbra (toon — сумма источников). В тени от солнца факел всё равно освещает;
- игрок и враги на layer 1: не входят в sun bake, попадают в actor-aware recook ближайшей лампы (слот атласа, не Three cube);
- fake ellipse/projected actor shadows удалены и не должны возвращаться автоматически;
- официальный Three.js CSM не используется — он патчит глобальные shader chunks;
- **Сейчас (волна D):** PointLight — fill; `castShadow=false`; `NUM_POINT_LIGHT_SHADOWS=0`. Умбра только из atlas sampler (K=8) в `voxelLightSnap`. Bake — свой 6-face pass в cache tile. Sticky hysteresis слотов live на каждом present. Dual cube path удалён. Солнце — один directional sampler.
- `dynamicPointShadows` выбирает одну ближайшую лампу для actor-aware recook слота атласа (слои 0+1) через кадр; приоритет у игрока. Если игрок/NPC ближе keep-out (`pointLightActorRecookBlocked`: near×16 / radius×6 / 12), recook не идёт — в атласе static tile как в редакторе (иначе cube near-plane чернит грани у фонаря). При толпе ≥160 recook выключен. Выход из пула не relink'ает Three `shadow.map`.
- вход/выход динамического recook используют `dynamicShadowEnterScale` / `dynamicShadowExitScale` (по умолчанию 0.8/1.0 радиуса); слоты атласа — `POINT_SHADOW_SLOT_ENTER_SCALE = 0.8`;
- CSM-аддон, screen-space contact shadows, follow-cascades и fake ellipse/blob не используются;
- Atlas cache tiles обновляются только после изменения terrain/props/light или ручной команды «Пересчитать»;
- мерцание меняет `PointLight.distance`, но не пересобирает шесть граней каждый кадр.

Атмосфера (`map.light.atmosphere`):

- FogExp2 density = `fog * 0.02 + haze * 0.003` (`fogDensity.ts`). Нет пола `0.002` и порога «выкл ниже 0.01»: 0.001–0.05 — лёгкая дымка, 1 — прежний максимум. Слайдер шагает 0.001.
- Частицы в `mapAtmosphere.ts`: дождь, пыль, светлячки, **блёстки** (`sparkle`). Облачные тени, тёплая haze, блик солнца, pixel sky.
- Post: bloom + grade/vignette + **tiltShift** (screen-Y макро/diorama, без depth buffer) в `postFx.ts`.
- Встроенный look `look_toy_diorama` / «Игрушечный»: высокое солнце, пастельный fog, sparkle, лёгкий tilt-shift. Не меняет authored JSON карт, пока его не применить в Настройках.

Два play-профиля одной сцены:

- **арена** — меньше fill-ламп, horde; запечённый cube всё равно у каждого shadow-requesting источника; стадия завершается по таймеру;
- **explore** — больше fill-ламп и NPC; прогулка без победы по таймеру. Streaming выключен: play ждёт `api.ready` (вся местность + props + bake atlas tiles + compile шейдеров). Actor recook — пул `DYNAMIC_LOCAL_SHADOW_MAX_LIGHTS` (1 nearest lamp). Окна = emissive fill без bake (`lampFlickerShadowsOnly`). Bake-кэш = authored `maxPointShadows` (26 на fan_town), не profile 6 cube-семплеров. Шейдер семплирует K=8 sticky. Overlay держится до «Шейдеры…», mid-load `post.render` не вызывается.

F3 показывает `Atlas slots used/K cached C  recook D` и `Shadow bank dirty`. Point cubes больше нет.

Критичная деталь Three.js: `PointLightShadow.updateMatrices()` перед рендером заменяет `shadow.camera.far` текущим `PointLight.distance`. Поэтому простое присваивание увеличенного `camera.far` не работает.

Правильный bake:

1. `beginStaticPointShadowBake(root)` сохраняет live distance;
2. временно ставит distance = authored distance × 1.5;
3. renderer создаёт полную cube-depth map;
4. `restore()` возвращает мерцающий cutoff, не меняя baked camera far/decode range.

В редакторе рядом с переключателем света есть кнопка «Пересчитать статические тени», вызывающая `EditorThreePreview.rebuildStaticShadows()`.

Если добавляется новая операция изменения статического объекта или света, она обязана вызвать `invalidatePointLightShadows` и поставить bake pending. Иначе viewport покажет старую тень.

## 9.1 Point-shadow atlas — план замены Three cube samplers

Игры с «множеством теней без фризов» не кладут N отдельных cubemap в forward-шейдер и не включают/выключают `castShadow` по frustum. Они **пекут в кэш**, а шейдер всегда семплирует **одно и то же K** из атласа; какая лампа в слоте — uniform/blit, не `#define`.

Ember сейчас на стоковом MeshToon + `USE_SHADOWMAP`: каждый `PointLight.castShadow` добавляет sampler и пересобирает все toon-материалы. Поэтому authored `maxPointShadows: 26` на `fan_town` давал пустой play, а «печь все и показывать кто в кадре» ломает линковку.

### Целевой контракт

1. **Свет и тень разделены.** Все PointLight (фонари, окна) остаются источниками fill. Число источников не режется. Cube/умбра — отдельный ресурс.
2. **`NUM_POINT_LIGHT_SHADOWS` всегда 0.** Ни один PointLight не ставит `castShadow` в play/editor после миграции. Солнце — по-прежнему один directional sampler.
3. **Один atlas sampler.** Упаковка грани как у Three `cubeToUV` (4×2 на лампу, face 256). Слоты тайлятся в одну 2D depth/RGBA-карту, которая влезает в `maxTextureSize` (типично 2048 или 4096). Математика: `pointShadowAtlas.ts`.
4. **K слотов в шейдере — compile-time константа** (`POINT_SHADOW_SHADER_SLOTS = 8`). Не зависит от карты, не меняется при ходьбе/orbit. Цикл `emberAtlasShadow` в `voxelLightSnap` (не третий renderer, не `*ShadowV2`).
5. **Bake-кэш ≠ sample set.** `maxPointShadows` на карте = сколько requested ламп **запекаем** (до `MAP_POINT_SHADOWS_MAX` / GPU). Кэш по id света: 4×2 тайл. Промах кэша = один light / кадр (6 граней), не все сразу. Попадание в рабочий атлас = blit, без шести проходов сцены.
6. **Назначение слотов — influence, не camera frustum.** Фонарь за спиной всё равно кладёт умбру на землю в кадре. Score = ground-distance / reach (как `pickPointShadowSlotLights`). Sticky index: лампа держит свой слот, пока challenger не лучше на enter hysteresis (`0.8`, как dynamic enter). Дырки не компактить — иначе лишний blit. **Focus:** play = ноги игрока; редактор = `player_start` / тайл Explore·Q (`pointShadowAtlasFocus.ts`), **не** orbit look-at. Present — `presentPointShadowAtlas` (один leaf).
7. **Кто попадает в кэш.** Explore: torch/lantern flicker + `emissiveLightShadows` (окна — fill без bake). Arena: все shadow-requesting. Редактор печёт тот же набор; explore grant ranking использует тот же focus, что слоты. Кнопка «Пересчитать» помечает кэш dirty, не relink.
8. **Динамические актёры.** Один слот атласа (не отдельный Three cube) раз в кадр печётся с layer 0+1 для ближайшей лампы к игроку. Толпа ≥160 — слот static-only, как сейчас. `DYNAMIC_LOCAL_SHADOW_MAX_LIGHTS` остаётся 1.
9. **Мерцание.** Live `PointLight.distance` дышит; bake far = authored × 1.5, как `beginStaticPointShadowBake`. Атлас не перепекать от flicker.
10. **Strangler.** `LocalPointShadowMapBank` не живёт рядом с `AtlasBankV2`. Старый Three cube sampling удалён в волне D. Grant bake-слота — `emberShadowGranted`, не `PointLight.castShadow`.

### Нюансы (не игнорировать)

- **Frustum лампы ≠ тень в кадре.** Не cull по видимости меша фонаря.
- **WebGL2 cube array** не использовать как обязательный путь: 2D atlas + `cubeToUV` совпадает со stock Three helpers и WebGL1.
- **VRAM:** 8 слотов × 1024×512 (tile 256×4 / 256×2) ≈ 2048². Кэш на 26 ламп — отдельные RT или CPU-blit в больший offscreen; не раздувать shader-атлас до 26.
- **Fillrate:** цикл 8 cube-compare на каждый toon-пиксель. K=8 — потолок первого среза; поднимать только с F3. Не 26 в фрагменте.
- **Инстансинг / voxel snap:** тот же `onBeforeCompile`, bump `CACHE_TAG` в `voxelLightSnap.ts` при смене GLSL.
- **Editor preview = play math.** Layout, score, hysteresis, present — чистый leaf (`pointShadowAtlas.ts` / `pointShadowAtlasPass.ts` / `pointShadowAtlasFocus.ts`), без копии формул в `editorThreePreview`. Слоты редактора не следуют за орбитой.
- **Play bake без cutaway.** `applyPlayInteriorCutaway` прячет крыши/стены до tick bake; editor `cutawayMeshes: false`. Солнце и atlas пекутся через `withCutawayCastersVisible`, иначе play-умбра — другая «карта света». Камера слоты не двигает и карту не перепекает.
- **Play Reload** пересобирает Three-мир (stop + start с новым паком), не только `loadEmberPack` в React state.
- **Bake = 6-face MeshDistanceMaterial, не WebGLShadowMap.** `scene.overrideMaterial` — один program, ломает смесь Mesh (террейн) и InstancedMesh (фонари). Stock `WebGLShadowMap.render` компилирует distance-вариант на каждый toon-материал и вешает оверлей «Свет и тени…» на больших картах (`hu_tao_yard`). Bake временно ставит два `MeshDistanceMaterial` на кастеров (Mesh / InstancedMesh) и пишет 4×2 сам. Color pass: `castShadow=false` / `NUM_POINT_LIGHT_SHADOWS=0`.
- **JSON:** не добавлять поле ради UI. Слайдер `maxPointShadows` начинает значить bake-cap; K не сериализуется.
- **Не трогать** sun ortho, crowd hot path, крышки сундуков, дверь `(12,8)`, voxel-модели ботов.

### Порядок волн

| Волна | Что | Выход |
| --- | --- | --- |
| **A** | `pointShadowAtlas.ts`: layout 4×2, fit в maxTextureSize, sticky assign + tests | **сделано** |
| **B** | GPU: Three 4×2 `shadow.map` → cache tile; blit tile → shader atlas; dispose | **сделано** |
| **C** | `voxelLightSnap` семплирует атлас, K константа; PointLight `castShadow=false` | **сделано** — `NUM_POINT_LIGHT_SHADOWS=0`; F3 `Atlas slots used/cached`. Follow-up: небо не писать в packed depth; пустой атлас = белый; хост-лампа печётся (рамки), без discard-сферы |
| **D** | Удалить leftover Three cube sampling / live hysteresis (не fill) | **сделано** — один путь; F3 `Atlas slots/recook`; grant через `emberShadowGranted` |
| **D+** | Один focus editor/play | **сделано** — spawn / Explore·Q / игрок, не orbit; `presentPointShadowAtlas` |
| **D++** | Play bake = editor casters; Reload remount | **сделано** — cutaway не прячет кастеров на bake; play Reload stop+start |
| **E** | 6-face bake без override и без WebGLShadowMap | **сделано** — два MeshDistanceMaterial (Mesh / InstancedMesh); load не компилирует toon-distance |

Волна D: play/editor не ставят `PointLight.castShadow`. Банк не держит Three `shadow.map`. Шейдер не патчит `getPointShadow` для cube sampling. Sticky hysteresis слотов (`0.8`) вызывается каждый present. Dual path на кадре запрещён (`NUM_POINT_LIGHT_SHADOWS < 1`). Bake по-прежнему снимает background/fog; хост-лампа (рамки) печётся BackSide + authored near. D+: editor atlas focus = spawn / Explore·Q, play = actor; орбита камеры слоты не двигает. D++: play печёт с видимыми cutaway-кастерами; Reload stop+start. E: 6-face пишет два MeshDistanceMaterial на кастеров, не override и не `WebGLShadowMap.render`.

**Заморозка (25 августа 2026).** Волны A–E закрыты. В JOI больше не расширять atlas (не поднимать K, не возвращать `WebGLShadowMap.render`, не чинить «каждый фонарь как URP»). Fill ламп не резать. Срез механик — `agent_sandbox`. Богатые умбры деревни проверяются **вне** этого репо.

## 9.2 Godot 4 — активный runtime и постепенная миграция

Three в JOI на паузе. Продуктовая разработка — sibling `../ember-godot` (Godot 4 Forward+), не второй renderer внутри joi-conductor. **Правда карты — Godot `.tscn` / `res://prefabs/voxels/*.tscn`; правда voxel-модели — пара `.vox` + `.json` в JOI pack.** Godot-prefab/mesh является производным cache, а не вторым voxel-форматом. Полный импорт placements/terrain из JOI односторонний; меню **Ember: Reimport map from pack…** затирает сцену и требует подтверждения. Оси: MagicaVoxel Z-up → Ember/Godot Y-up, `ember(x,y,z) = vox(x,z,y)`. Лампа: Omni в центроиде emissive-вокселей, ребёнок пропа; камень кастит, glow-воксели окон — нет. Godot toon shader оставляет штатный view-space `LIGHT_VERTEX` без записи: повторный `MODEL_MATRIX → world → VIEW_MATRIX` давал precision drift и частую shadow-acne «черепицу» на больших поверхностях. `voxelSnapLight` остаётся Three-only настройкой вида и в Godot не импортируется. Toon-ступени применяются только к directional-свету; локальные Omni используют плавную `N·L` ramp (`Map.lamp_softness`, default 1), иначе каждый PointLight рисует концентрические кольца даже при выключенных тенях. Луна: `moon_energy(...)`; PSSM и atlas на инспекторе `Map` (по умолчанию 4 split + 4096). Omni fill все лампы; cube-тени — ближайшие `lantern` (`omni_shadow_count`, гистерезис, в редакторе по явному preview-флагу), `ShadowBody` слой 2. Дальность камеры — `Map.camera_far` (по умолчанию 5000). Play: WASD на `scenes/fan_town.tscn` / `scenes/agent_sandbox.tscn` (не `hu_tao_yard` / `hu_tao_p1`, не Chromium). В joi-conductor не заводить второй renderer / `*ShadowV2` / Godot-bridge.

Проверка миграции зафиксирована в `../ember-godot/MIGRATION_TEST_PLAN.md`: одинаковый маршрут и метрики на профилях 0/2/4/8 (F3 overlay, F4 следующий профиль), затем три timed voxel-задачи. Editor dock `EMBER · проверка миграции` применяет профиль, отдельно показывает `.vox` и `.json` выбранного `EmberVoxelProp`, число instance и свежесть generated prefab по SHA-256 пары исходников. Точечная пересборка `res://prefabs/voxels/<modelId>.tscn` вызывает общий `EmberVoxelPrefab.validate_packed`: проверяет Mesh и ожидаемые по metadata Collision / Omni / host ShadowBody, затем сравнивает hash `.tscn` карты и `transform + placement_id` всех instance до/после. Generated mesh/prefab сохраняют UID из заголовка ресурса при перезаписи, иначе ссылки открытых сцен протухают после headless rebuild. Тот же контракт закреплён headless smoke `../ember-godot/tools/test_voxel_prefab_rebuild.gd`, включая проверку UID. Карта не переимпортируется и открытая сцена намеренно не reload'ится, чтобы не потерять unsaved ручные правки. Для material UX-разрыва добавлен узкий URL-контракт `?emberEditor=voxel&modelId=<safe-id>&workspace=material&tool=<emit|transparency>`: Godot-кнопки **Эмиссия в JOI · Материал** и **Прозрачность в JOI · Материал** открывают выбранную модель в существующем JOI sculptor, а не создают второй редактор. JOI остаётся единственным writer через штатный `writeVoxelRegistry`; query не является schema/состоянием контента и не даёт Godot права писать metadata напрямую. Godot mesher читает `model.transparency`, использует ту же формулу opacity с минимумом 0.08 и разделяет generated mesh на `opaque` и `transparent` surfaces; отдельный alpha toon shader не переводит непрозрачную геометрию в transparent pipeline. Surface name/material/vertex alpha сохраняются при in-place rebuild и проверяются smoke-тестом.

Godot Wave 3 authoring разделён явно: props, их transforms и вложенный `Interact` после импорта принадлежат `.tscn`; terrain/regions пока остаются односторонним импортом из JOI и вручную в Godot не редактируются. Dock-команда **Дублировать безопасно · +X** создаёт scene-owned PackedScene instance с уникальным `placement_id`, переносит только scene-owned дочерние узлы и участвует в editor Undo/Redo. Общая логика — `ember_scene_authoring.gd`; headless `test_scene_edit_roundtrip.gd` сохраняет только временную `user://` сцену и доказывает, что move/rotate/duplicate двери вместе с `Interact` переживают reopen, не меняя исходный `.tscn` или JOI map JSON. Не использовать обычный duplicate как официальный workflow, пока он копирует старый `placement_id`.

Godot Wave 4 начат тем же вертикальным контрактом, без новых полей: `EmberInteract` двери и `EmberRegion` trigger передают существующие `targetMapId/targetRegionId` через process-local `ember_map_transition.gd`. `fan_town.gd` потребляет destination один раз и просит общий `EmberMapLoader.region_world`, поэтому вход идёт в именованный region, а не всегда в первый `player_start`. После возврата destination-region кратко блокируется, чтобы spawn внутри `cabin_enter` не отправлял игрока назад до выхода из зоны. Добавлен контейнер `../ember-godot/scenes/agent_sandbox_interior.tscn`; геометрия и regions по-прежнему импортируются из `content/ember/maps/agent_sandbox_interior.json`. Headless `test_map_transition.gd` закрепляет маршрут `agent_sandbox → agent_sandbox_interior:start → agent_sandbox:cabin_enter`. WASD в Godot теперь, как Three explore runtime, camera-relative: `EmberPlayer` получает ссылку на follow-camera при spawn и вызывает чистый `ember_camera_movement.gd`, без lookup/traverse в physics-loop; `test_camera_relative_movement.gd` проверяет yaw 0°/90°, диагональную нормализацию и отсутствие pitch в движении.

Talk и shop перенесены ограниченными срезами без копии контента: `ember_interaction_content.gd` разрешает `scriptId` в прежнем порядке `scripts/` → `scenes/`, `ember_dialogue_session.gd` проходит существующие dialogue/choice/splash/end шаги, а единственный `EmberInteractionUi` показывает текст/ветки и после `shop_intro` читает `shops/catalog.json` + `items/catalog.json`. Следующий gameplay-state срез добавил pure `ember_economy.gd` с тем же JOI contract (`coin`, старт 20, buy/sell price, finite stock, stackMax, unsellable) и process-wide `ember_explore_state.gd`; UI не владеет inventory/save, только маршрутизирует A/D купить/продать, W/S выбор, F операцию, Esc закрытие. Успешная сделка сохраняет Ember save v1 (`inventory`, `equipment`, `openedChests`, `shopStock`, `flags`, map/tile/world position) в Godot backend `user://ember-save-v1/ember_p1/<slot>.json`; нулевой sold-out stock сохраняется явно. Запуск проекта через main scene теперь продолжает сохранённую карту и точную Godot-позицию `Vector3(x,elev,y)`; F6 не перенаправляется, потому что явно выбранная сцена важнее save. Если позиция находится внутри trigger/teleport, общий `EmberMapLoader` определяет это через уже импортированную геометрию `EmberRegion` и включает тот же arrival guard, не создавая второй occupancy-контракт. Chest-интеракт также использует `EmberRegion`: authored `lootIds` проходят через `EmberEconomy.grant_items`, ключ `${mapId}:${regionId}` выдаёт лут один раз (кроме `repeatable`), opened state и typed flags (`bool|string|number`) переживают restart. `test_talk_shop.gd` проверяет dialogue/choice/intro/live buy, `test_shop_persistence.gd` — buy/sell failures, finite restock, sold-out zero и disk round-trip, `test_progress_restore.gd` — map/exact spawn/chest/flags на реальной `agent_sandbox`. 2026-08-28 пользователь вручную подтвердил магазин, buy/sell и persistence; ручная приёмка restart/chest остаётся открыта. Полный action-script executor (`give_item/set_flag` и прочие actions) и inventory/equipment экран — следующие отдельные срезы; script-only regions до executor не показывают мёртвую F-подсказку.

Перед продолжением gameplay-state добавлен Godot authoring gate: `../ember-godot/docs/EMBER_OBJECT_INSPECTOR_DESIGN.md`. Решение — один `EditorInspectorPlugin`, а не второй dock/schema: выбранный `EmberVoxelProp` в одной панели показывает ownership `Asset | Scene | Derived`, effective Renderer/Collider/Emissive Light, scene-owned `Interact`, resolved scripts/shops/maps/regions и диагностику generated cache. I0–I2 реализованы; 2026-08-28 пользователь вручную подтвердил, что I2 UI работает в реальном Godot Inspector. `ember_object_inspector_model.gd` является pure read projection над существующими `EmberVoxelPrefab` / `EmberPack` / `EmberInteractionContent` / `EmberVoxelLight`; визуальная I1.5 использует компактные сворачиваемые карточки, русские `Ассет | Сцена | Расчёт` badges и отдельный door destination `map → region`. I2 вынес kind-dependent форму в `ember_interact_editor.gd`, а единственный mutation owner `ember_object_inspector_actions.gd` использует Editor Undo/Redo для add/edit/remove. Импорт и Inspector вызывают один `EmberSceneAuthoring.make_interact`, поэтому Area/Shape/radius/layers/ownership не расходятся. Dropdowns читают существующие scripts/scenes/shops/maps/regions; Ctrl+S пишет только локальный `.tscn`, не JOI JSON. `test_object_inspector_actions.gd` проверяет add/edit/remove/undo/redo/save/reopen и неизменность исходной сцены/pack, panel test — lazy form/catalog routing и 20 lifecycle. Migration workflow находится в bottom panel `Ember Migration` с layout-key `EmberMigrationWorkflow`. Authoring gate закрыт; instance Light/Collider modifiers всё ещё запрещены до отдельного вертикального ownership/schema решения.

Тот же map-transition runtime подключён к четырём существующим интерьерам `fan_town_inn/mage/smith/house`: для Ember JSON добавлены только Godot scene-контейнеры, каждый вход использует `start`, выход возвращает в `inn_enter/mage_enter/smith_enter/house_enter`. `test_map_transition.gd` реально загружает все четыре пары сцен и проверяет возврат. Первый runtime-импорт новых prefab больше не пытается немедленно открыть только что сохранённый `.res` до filesystem rescan: новый `ArrayMesh` делает `take_over_path`, существующий по-прежнему обновляется in-place. Результат F-действия удерживается HUD 1.4 секунды, поэтому missing target/talk/shop placeholder не исчезает за один physics-frame.

В editor выбранный светящийся `EmberVoxelProp` не должен получать рамку размером с карту от дочернего `OmniLight3D`: addon регистрирует `ember_voxel_prop_gizmo.gd`, строящий компактный box только по `Mesh.get_aabb()` в локальном transform. Omni range при этом не меняется и продолжает работать в viewport/play. Gizmo регистрируется/удаляется симметрично в lifecycle plugin.

Targeted prefab rebuild обязан обновлять существующий cached `ArrayMesh` **in-place** (`_copy_mesh_surfaces`), а не сохранять новый Resource с тем же path: открытые instances держат identity старого объекта и иначе не показывают новый цвет/форму до reload сцены. Headless smoke держит карту инстанцированной во время rebuild и проверяет, что live `Mesh.mesh` и Mesh нового prefab — тот же Resource. UID, map hash и placements при этом по-прежнему сохраняются.

Световой production gate закрыт 2026-08-26 на профиле 8: `fan_town` 1600×900, 200 FPS cap, frame p95 5.00 ms, CPU render 0.52 ms, GPU render 2.15 ms, shadow draw calls 396. Профили 12/16 добавлены только как stress; F3 показывает `active/candidates` отдельно от budget, потому что текущая карта содержит 11 подходящих lantern-кастеров и сама по себе не может доказать 16 активных теней. Production остаётся 8 до повторного прогона с NPC/частицами.

Forward+ debanding оставлен доступным как `Map.use_debanding`, но по умолчанию выключен: на текущих однотонных voxel-поверхностях его ordered-dither заметнее исходного banding. Диагональная «вафля» от локальных cube-теней лечится отдельно: `lamp_shadow_normal_bias` (default 1.8), `lamp_shadow_bias` (0.18), `lamp_shadow_blur` (0.25), positional filter Low; лунные параметры при этом не меняются.

Godot Wave 4 также закрывает inventory/equipment UI без второго state owner: чистый `ember_equipment.gd` повторяет JOI slot contract (`weapon/arena_weapon/head/body/accessory`), перенос предмета между bag/loadout и расчёт базовых 4/0 + authored bonuses. `EmberInventoryUi` хранит только mode/selection: I открыть, A/D equipment/bag, W/S выбор, F использовать/equip/unequip, I/Esc закрыть; movement блокируется, поверх talk/shop сумка не открывается. Успешные mutations проходят через `EmberExploreState` и тот же save v1. Следующий health-срез продолжает этот owner: стартовый `maxHp` читается из существующего `stages/<mapId>.json.playerHp`, входящий урон повторяет `max(1, raw-def)`, `hpRestore > 0` разрешает use и списывает один item даже при полном HP, лечение clamp'ится к `maxHp`; `hp/maxHp` уже являются optional полями save v1 и теперь сохраняются/восстанавливаются в Godot. HUD и inventory показывают current/max HP. Только `agent_sandbox.tscn` задаёт `player_debug_damage=30`, поэтому H даёт воспроизводимый damage probe без врагов/новой hazard schema; production-сцены имеют 0 и не получают debug-действие. `test_inventory_equipment.gd` проверяет real catalog names, JRPG/arena slots, stats, disk round-trip и live wiring, `test_health_consumables.gd` — stage HP, armor damage, heal/clamp/full-HP decrement, UI F-use, save restart и sandbox H probe. 2026-08-28 пользователь вручную подтвердил HUD, H damage, лечение и списание stack; health/consumables UX принят. Defeat/respawn продолжает того же owner: при нулевом HP `EmberPlayer` блокирует explore/UI и показывает R, а scene orchestration возвращает игрока в существующий `player_start`; `EmberExploreState.respawn()` восстанавливает `maxHp` и сохраняет позицию, не меняя inventory/equipment/flags/chests/shop stock и формат save v1. `test_defeat_respawn.gd` проверяет pure state и live `agent_sandbox`; 2026-08-28 пользователь вручную подтвердил H → поражение → R. Chest visual также гидратирует существующие `closedModelId/openModelId` через `EmberVoxelPrefab`; защищённую геометрию/клипы крышки не меняли.

Следующий ограниченный срез Wave 4 переносит существующие JOI action lists без новой schema: `ember_action_script.gd` только разрешает `scripts/` → `scenes/`, рекурсивно разворачивает `run_script` с лимитом глубины 8 и нормализует все семь canonical шагов `talk/give_item/set_flag/wait/open_shop/change_map/run_script`. `EmberInteractionUi` остаётся единственным sequencer: диалог приостанавливает очередь, `give_item` показывает отдельную золотую reward-карточку с фактическим приростом и итоговым количеством, `wait.sec > 0` запускает реальную синюю timed pause, закрытие action-list магазина продолжает оставшиеся шаги, а `change_map` завершает цепочку через существующий `EmberMapTransition` с authored target region. Typed flags и item grants проходят через существующий `EmberExploreState`, затем один раз сохраняется тот же save v1. Script-only `EmberRegion` снова входит в общий F-interact group, потому что теперь за подсказкой есть рабочий executor; отдельной trigger/toast/timer/shop/transition-системы не создано. `test_action_script.gd` проверяет реальный `sandbox_chain`, видимую награду, непроматываемую паузу, продолжение после магазина, map/region transition, прямую scene-ссылку, typed dialogue flags и live `agent_sandbox` wiring. В `agent_sandbox.tscn` центр невидимого `chain_demo` отмечен scene-owned экземпляром существующего `vox_vil_sign` и billboard-подписью `СЦЕНАРИЙ · F`; сам marker владеет `custom` Interact со ссылкой `sandbox_chain`, поэтому F не зависит от угадывания границ невидимого region. `EmberInteract.refresh_runtime_binding` включает в F-группу только реально исполнимые действия; после quest-state среза связанный `quest_marker` также исполним через свой trigger, а две демонстрационные метки без action не перехватывают подсказку. JSON региона `chain_demo` не менялся, full reimport по-прежнему может удалить его ручной scene-owned маркер. 2026-08-28 пользователь вручную подтвердил ветки диалога и выдачу монеты после завершения `sandbox_chain`; 2026-08-29 пользователь также подтвердил явную reward-карточку и реальную паузу. Health/consumables продолжены тем же state owner в предыдущем абзаце.

Quest-state в Godot продолжает уже существующий JOI modifier, а не заводит журнал заданий: `ember_quest_state.gd` дословно проецирует `questStatus` (`available|active|done`) и runtime override из `flags[scriptId]` (`true → done`, строковый статус сохраняется). `EmberInteract` импортирует/редактирует прежние `iconId/questStatus/scriptId/triggerId`, создаёт один `Label3D` billboard `!/◆/✓` и обновляет его по `EmberExploreState.progress_changed`; отдельного per-frame обхода нет. Исполнимость F остаётся прежней: у `quest_marker` связанный `triggerId` разрешается в `EmberRegion` после runtime hydration и запускает action региона, а `scriptId` при наличии trigger служит ключом статуса. В `agent_sandbox` первая табличка использует `scriptId=sandbox_notice_read`, поэтому существующий `sandbox_notice` после диалога переводит её из available в done; active/done таблички без action остаются визуальными и не перехватывают F. Inspector показывает/редактирует статус, иконку и свободный id флага через тот же scene-owned Undo/Redo owner. `test_quest_state.gd` закрепляет pure projection, live три статуса, trigger resolution и реактивное обновление; `test_action_script.gd` теперь ожидает рабочий F у bound quest marker. Ручная приёмка `! → ✓` и persistence после F5 остаётся в `../ember-godot/MIGRATION_TEST_PLAN.md`.

Godot-миграция переносит пользовательский результат, художественное намерение, данные и бюджеты, но не реализацию Three.js. Перед renderer/editor/physics-срезом сначала исследовать штатные Godot nodes/resources/import hooks/visibility/shader-механизмы и поддерживаемые плагины; если готового решения недостаточно, выбрать одного Godot-native owner и построить вокруг него одну систему. Старые обходы и специальные ветки не являются эталоном для порта.

С 2026-08-28 действует editor-first контракт: новая gameplay-механика принимается только вместе с Godot authoring UI, Undo/Redo, save/reopen, диагностикой и targeted runtime test. Inspector I2.5 добавляет object-bound `Триггер с цепочкой`: `ember_action_chain_editor.gd` редактирует все семь canonical шагов `talk/give_item/set_flag/wait/open_shop/change_map/run_script`, а существующий `ember_object_inspector_actions.gd` одной Undo operation создаёт scene-owned `Interact + Shape`, пишет canonical `content/ember/scripts/<id>.json` и назначает тот же `script_id`. Shop/map/region используют существующие каталоги; закрытие магазина продолжает очередь, `change_map` сохраняет выбранный target region и валидируется как финальный шаг. Несохранённая форма имеет явную отмену; удаление сохранённой цепочки очищает только её JSON + binding и сохраняет Interact/shop/Shape, причём Ctrl+Z восстанавливает обе части. `set_flag` теперь объясняет имя как устойчивый save-key, показывает bool как `Да/Нет` вместо raw `true`, а text/number — отдельными guided inputs; canonical typed JSON и `EmberExploreState` не менялись. I2.6 продолжает тот же owner для пространственных событий без prop: bottom workflow создаёт scene-owned `root/AuthoredTriggers/trigger_N` с `EmberInteract + BoxShape3D`, Inspector редактирует X/Высота/Z и прежнюю chain-форму, а cyan selection gizmo показывает границу во viewport. Контейнер намеренно является sibling generated `Map`, поэтому full reimport его не удаляет; save/reopen и Undo/Redo проверяет `test_standalone_trigger_authoring.gd`. Runtime F-дистанция теперь считается до поверхности объёма, а не центра. I2.7 добавляет к тому же Interact scene-owned launch rules: typed bool condition выбирает primary/fallback через pure `EmberInteractRules`, отсутствие fallback снимает мёртвую F-подсказку, а one-shot пишет явный completion-флаг только после успешного primary; fallback и abort его не расходуют. I2.8 добавляет `activation_mode=press|enter`: enter снимает F-group, включает Area3D только на player layer и зовёт общий `EmberPlayer.activate_interact`, поэтому route/sequencer/one-shot не дублируются и per-frame overlap poll отсутствует. `EmberExploreState`, `EmberInteractionUi` и save v1 остаются единственными state/sequencer owners; `test_interact_launch_rules.gd` плюс standalone round-trip закрепляют runtime и сериализацию. Это осознанное расширение writer-контракта, а не второй Godot schema. Сторонние Godot addons/assets разрешены после проверки версии, лицензии, support status, ownership, smoke и удаления; реестр — `../../ember-godot/docs/EMBER_ADDONS.md`.

I2.9 продолжает authoring chain из шага `talk`: безопасный карточный editor пишет прежний `content/ember/scenes/<id>.json`, поддерживает линейные реплики и простой сходящийся выбор с одной ответной репликой и одним typed флагом на вариант. Сохранение проходит отдельной Undo/Redo operation, новый ID автоматически выбирается в talk-шаге, а runtime остаётся прежним `EmberDialogueSession`. Stage actors/background/splash/cycles/disconnected и несходящиеся ветки явно read-only и не могут быть перезаписаны; полноценный dialogue graph остаётся отдельным будущим срезом. `test_dialogue_authoring.gd` закрепляет projection реальных fixtures, compiler/runtime, Undo/Redo и bridge в action-chain UI.

I2.10 выносит крупные сценарии из узкой колонки Inspector в main-screen вкладку `Ember Graph`. `ember_graph_workspace.gd` использует native Godot `GraphEdit/GraphNode` с grid/zoom/minimap/arrange, показывает action lists как последовательность и любой dialogue JSON как полный граф `next/options[].next`. Клик по ноде фильтрует справа одну соответствующую карточку; reply-ноды простого choice фокусируют parent card, а talk/run_script переходят к связанному ресурсу в том же workspace. Правая колонка переиспользует существующие safe card editors, а generic action/dialogue writes идут через тот же `EmberObjectInspectorActions` и Undo/Redo. Сложный VN-граф виден целиком, но связи read-only; direct node/connect mutation намеренно отложен до отдельной validation/layout волны. `test_graph_workspace.gd` закрепляет layout rectangles, selection/navigation, graph connections, complex read-only и standalone JSON Undo/Redo.

I2.11 включает прямую graph-mutation только для однозначного action-list contract: toolbar добавляет canonical step, Delete удаляет выбранные (кроме последней), а connection request переставляет target сразу после source и заново строит один связный маршрут. Перед структурной операцией черновик считывает текущие поля card editor; локальные ↶/↷ не пишут диск, а `Сохранить цепочку` остаётся единственным canonical JSON write через Editor Undo/Redo. Структурные кнопки правой action-формы скрыты только в graph mode, чтобы не было двух owners порядка. Dialogue wires остаются read-only до отдельной реализации именованных choice outputs и graph validation. `test_graph_workspace.gd` закрепляет add/delete/reorder/local history.

I2.12 добавляет именованные dialogue-ветки без новой schema: `ember_dialogue_graph_model.gd` работает прямо с прежними `steps[].next/options[].next`, choice рисует один подписанный output на каждый ответ, а connection/disconnection меняет только выбранный target в локальном черновике. ↶/↷ не пишут диск; dangling target и недостижимые от `startStepId` ноды блокируют `Сохранить граф`. Canonical scene JSON сохраняется через прежний `EmberObjectInspectorActions` и Editor Undo/Redo. Структурная копия lossless для `actors/bgArtId/portraitSide` и других VN extras; свойства сложных VN-нод пока остаются read-only. `test_graph_workspace.gd` закрепляет named ports, invalid intermediate draft, history, complex preservation и graph round-trip.

I2.13 фиксирует ownership раскладки Ember Graph: zoom/scroll/node offsets кэшируются отдельно для каждого `kind:resourceId`, поэтому rebuild, wire mutation, ↶/↷ и save/reopen больше не сбрасывают canvas. Dialogue offsets уже принадлежат существующему `editorLayout` и сохраняются вместе с canonical graph JSON; action-list не получает layout-поле и хранит ручную раскладку только в editor session. `test_graph_workspace.gd` проверяет camera/node persistence через rebuild и сохранённые `editorLayout.x/y`.

I2.14 добавляет lifecycle dialogue-нод поверх той же canonical schema: toolbar создаёт runtime-supported `dialogue/choice/set_flag/end` с уникальным ID и координатой в центре viewport; Delete удаляет step+layout и явно очищает входящие `next/options[].next`; `Сделать стартом` меняет прежний `startStepId`. Любое промежуточное dangling/unreachable состояние остаётся локальным draft и блокирует save, ↶/↷ возвращают структуру и layout. `test_graph_workspace.gd` закрепляет add/connect/set-start/delete/Undo.

I2.15 переносит common property authoring внутрь dialogue `GraphNode`: там редактируются реплики/имена/emotion, вопросы и подписи ответов, splash, typed flag и числовая награда. Правая карточка теперь только read-only обзор, чтобы canonical draft имел один UI-owner; одна focus-сессия даёт одну локальную Undo/Redo-запись. Для ComfyUI-подобной организации Shift-selection создаёт именованный native `GraphFrame`; его membership хранится в опциональном editor-only `editorGroups`, переживает save/reopen и не меняет runtime. Удаление step чистит membership, validation запрещает неизвестные/повторные members. Это визуальная группа, не reusable runtime-subgraph: вызовы вложенных графов, scope и порты будут отдельным вертикальным контрактом.

I2.16 завершает базовый frame workflow: свободную dialogue-ноду можно бросить на раскрытый frame через native request, pure model переносит membership между группами; titlebar `Свернуть/Развернуть` хранит editor-only bool `collapsed` и показывает компактное имя+счётчик без изменения runtime edges. Выбранные members извлекаются отдельно, выбор frame удаляет только группу. Collapse/drop/detach входят в ту же local Undo/Redo history; перенос свернутого frame сохраняет позиции attached nodes через прежний `editorLayout`.

Hotfix v1.22: hidden member GraphNode нельзя оставлять подключёнными — Godot GraphEdit продолжает рассчитывать провода и обращается к уже пустому port cache. Collapsed render теперь вообще не создаёт member-ноды/их connection lines; canonical draft не меняется, expand восстанавливает их. Compact frame двигает layout участников явным delta, поэтому прежнее совместное перемещение сохраняется без engine errors.

I2.17 возвращает визуальную непрерывность цепи без hidden port-cache: collapsed group рендерится editor-only proxy GraphNode с агрегированными boundary ports. Outside→inside edge приходит слева, inside→outside выходит справа, internal edge скрыт, collapsed-group→collapsed-group соединяет proxy. Proxy не является dialogue step, а delete/select/rename маршрутизируются по `group_id`; canonical edges остаются неизменными и полностью возвращаются при expand.

I2.18 добавляет reversible duplication через native `duplicate_nodes_request`/Ctrl+D и видимую кнопку. Action selection копируется одним последовательным блоком. Dialogue duplication реализована pure model-функцией: unique copy IDs, +60/+60 layout, lossless fields и remap внутренних `next/options[].next`; внешний continuation сохраняется, внешний incoming edge намеренно не копируется. Новые ноды selected, операция одна в local history, frame/proxy без step IDs не дублируется.

Editor stop-line зафиксирован: (1) fast authoring — searchable palette/create-from-wire и clipboard; (2) node-level diagnostics + unsaved guard; (3) минимальные VN properties, которые потребует первый сюжетный эпизод. После этого общая editor-полировка останавливается и фокус возвращается к quests/combat. Reusable runtime-subgraph, универсальный visual scripting и широкие modifiers в этот gate не входят.

I2.19 закрывает первую половину fast authoring: ПКМ по пустому `Ember Graph` открывает searchable palette с фильтром по русскому label и canonical type; Enter/двойной клик создаёт ноду в выбранной graph-coordinate. `connection_to_empty` и `connection_from_empty` используют ту же палитру, исключают несовместимые типы и после выбора автоматически подключают новую dialogue-ноду. В action-list тот же путь вставляет canonical step после source или перед target. Все изменения остаются local draft до прежнего Save; toolbar и palette используют один create helper.

I2.20 закрывает fast-authoring стадию stop-line. Native Ctrl+C/X/V и компактное меню `Буфер` используют один session clipboard для ресурсов одного типа. Ordered action block вставляется после selection; dialogue branch хранит lossless поля и относительный layout, а paste у курсора использует тот же pure clone/remap path, что Ctrl+D. Новые dialogue IDs collision-free, внутренние edges переназначаются, внешняя цель сохраняется только если она существует в destination graph; иначе edge очищается и блокирует Save до исправления. Copy не меняет history, Cut/Paste дают по одной local ↶/↷ записи, JSON по-прежнему пишет только общий Save. Следующий stop-line slice — node-level diagnostics и unsaved-draft guard.

Hotfix v1.27 добавляет отсутствовавшие keyboard routes: Ctrl+Z вызывает local draft undo, Ctrl+Shift+Z/Ctrl+Y — redo, но focused text field сохраняет собственное редактирование. Однострочный HBox, который расширял main screen и уносил validation вправо, заменён HFlow toolbar; status вынесен отдельной autowrap-строкой над canvas. Появившаяся после paste красная ошибка сама по себе ожидаема: копия ветки не получает внешний incoming edge автоматически и считается недостижимой, пока автор её не подключит.

I2.21/v1.28 закрывает diagnostics-стадию stop-line. Existing ActionStore/DialogueGraphModel validation теперь дополнительно отдаёт structured `message/stepId/port`, а прежний string API проецируется из него; второй validation owner не создан. Проблемная нода показывает badge и сообщение, broken choice знает exact output port, collapsed proxy агрегирует member errors, `К первой ошибке` выбирает и центрирует node/proxy. Dirty draft сравнивается с initial normalized snapshot; kind/resource/reload/link navigation восстанавливает selector и ждёт modal `Отбросить и перейти | Остаться`. Смена main-screen tab draft не уничтожает. Следующий и последний editor stop-line slice — минимальные VN properties первого сюжетного эпизода.

I2.22/v1.29 завершает editor stop-line. Ember Graph теперь авторит уже существующие canonical VN-поля первого эпизода: scene `defaultBgArtId`, node `bgArtId/portraitSide`, splash и сворачиваемый основной `actors[0]` (`id/speaker/portraitKey/x/y/scale/flipX`). Actor mutation меняет только выбранное поле и lossless сохраняет `lockY/floorY/z/rotate`, будущие неизвестные ключи и остальных actors. `EmberDialogueSession.current_visual_state()` проецирует те же данные runtime UI и применяет default background fallback; нового scene-format owner нет. Choice conditions не введены: существующий `options[].setFlags` является эффектом выбора, а predicate-schema/runtime и реального потребителя пока нет. Это осознанный scope stop-line: дальнейшая общая полировка Graph откладывается, фокус возвращается к quests/combat.

По явному запросу пользователя I2.23/v1.30 добавляет последнее ограниченное дополнение после stop-line: `▶ Превью сцены` для всех Ember dialogue JSON. Отдельное окно читает unsaved Graph draft и live обновляет текст, background, portrait side и actors; node selection фокусирует кадр, Next/choice/Back/Restart следуют canonical edges без gameplay mutation. Pure `ember_vn_scene_state.gd` теперь является общим editor/runtime owner default background, fallback actor и incoming-choice stage inheritance, повторяя прежний JOI `sceneStage.ts`; `ember_vn_assets.gd` только разрешает прежние arts/portrait registries и не создаёт Godot-копию каталога. `talk/shop_intro` остаются text-only. Preview не заменяет F6/viewport для 3D `.tscn`. Текущий `hu_tao_clear_demo.defaultBgArtId = 49bd31e4-…` присутствует в registry, но указанный `arts/files/49bd31e4-….jpg` отсутствует на диске; preview обязан показать warning, а не тихий placeholder.

I2.24/v1.31 продолжает этот явный UX-запрос без смены schema: `defaultBgArtId/bgArtId/artId` теперь выбираются из non-portrait arts entries с caption/ID/48px thumbnail и missing-file status; speaker берётся из существующих portrait registry directories, emotion — из `expressions` выбранного speaker с label/key/thumbnail. Dialogue identity синхронизирует прежние step fields и `actors[0]`, сохраняя координаты/advanced keys; choice stage меняет только actor. Missing legacy ID остаётся warning-option до явной замены. Resolver по-прежнему read-only JOI pack owner, отдельного Godot registry нет.

I2.25/v1.32 устраняет native crash Godot 4.7.2 (`0xc0000005`) при открытии dialogue/live preview. Root cause — управляющие байты и битый UTF-8 в demo `hu_tao_clear_placeholder.svg`, валившие SVG loader до GDScript error. Placeholder исправлен; picker и live preview разделяют один decoded-image cache, preview использует display-sized textures. Динамические thumbnails не передаются в `OptionButton.add_icon_item`/PopupMenu: список остаётся caption/ID/status picker, выбранный asset визуализируется отдельным 40px `TextureRect`. Canonical IDs и draft history не менялись.

По явному запросу пользователя I2.26/v1.33 меняет ownership только новых VN-фонов: системная кнопка `+ Фон` копирует PNG/JPG/WebP/SVG в `ember-godot/res://assets/vn_backgrounds/` и создаёт `EmberVnBackground` в `res://content/vn_backgrounds/<id>.tres`. Длинные captions больше не определяют ширину Inspector/Graph sidebar; полный caption/ID/path остаётся в tooltip, а кнопка `Папка` раскрывает canonical asset directory. Shared `EmberVnAssets` объединяет native `.tres` и прежний JOI `arts/registry.json`, native ID имеет приоритет, legacy registry доступен только для чтения и importer его не меняет. Это зафиксированное исключение из прежнего JOI pack ownership по последней прямой команде пользователя. Dialogue graphs и portraits в этом срезе не мигрируют: их смена owner требует отдельного полного вертикального контракта.

I2.27/v1.34 убирает необходимость назначать один фон каждой ноде. `defaultBgArtId` — единственный scene default, а node `bgArtId` — только optional override. Picker пустого override явно показывает `↳ Фон сцены` и effective thumbnail. Кнопка `Сделать общим для всей сцены` вызывает pure `EmberDialogueGraphModel.inherit_scene_background`, удаляет только `bgArtId` у dialogue/choice и создаёт одну local Undo/Redo запись; splash/actors/edges/unknown keys не меняются. Общий `EmberVnSceneState` теперь трактует и отсутствующий ключ, и legacy empty string как наследование, закрывая прежнее расхождение editor/runtime. Canonical dialogue JSON не получает нового поля или второго формата.

I2.28/v1.35 фиксирует semantic layering VN preview: background `z=-100`, bounded actor-layer `z=10` с clamped authored relative z, dialogue panel `z=1000`; портрет больше не может перекрыть текст и choices. Одновременно продолжена запрошенная asset migration: новый `EmberVnPortrait` хранит Godot-owned `speaker_id/portrait_key/display_name/image_path`, `+ Арт` импортирует изображение в `res://assets/vn_portraits/<speaker>/` и `.tres` в `res://content/vn_portraits/`. Shared `EmberVnAssets` объединяет эти Resources с legacy `portraits/<speaker>/registry.json`, native identity имеет приоритет, JSON не переписывается. Dialogue по-прежнему сериализует только стабильные `speaker/portraitKey` строки, поэтому runtime/schema не раздваиваются.

I2.29/v1.36 продолжает уход от исходного JSON на уровне самих документов диалога. `EmberDialogueResource` lossless хранит прежний graph Dictionary в `res://content/dialogues/<id>.tres`, а общий `EmberDialogueCatalog` является native-first read owner для Ember Graph, карточного editor и runtime. Legacy `content/ember/scenes/<id>.json` остаётся fallback до явной кнопки `Перенести в .tres`; автоматической массовой конверсии нет. После миграции save пишет только Resource и не меняет legacy backup. Одна Editor Undo восстанавливает точный снимок обоих owners (удаляет `.tres`, возвращая legacy-only), Redo повторяет перенос; новые диалоги сразу native. `test_vn_dialogue_resource.gd` закрепляет owner switch, save/reopen projection, runtime parity, неизменность JSON и Undo/Redo.

I2.30/v1.37 переносит тем же способом action-chain documents. `EmberActionResource` хранит прежний lossless `id/nameRu/steps` Dictionary в `res://content/action_scripts/<id>.tres`; `EmberActionCatalog` является native-first owner для Ember Graph, Inspector, reference pickers, validation и `EmberActionScript` executor. Legacy `content/ember/scripts/<id>.json` остаётся fallback/backup до явной кнопки миграции, после неё save пишет только Resource. Snapshot-aware Undo/Redo теперь охватывает создание, сохранение, удаление, Interact binding и owner migration; снимок хранит исходный legacy text, поэтому Undo не создаёт formatter diff в JSON. Новые цепочки сразу native, массовой конверсии нет. `test_action_resource.gd` и `test_action_chain_authoring.gd` закрепляют executor parity и lifecycle.

I2.31/v1.38 переносит authoring магазинов без смены economy/save schema. `EmberShopResource` хранит прежний shop dictionary в `res://content/shops/<id>.tres`; общий `EmberShopCatalog` native-first используется picker, Inspector, runtime overlay и `EmberEconomy`. В `open_shop` встроен редактор названия, ассортимента, buy/sell prices и finite/infinite stock. Записи `content/ember/shops/catalog.json` read-only до явной per-shop миграции и остаются неизменным backup; save/migrate участвуют в Editor Undo/Redo, новые магазины сразу native. `test_shop_resource.gd` закрепляет owner, UI, runtime/economy parity и legacy-byte safety; `test_shop_persistence.gd` по-прежнему отвечает за buy/sell и save v1 stock.

I2.32/v1.39 продолжает authoring из строки магазина до предмета. `EmberItemResource` lossless хранит прежний item Dictionary в `res://content/items/<id>.tres`; `EmberItemCatalog` native-first используется shop, inventory, equipment, consumable и economy. Вложенный editor покрывает существующие name/kind/slot/rarity/stack/useIn/iconId/atk/def/hpRestore/sell/tags/notes поля. Legacy `content/ember/items/catalog.json` read-only до явной per-item миграции и остаётся fallback плюс owner pixel-icon library; save/migrate проходят через Editor Undo/Redo, новые предметы сразу native. Save v1 по-прежнему хранит ID/count/equipment без schema change. `test_item_resource.gd` закрепляет UI, runtime parity и legacy-byte safety.

I2.33–I2.35/v1.40–v1.42 вводят один общий `EmberVisualLibraryPicker`, не новый content owner. Item/shop используют прежнюю pixel icon library; VN backgrounds/speakers/expressions — существующий native-first `EmberVnAssets`; voxel grid — все canonical `content/ember/voxels/models/*.json`. Готовые voxel `.tscn` получают асинхронный thumbnail через штатный `EditorResourcePreview`, отсутствующие явно помечаются. Выбор создаёт ровно один scene-owned `EmberVoxelProp` в существующем `Map/Props` с новым `placement_id` и Editor Undo/Redo; prefab строится только для выбранной отсутствующей/устаревшей модели. JOI остаётся единственным voxel writer, thumbnails не сериализуются, массового prefab build и второго registry нет. `test_visual_library.gd` и `test_voxel_visual_library.gd` закрепляют stable IDs, picker и save/reopen.

I2.36/v1.43 чинит ownership размера нижней панели: длинная migration-форма находится только внутри вертикального `ScrollContainer`, операции сгруппированы в сворачиваемые секции, а постоянная шапка содержит явную кнопку `Закрыть`. Root больше не передаёт высоту всего контента как minimum size, поэтому Godot снова показывает соседние bottom tabs и позволяет менять высоту штатным splitter. Однострочный status не раздувает панель; `test_migration_workflow_layout.gd` закрепляет структуру без изменения map/content schema.

I2.37/v1.44 закрывает подтверждённый ручной gap: stock `EditorResourcePreview` возвращал пустые textures для generated voxel PackedScenes. Один editor-only `EmberVoxelPreviewRenderer` на main thread последовательно использует transient 128×128 `SubViewport`, отключает authored lights, кадрирует существующий `Mesh` и кэширует texture в памяти по prefab path + mtime. Это не gameplay renderer/importer: prefab остаётся единственным Godot cache, JOI — writer, PNG/registry/metadata не создаются. Worker-thread `EditorResourcePreviewGenerator` намеренно не используется. `test_voxel_preview_renderer.gd` без headless подтверждает Forward+/Vulkan кадр и пиксели модели.

I2.38/v1.45 расширяет тот же preview на canonical модели без generated `.tscn`. `EmberVoxelPrefab.make_preview_instance()` вызывает существующие `_build_visual_mesh`, material и `_make_tree` функции, но не устанавливает mesh resource и не сохраняет prefab; source mtime образует memory-cache key. Поэтому `◇` остаётся честным статусом отсутствующего prefab, но валидная `.vox/.json` модель получает tile preview. Массовой сборки и второго mesher нет; отсутствующий prefab создаётся только прежним явным add flow. Windows test проверяет готовый `vox_fan_anvil` и source-only `vox_crate_1`, а также отсутствие записи `vox_crate_1.tscn`.

I2.39/v1.46 расширяет общий visual picker на назначения карт и special locations. `EmberTileMesher.surface_grid()` вынесен как единая pure top-surface проекция для runtime terrain и editor preview; `EmberMapVisuals` поверх неё рисует 96×96 CPU-схему с canonical tileset colors, voxel-prop markers и золотой рамкой region. Door form и action `change_map` получили `▦` библиотеки, но по-прежнему сохраняют только `targetMapId/targetRegionId`. Preview не инстанцирует целевые `.tscn`, не пишет изображения/metadata и не создаёт второй map registry/schema. `test_map_visual_library.gd` проверяет runtime/preview parity, обе editor integrations и неизменность source JSON; `test_map_transition.gd` остаётся runtime gate.

I3.0/v1.47 начинает quest product slice без второго progress owner. Godot-owned `EmberQuestResource` хранит `id/titleRu/summaryRu/showWhenAvailable/statusFlagId/objectives[]`: quest ID является только identity Resource, marker привязан к отдельному typed status flag, objective указывает свой `flagId`. `EmberQuestCatalog.projection()` читает только `EmberExploreState.flags`; dialogue/action продолжают менять прогресс общим `set_flag`. Quest-marker Inspector получил inline editor, а одна Undo/Redo action записывает `.tres` и marker binding. Runtime журнал на Q является read-only projection available/active/done и блокирует explore input как существующие overlays. `test_quest_journal_authoring.gd` закрепляет store/editor/UI/Undo и source-scene safety; save v1/schema и JOI JSON не менялись.

I3.1/v1.48 исправляет неоднозначность demo и authoring UX. `sandbox_notice_quest` (Resource), `sandbox_notice_status` (общий статус) и `sandbox_notice_read` (цель) теперь разные ID; старый objective flag больше не является identity/status задания. Editor подписывает роли всех полей и объясняет optional. Journal выводит exact quest-related flags текущего слота и в debug вызывает `EmberExploreState.clear_flags()` только для status/objective keys выбранной карточки. Catalog держит invalidated-on-write memory index status flag → quest Resource, поэтому per-frame marker refresh не сканирует каталог. Scoped reset, projection и binding покрыты targeted test; второй progress/save owner не появился.

I3.2/v1.49 добавляет editor-only quest reference projection без нового action/runtime. `EmberQuestStore.flag_reference_entries()` выдаёт status/required/optional objective keys с русскими labels/tooltips в общий `EmberVisualLibraryPopup`. Тот же `▦` доступен у action-chain `set_flag`, simple dialogue choice и inline `set_flag` node Ember Graph; выбор меняет только прежнее строковое поле, Graph фиксирует его одним local draft Undo. Ручной произвольный flag остаётся доступен. Store/Inspector/dialogue/Graph targeted tests закрепляют одинаковый canonical key; save v1, action/dialogue schemas и executor не менялись.

I3.3/v1.50 добавляет в существующий `Ember Graph` отдельный document kind `Задания`. Ресурсы выбираются как `titleRu · id`; root node редактирует прежний `EmberQuestResource`, objective nodes — его canonical objectives, а вычисляемые root→objective wires означают containment, не runtime sequence. `+ Задание`, `+ Цель`, Delete и inline fields используют local draft Undo/Redo и navigation guard; новый несохранённый Resource нельзя молча потерять. Единственный write проходит через общий `EmberObjectInspectorActions.save_quest_document()` и Godot Editor Undo/Redo. Второй quest graph/runtime/schema не появился: ветвление остаётся в dialogue/action documents, прогресс — в typed flags.

I3.4/v1.51 реализует quest event binding без нового quest executor. `EmberQuestStore` строит editor-only presets `start/objective/done`, а action-chain Inspector и action/dialogue режимы `Ember Graph` разворачивают их в прежний `set_flag`. Объект использует свой `EmberInteract`, место — scene-owned `Area3D` из `AuthoredTriggers`; для обоих остаются прежняя action Resource, F/enter activation, one-shot и Editor Undo/Redo. `EmberInteractRules` теперь сравнивает typed ожидаемое значение, поэтому gate `statusFlagId == "active"` сохраняется через сцену без дублирующего boolean-флага; старый `condition_expected` остаётся fallback для прежних сцен. Quest definition не получает NodePath/object references, save v1 и JOI JSON не меняются. Quest Graph backlinks остаются следующим editor-only UX-срезом. Questify рассмотрен только как UX reference и не принят из-за собственного singleton/state/serialization; Dialogue Manager остаётся возможной отдельной replace-migration, но не параллельным addon.

I3.5/v1.52 добавляет последовательность objective как dependency DAG в прежний Quest Resource: `requiresObjectiveIds[]` хранится на зависимой цели. Quest Graph различает вычисляемое золотое containment и редактируемые синие objective wires; multiple incoming означает all, cycle отвергается, deletion/rename чистят ссылки, local Undo/Redo и layout сохраняются. Catalog projection вычисляет current/locked/missing prerequisites, Journal показывает `◆/◇/✓`. Новый action type не появился: action/dialogue продолжают писать `set_flag`, но `EmberExploreState.apply_authored_flag()` вызывает pure quest gate и блокирует completion-флаг до prerequisites, показывая runtime notice. Прямой `set_flag` сохранён для restore/debug compatibility. Старые quests без dependencies, JOI JSON и save v1 не меняются; any-of/exclusive branching отложен до конкретного сюжетного требования.

Godot interior/cutaway не имитируется скрытием целого prop. Первый opt-in spike в `agent_sandbox` выбрал Godot-native секцию крыши: общий importer читает существующие `ground_zN + interiorVolumes`, выделяет отдельный mesh секции, а один `EmberCutawayVolume` владеет `Area3D` и native `GeometryInstance3D.transparency`. После ручной проверки принято сохранять `cast_shadow` включённым при fade: меняется только camera visibility, а структурная тень и световой рисунок не прыгают. F7 в debug overlay переключает тот же owner для визуальной проверки без входа в мгновенный map-trigger; F3 показывает active/sections. `test_native_cutaway.gd` закрепляет реальную 4×4 крышу cabin, отсутствие per-frame process, fade/shadow continuity и opt-in только песочницы. Это ещё не production-контракт: `fan_town` выключен, стены и scene-owned authoring ролей не решены. После ручной приёмки крыши/F3 нужно отдельно выбрать authoring workflow. Запрещены перенос Three cell tags по умолчанию, скрытие целого дома, per-frame traverse/remesh, локальная ветка на конкретный дом и второй map schema.

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
   6. **P4 Aseprite** — **сделано**. Пиксели рисуются в Aseprite; Ember sprite editor остаётся для gameplay-полей и быстрой правки. Не класть `.aseprite` внутрь `EmberPixelSprite` schema. Не раздувать `SpriteEditorPanel` вторым pixel-engine.
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
5. `loadEmberPack` уже грузит `maps/`, `stages/`, `tilesets/`, `spawns/` и `voxels/models/*.json` как директории. Один воксельный объект = json+`.vox`; save пишет только dirty id. Песочница агента: карта/стадия `agent_sandbox` (механики). Explore-хаб `hu_tao_village`, стадия `village_stroll`, интерьер `hu_tao_house_interior`. JRPG-городок `fan_town`, стадия `fan_town` (интерьеры через двери, без отдельных стадий). Default stage остаётся ареной `hu_tao_p1`.
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

1. Прочитать корневой `AGENTS.md`, этот файл (сначала §2.1 песочница) и, для продуктового решения, `docs/EMBER_JRPG_DESIGN.md`. `docs/EMBER_RESTRUCTURE_PLAN.md` читать только для ограниченной поддержки JOI/Three editor или legacy-runtime. Если задача — **воксельные модельки для Grok / Voxel bro**, читать также `docs/EMBER_VOXEL_BOT.md`; это не даёт боту права менять движок. Бэклог: GitHub Issues milestone [Ember](https://github.com/YaR00i/joi-conductor/milestone/1), трекер [#25](https://github.com/YaR00i/joi-conductor/issues/25), лейблы `now` / `later`. Не заводить параллельную доску в Notion/Jira, пока этот трекер живой.
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
- Не возвращать loadEmberPack к схеме «один битый core-JSON роняет весь пак»: weapons/enemies/arts/pools/portraits проходят шейп-гарды через `loadJsonShapeReported` и деградируют до пустого каталога с error-issue (тест `loadPack.shapeFallback.test.ts`); фатальным остаётся только `pack.json`.

## 15. Главный принцип

Новые функции Ember укрепляют **Godot-каркас** (сцена, Inspect, interact, save v1, один owner на систему). JOI/Three не наращивать «ещё одним специальным путём»: Three на паузе. Контент-пак и voxel-модели по-прежнему живут в этом репо и импортируются в Godot.

World-marker presentation живёт только в sibling `ember-godot`: `EmberQuestState` разрешает status/icon, `EmberInteract` создаёт один `QuestMarker` pivot со штатным `Sprite3D`, а оригинальные SVG лежат в `assets/world_markers`. Не копировать маркеры обратно в Three и не скачивать графику из референсных игр. Принятый размер/LOD и дальнейшая occlusion/current-objective policy записаны в `ember-godot/docs/EMBER_WORLD_MARKERS.md`.

С v1.53 `EmberInteract.quest_id` владеет ссылкой world marker → `EmberQuestResource`, а `script_id` снова только action chain. Legacy marker без `quest_id`, где `script_id=statusFlagId`, остаётся читаемым и мигрируется Inspector-save. Shortcut `Цель / событие` передаёт временный `_editorQuestId` только в Undo action; ключ обязательно удаляется до записи Action Resource. Не возвращать ручной status-flag как основной picker и не смешивать quest binding с исполняемой цепочкой.

С v1.54 marker presentation/actionability выводятся из конкретного quest event в action chain: status active = start, objective flag = цель, status done = сдача. Не добавлять отдельный marker-role enum или второй save-key. Future/locked/completed события скрыты и не принимают F; последняя оставшаяся обязательная objective получает done/check presentation. `EmberQuestCatalog.projection()` сохраняет одновременно `explicitStatus` и derived `status`, а общий pure owner решения — `EmberQuestState.marker_projection()`.

С v1.55 `EmberInteractEditor` является guided projection прежних scene fields: частые type-specific поля и итог в игре видны сразу, launch rules/quest overrides живут под `Дополнительно`. Dropdown text может быть локализованным `nameRu · id`, но metadata и serialization остаются canonical IDs. Не возвращать плоскую техническую форму, не создавать отдельный simplified Interact contract и не предлагать новый `chest` shell без map-owned loot. Узкая карточка использует wrapping actions; owners разделены как `Настройки` / `Действия` / `Описание задания` / `Событие задания`.

С v1.56 Quest Graph начинает unified authoring view через editor-only `EmberQuestUsageIndex`: реальные `set_flag` writers из native-first action/dialogue catalogs показываются фиолетовыми source nodes и ведут к root/objective. Это backlink projection, не новое поле Quest Resource и не вложенный runtime-граф. Source открывает свой canonical document; производные ноды и их позиции не сериализуются в quest `editorLayout`. Следующее безопасное расширение — scene-owned Interact/Area3D backlinks и drag-to-bind через существующий action save/Undo owner, а не NodePath внутри Quest Resource.

С v1.57 source-ноды Quest Flow имеют bounded geometry: не использовать autowrap для технических ID внутри GraphNode, иначе Godot 4.7 вычисляет огромную minimum height. Canvas показывает ellipsis с tooltip. `GraphEditorScroll` не участвует в horizontal expand, а selected-node label клипуется, поэтому правая колонка не скачет от длины имени; пользователь по-прежнему может двигать штатный split divider.

С v1.58 вычисляемые Quest Flow backlinks снова draggable. Их положение принадлежит `_view_states` редактора и может переживать rebuild вкладки, но `_apply_cached_quest_layout()` сериализует только `quest_root`/`objective:*`. Не блокировать drag ради защиты Resource: защита уже находится на правильной serialization boundary.

С v1.59 `EmberQuestUsageIndex.scene_entries()` добавляет зелёные backlinks только из текущего edited scene root: `EmberInteract.resolved_action_script_id()` сопоставляется с фиолетовыми action/dialogue writer nodes. Кнопка передаёт относительный NodePath плагину, который повторно разрешает target и выбирает voxel owner/standalone Interact через штатный EditorSelection. Scene path остаётся editor navigation data и не сериализуется. Следующий срез — guided bind выбранного объекта к objective через существующий `save_chain`/Editor Undo owner, не через прямое редактирование визуального провода.

С v1.60 Quest Flow принимает текущий `EditorSelection` только как editor target и показывает bind-кнопки start/complete на quest root и objective-complete на цели. `EmberObjectInspectorActions.bind_quest_event()` разрешает editor-only token через `EmberQuestStore.action_for_event()`, добавляет прежний canonical `set_flag` и делегирует `save_chain()`/`save_standalone_chain()`, поэтому Action Resource + scene binding имеют один Undo snapshot. Voxel без Interact получает `quest_marker`; существующий kind не преобразуется. Одинаковый event не дублируется, перед terminal `change_map` вставляется до перехода. `scene_binding_changed` обновляет зелёную проекцию на do/undo/redo. Не добавлять второй writer для будущего drag gesture и не сериализовать selection/NodePath в Quest Resource.

С v1.61 bind обязан работать с новой целью до отдельного Save. Graph передаёт текущий валидированный Quest draft, `EmberQuestStore.action_for_event_in_document()` компилирует token относительно него, а optional Quest snapshot входит в ту же Undo operation, что Action Resource и Interact. После успешного commit workspace reload считает draft сохранённым. Не возвращать lookup только через disk catalog: он воспроизводит ошибку `quest event could not be bound`, когда objective уже видна в Graph, но ещё отсутствует в `.tres`.

С v1.62 выбранный несвязанный scene owner проецируется session-only `scene_candidate` нодой. Её зелёный output и output существующей scene-ноды можно тянуть к раздельным зелёным input root start/complete либо objective complete. `_on_connection_request()` только строит editor event token и вызывает тот же v1.61 signal/writer; сам прямой провод не сериализуется. После commit вид должен показывать фактическую двухступенчатую связь через canonical purple writer. Не создавать отдельный drag mutation path и не убирать bind-кнопки как доступную альтернативу.

С v1.63 зелёный scene → action-writer провод поддерживает disconnect и явную кнопку для выбранного scene owner. `EmberQuestUsageIndex` передаёт `writerIndex`, но mutation дополнительно сверяет `set_flag` по flag/value; `EmberObjectInspectorActions.unbind_quest_event()` удаляет один шаг с единым Undo snapshot. Для action chain с несколькими scene consumers обязателен copy-on-write: выбранный объект получает отдельный Resource, остальные сохраняют исходный. Пустая неразделяемая цепочка удаляется, пустая разделяемая только отвязывается от выбранного объекта. Dialogue writers из Quest Flow не мутировать: они редактируются в Dialogue Graph, иначе локальный жест незаметно меняет общую ветку.

С v1.64 Quest Flow по умолчанию является compact overview: root/objective cards + dependency wires, а action/dialogue/scene backlinks не создаются до drill-down выбранного target. Карточка агрегирует counts и сохраняет bind-кнопки; `Открыть события и объекты` переключает session-only `_quest_focus_target`, где работают прежние canonical open/bind/unbind paths. `Все связи` (`__all__`) оставляет полную диагностику. `_view_key()` разделяет overview/focus/all camera state; `_on_end_node_move()` переносит позиции в Quest `editorLayout` только из overview. Не заменять это GraphFrame collapse и не сериализовать focus, backlinks либо compound-node state в Quest Resource.
## Godot Ember Graph v1.65 — GraphNode port-index hotfix (2026-09-01)

- Исправлена регрессия compact Quest Flow: Godot индексирует порты GraphNode среди включённых входов, а не по номеру slot. Когда overview скрывает золотой membership-вход, синий dependency-вход имеет индекс `0`; в focus/all-links — `1`.
- `_quest_dependency_input_port()` теперь единый owner этого отображения для render/connect/disconnect. Не использовать номер slot как port index напрямую при условно скрываемых слотах.
- `test_graph_workspace.gd` проверяет границы всех отрисованных GraphEdit connections и оба режима индексации. Сигнатура предотвращённой регрессии: `graph_node.cpp ... p_port_idx = 1 is out of bounds (left_port_cache.size() = 1)`.

## Quest stop-line и следующий продуктовый срез (2026-09-01)

- Пользователь вручную принял текущие Quest Resource/Flow, зависимости целей, object/event binding, динамические маркеры и компактный graph UX. Считать это стабильным stop-line, а не поводом продолжать универсальный quest editor.
- Типы `kill/count`, `collect/have/deliver`, `discover/clear`, relationship и escort не добавлять как пустые поля. Вернуться к ним только после появления соответствующего единственного runtime event owner; ворота и ожидаемые authoring-проекции перечислены в [`EMBER_COMBAT_D1.md`](EMBER_COMBAT_D1.md).
- Активный продуктовый этап — D1 Combat Paper Prototype. До его решения не создавать battle manager/schema/editor. D1 сравнивает позиционные области с маленькой сеткой на одинаковом encounter, фиксирует четыре стихии, минимальные реакции, восемь действий и три тестовых боя.

## Godot Ember Migration v1.66 — D1 Combat Lab skeleton (2026-09-01)

- `res://scripts/prototypes/ember_combat_prototype.gd` — единственный pure owner правил лаборатории: snapshot, action catalog, timeline, valid targets, preview/commit, deterministic enemy command и outcome. Он намеренно не является autoload/Resource/save owner.
- `res://scenes/combat_lab.tscn` + `ember_combat_lab.gd` отображают E1 через Control UI. Preview и commit вызывают один resolver; action delay заранее перестраивает predicted timeline. Четыре области проверяют zonal-кандидат до grid.
- Source translation: Trails → открытая очередь/задержка; Magicka → новая стихия × существующее состояние с явным preview; Disgaea → правило области и forced movement; duo gate → отдельный situational verb вместо relationship multiplier. Не переносить AT bonuses, пятиэлементный input, full SRPG grid или grind до их собственного теста.
- Editor entry — только `Project → Tools → Ember: Open/Run Combat Lab`. Lab не меняет main scene, save, quests, inventory и legacy arena. E2 zones/grid comparison и E3 boss field mutation остаются D1, не production D2.
- Gates: `test_combat_prototype.gd` и `test_combat_lab.gd`. Любая следующая боевая правка сначала расширяет pure resolver и preview test, затем UI/commit; формулы в Control не копировать.

## Godot Ember Migration v1.67 — D1 E2 grid comparison (2026-09-01)

- Combat Lab по умолчанию открывает E2 на сетке 7×5, но E1 areas остался в верхнем selector для сравнения. `ember_combat_grid.gd` — pure owner топологии, BFS reachability, blockers/occupancy, panel groups и staged movement; он не копирует damage/reaction формулы из `EmberCombatPrototype`.
- Команда героя двухфазная в UI, но атомарная в state: `M` ставит destination в preview snapshot, action/target считаются из этой позиции, `F` один раз коммитит movement + consequences. Cancel не мутирует source snapshot.
- Disgaea Geo Effects переведены в две явные linked panel groups: tide несёт Wet/conduction, ember + фиксированный Жар-фокус даёт fire +2. Movable/destructible focus, heights, Lift/Throw, Geo-chain и полный SRPG не приняты.
- Враги пока используют deterministic ranged response без движения: AI movement — отдельная гипотеза, а не скрытый пропуск. Production Resource/save/editor по-прежнему отсутствуют.
- Gates: `test_combat_prototype.gd`, `test_combat_grid.gd`, `test_combat_lab.gd`. Визуальная приёмка делается на 1600×900; цвета панелей должны оставаться видимыми даже на disabled cells.

## Godot Ember Migration v1.68 — universal Defend command (2026-09-01)

- `defend` — общая self-target команда в прежнем pure action catalog: ноль урона, delay 85, ход завершается, следующий входящий урон сокращается вдвое. Self-status ставится на 2 в preview, чтобы после общего actor-turn decay остался 1 и не исчез в свой commit.
- UI показывает `G. Защита`; hotkey `G` выбирает её на ходу любого героя. В E2 она совмещается со staged movement и тем же одним `F` commit. Не смешивать с `guard` / «Прикрытие» Орика, которое target'ит союзника.
- `test_combat_prototype.gd` закрепляет purity, self-target, turn advance, persistence и consumption защиты; `test_combat_lab.gd` — доступную без врага кнопку и прежний staged move + attack route.

## Godot Ember Migration v1.69 — staged movement projection (2026-09-01)

- `EmberCombatGridView` рисует план перемещения из уже существующей `_pending_cell`, не мутируя snapshot и не вводя второй position owner. Destination показывает героя, HP, `план / ждёт F` и янтарную рамку; origin показывает стрелку к destination.
- Hit projection тоже использует display occupant: self-target/Защита кликается на destination, origin больше не выглядит занятым. Movement legality по-прежнему считается по actual occupants/reachability из pure grid.
- `test_combat_lab.gd` закрепляет обе метки и доказывает, что canonical клетка до `F` остаётся origin. Визуальная приёмка 1600×900 подтвердила читаемость D2/B3 без сдвига layout.

## Combat terrain / 3D tool decision (2026-09-01)

- Переход к 3D не означает новый battle owner. Canonical клетка/высота/проходимость/панель/временное состояние остаются в pure combat snapshot; Godot scene является projection и отправляет commands.
- Базовый штатный инструмент D2.0 — `GridMap + MeshLibrary`: он подходит для 3D tile palette и graybox, но не владеет BFS, reaction rules или runtime mutation. `NavigationMesh` для маленького пошагового поля не нужен.
- Перед 3D projection обязателен ограниченный D1.5: используемая resolver-ом высота + единое правило перехода и один E3 `cellChanges` preview/commit. Не добавлять неиспользуемую универсальную terrain schema заранее.
- D2.0 затем добавляет orthographic/isometric view, grid↔world adapter, mouse pick и visual states. Юниты/Geo symbols/destructibles остаются отдельными сценами; GridMap — только статические/заменяемые ground tiles.
- Terrain3D отложен для крупных exploration zones, Cyclops — только возможный UX/blockout reference, Voxel Tools — тяжёлый отдельный terrain owner. Ничего из них не устанавливать до отдельного acceptance spike; аудит находится в `../ember-godot/docs/EMBER_ADDONS.md`.

## Godot Ember Migration v1.70 — D1.5 semantic terrain (2026-09-01)

- `EmberCombatTerrain` — pure leaf owner `cell_key/elevation/can_step/apply_cell_changes`. Grid BFS и `EmberCombatPrototype._set_push()` обязаны читать один `MAX_STEP_HEIGHT = 1`; не копировать правило в 3D view, AI или editor.
- E2 cells теперь содержат используемый `elevation`: верхняя терраса +1, тестовый высокий уступ +2. Это пока одна top surface (`Vector2i + elevation`), не преждевременная multi-floor `Vector3i` schema.
- E3 `field_mutation_state()` начинает с Орика: Cold по Wet tide-group возвращает preview `cellChanges` для шести панелей (`Wet → Frozen`), Fire по Frozen возвращает Wet. `Combat.commit()` применяет те же patches; cancel/preview сохраняют source snapshot.
- `EmberCombatGridView` проецирует pending cellChanges голубой рамкой, `Frozen · прогноз`, высотой и tooltip до `F`. Это reference parity для следующего `GridMap` adapter, а не второй terrain renderer.
- Gates `test_combat_prototype.gd`, `test_combat_grid.gd`, `test_combat_lab.gd` проходят на Godot 4.7.2. Этот semantic contract использован следующим D2.0/v1.71 без production Resource/editor/save.

## Godot Ember Migration v1.71 — D2.0 native GridMap projection (2026-09-01)

- `EmberCombatGrid3DView` — `SubViewportContainer` с orthographic `Camera3D`, native `GridMap` и generated graybox `MeshLibrary`. `configure()` принимает тот же state/selection/pending/preview, что 2D projection; lab сохраняет viewport между refresh вместо пересоздания GPU/world resources.
- Semantic `Vector2i + elevation` преобразуется только adapter-ом в `Vector3i(x, elevation, z)`. Units, labels и Geo focus — отдельные Node3D; reachable/pending/target/cellChanges — visual overlays. GridMap/collision не вычисляют legality.
- Mouse input: camera ray → MeshLibrary collision → `GridMap.local_to_map()` → прежний `cell_chosen`. Staged hit projection переносит active occupant на destination и освобождает origin, поэтому self-target/attack selection совпадает с видимой позицией до commit.
- E2/E3 default view — 3D; `Вид · 2D диагностика` возвращает прежний `EmberCombatGridView` без сброса encounter state. E1 zones остаётся Control comparison.
- `test_combat_lab.gd` закрепляет 35 native cells, настоящий physics ray на D2, staged Node3D/occupant, E3 projected Frozen item/overlay, atomic state и возврат 2D. Все три combat gates проходят Godot 4.7.2.
- Не добавлены NavigationMesh, production battle Resource/editor/save и external addons. Cyclops оценивается только после ручного D2.0 UX, Terrain3D остаётся кандидатом D3 large zones, Voxel Tools — отдельным R&D при свободном volumetric destruction.

## Godot Ember Migration v1.72 — standard Node3D Combat Lab boundary (2026-09-01)

- Основная `scenes/combat_lab.tscn` больше не является полноэкранным Control с миром внутри `SubViewport`. Корень — обычный `Node3D`; `GridMap`, `Actors`, `Overlays`, `CameraRig/Camera3D`, свет и `WorldEnvironment` являются scene-owned узлами, а прежний controller/UI живёт в `CanvasLayer` как HUD.
- `EmberCombatGrid3DWorld` извлечён как одна переиспользуемая сцена-проекция. Main lab использует её напрямую; `EmberCombatGrid3DView` теперь только compatibility `SubViewportContainer` и инстанцирует ту же сцену. Правила, ray-pick и visual state не скопированы.
- Внешний HUD передаёт тому же миру `state/selection/pending/preview`; в 3D центральная область HUD прозрачна для основной камеры. `Вид · 2D диагностика` и E1 скрывают 3D-мир, не меняя snapshot.
- `test_combat_lab.gd` требует root `Node3D`, scene-owned GridMap/Camera3D, отсутствие embedded viewport в main scene, 35 cells, physics ray, staged actor, E3 mutation и 2D parity.
- Это исправление scene boundary перед authoring, не завершённый редактор. Generated graybox `MeshLibrary` пока transient; следующий D2.1-срез — authored `.tres` palette, layout Resource/validation, Undo/Redo и save/reopen.

## Godot Ember Migration v1.73 — authored combat camera (2026-09-01)

- Не создан отдельный camera manager: расширен прежний `OrbitCamera`. Он умеет использовать scene-authored дочерний `Camera3D` через `camera_path`, сохраняя legacy fallback для `spike.gd`.
- `CameraRig` в battle scene хранит target, distance, yaw/pitch в градусах, min/max, orthographic/perspective, orthographic size, FOV, near/far и sensitivities. Скрипт `@tool`, поэтому Inspector-параметры видны и применяются в editor viewport; runtime не сериализует отдельный camera JSON.
- Управление: RMB orbit, MMB planar pan, wheel zoom, WASD/arrows pan, Q/E yaw, Home reset к authored launch snapshot. В orthographic режиме wheel меняет size; в perspective — distance, а FOV применяется только перспективной камерой.
- Main HUD field surface передаёт mouse events в `EmberCombatGrid3DWorld.handle_camera_input()`, который делегирует тому же CameraRig. Кнопки вне поля не вращают камеру; embedded compatibility view использует тот же маршрут.
- `test_combat_lab.gd` закрепляет wheel/orbit/pan, projection/FOV, Home reset и ray-pick alignment вместе с прежним staged/terrain контрактом.

## Godot Ember Migration v1.74 — separate arena scenes + editor preview (2026-09-01)

- Принят гибридный authoring-контракт: каждая battle arena — отдельная `.tscn`, владеющая визуальной композицией, scene-owned GridMap, светом, CameraRig, декором и будущими spawn anchors. Будущий battle `.tres` владеет semantic cells/groups/encounter refs; pure resolver остаётся владельцем legality/preview/commit.
- Первые сцены: `res://scenes/combat/arenas/colored_crossing.tscn` (E2) и `thaw_keeper.tscn` (E3). `combat_lab.tscn` инстанцирует E2 arena вместо prototype world напрямую.
- `EmberCombatGrid3DWorld` теперь `@tool` и имеет `Editor Preview Enabled/Mode`. В editor он строит 35 cells, elevation, blockers, actors/focus и E2/E3 preview из тех же `Grid.initial_state/field_mutation_state + Grid.command_preview`; отдельной editor-формулы нет.
- Плагин добавляет `Open Battle Arena · E2/E3`. Открытая arena и main Combat Lab больше не пусты в 3D viewport до Play. Camera/light/decor overrides можно сохранять в конкретной `.tscn`.
- Текущие preview cells transient и ещё не являются production paint workflow. D2.1 продолжает authored MeshLibrary `.tres`, semantic battle Resource, validation, Undo/Redo и save/reopen; не разрешать визуальному GridMap стать вторым gameplay owner.
- `test_combat_arena_scenes.gd` закрепляет открываемость обеих сцен, mode, 35 cells, camera/actors и E3 Frozen preview без state leak.

## Godot Ember Migration v1.75 — CameraRig Inspector live-preview (2026-09-01)

- Штатный Godot показывает camera preview только при выборе самого `Camera3D`. `EmberCameraRigInspectorPlugin` добавляет такой же author-facing кадр при выборе `OrbitCamera/CameraRig`, чтобы ракурс и параметры объектива настраивались в одном Inspector.
- `EmberCameraRigPreview` создаёт только editor-only `SubViewport + Camera3D`, подключает viewport к `World3D` открытой arena-сцены и копирует transform/projection/keep-aspect/size/FOV/clip/cull дочерней камеры. Не дублировать сцену, GridMap, свет или runtime rig внутри preview.
- `OrbitCamera._validate_property()` делает неактивный объектив read-only: orthographic projection читает `orthographic_size` и игнорирует FOV по контракту Godot; perspective читает FOV и игнорирует orthographic size. Preview status обязан называть активное значение, чтобы это не выглядело сломанным параметром.
- Preview существует только пока показан Inspector, при сворачивании перестаёт обновляться; кнопка выбирает реальную дочернюю камеру для редких штатных свойств. Никакие preview nodes не сериализуются в `.tscn` и не появляются в Play.
- Gate `test_combat_camera_rig_preview.gd` проверяет общий World3D, pose/lens sync после изменения authored rig и наличие навигации к дочерней камере; headless editor startup проверяет регистрацию/снятие Inspector plugin.

## Godot Ember Migration v1.76 — authored semantic Battlefield Resource (2026-09-01)

- `EmberBattlefieldResource` стал единственным authored owner размеров, row-major terrain kinds/elevations/blocked/groups и Geo focus. `EmberCombatGrid.initial_state(field)` преобразует его в прежний snapshot; combat/terrain/resolver API не получили параллельной схемы.
- E2 `colored_crossing.tres` и E3 `thaw_keeper.tres` назначены соответствующим arena `.tscn`. Два файла намеренно независимы для будущего изменения карт; presentation scene по-прежнему владеет камерой/светом/декором, Resource — semantic cells, GridMap — transient projection.
- `EmberBattlefieldInspectorPlugin` показывает сохранённую 7×5 мини-карту, высоты, focus, tooltips, counts и validation. Raw PackedArrays — временный storage UI; не улучшать их как финальный authoring flow. Следующий срез — одна paint-палитра поверх этого же Resource с Editor Undo/Redo, без сериализации GridMap как gameplay data.
- `test_battlefield_resource.gd` закрепляет validation, arena references, Inspector preview и save/reopen signature; grid/arena/lab gates проверяют parity прежнего боя.

## Godot Ember Migration v1.77 — Battlefield paint palette (2026-09-01)

- `EmberBattlefieldEditorActions` — единственный editor mutation owner для cell painting. Он получает pure `edited_cell_snapshot()` от Resource и одной Undo/Redo action меняет terrain/elevation/blocked/group/focus PackedArrays; do/undo вызывают `emit_changed()` для Inspector и arena preview.
- Guided palette живёт в существующем `EmberBattlefieldInspectorPanel`: Neutral/Wet/Ember/Frozen/Blocked/Height ±/Focus. Пустой group ID нормализуется только при paint (`tide`/`ember`); runtime schema остаётся прежней. Обычная кисть очищает terrain/block/group, но не высоту.
- `EmberCombatGrid3DWorld` видит новый `content_signature()` в editor process и перестраивает projection из того же Resource. Не сохранять визуальный GridMap и не добавлять второй editor-state файл.
- Один клик является одной штатной Undo operation; Ctrl+S сохраняет внешний `.tres`. Drag-stroke batching и изменение размеров палитрой не входят в этот срез — не обещать их как готовые до отдельного lifecycle/Undo gate.

## Godot Ember Migration v1.78 — native 3D Battlefield Paint Mode (2026-09-01)

- `EmberBattlefield3DPainter` встроен в существующий `Ember Migration` через штатные `EditorPlugin._forward_3d_gui_input()` и viewport overlay. При выбранном корне валидной arena верхняя 3D-панель включает восемь тех же semantic-кистей; ЛКМ рисует непрерывный штрих, `Alt+ЛКМ` берёт surface/group, ПКМ/СКМ остаются за CameraRig/editor navigation.
- Во время drag Resource и GridMap не мутируют на каждом mouse motion: painter хранит только уникальные canonical cells и preview-outline, а на release передаёт их единственному mutation owner `EmberBattlefieldEditorActions.paint_cells()`. Весь штрих — одна Editor Undo/Redo action и один `emit_changed()`; save продолжает писать исходный `.tres`.
- Editor и runtime используют один camera-ray → GridMap picker. Если physics shapes ещё не зарегистрированы сразу после открытия сцены, общий adapter выбирает ближайшую верхнюю semantic surface клетки; это lifecycle fallback, а не альтернативная grid/schema. Контур учитывает elevation и верх blocker.
- `test_battlefield_resource.gd` закрепляет toolbar/8 brushes/непрерывный stroke/atomic three-cell Undo; `test_combat_arena_scenes.gd` — общий picker и hover corners. Combat grid/lab/camera/resolver gates проходят. Следующий authoring-вопрос — resize/fill и visual MeshLibrary, не второй runtime/editor owner.

## Godot Ember Migration v1.79 — rectangle, guided fill и shared visual palette (2026-09-01)

- 3D painter имеет orthogonal shape selector: Brush соединяет редкие mouse events дискретной линией, Rectangle получает canonical cells между anchor/hover, Fill делает four-neighbor flood только по совпадающим terrain/blocking/elevation/group. Эти selector-методы принадлежат `EmberBattlefieldResource` authoring API и не меняют runtime snapshot/schema.
- Rectangle/Fill до release существуют только как overlay cell list и затем вызывают прежний `paint_cells()` один раз. Один Undo отменяет весь набор; Esc отменяет preview. Focus принудительно использует одиночный Brush, чтобы массовый selector не создавал зависимость от порядка cells.
- `EmberBattlefieldEditorPalette` является общей visual metadata для Inspector и 3D: восемь label/color/icon больше не дублируются, icon textures кэшируются. Swatches обозначают semantic brushes и не являются production battle meshes.
- `test_battlefield_resource.gd` проверяет rectangle 2×3, guided fill на synthetic fixture с elevation boundary, три shape mode, Focus lock, shared icons и прежний atomic Undo/save gate; форма пользовательской E2-карты тестом не фиксируется. Все combat/arena/camera tests проходят. Следующий срез — visual MeshLibrary/tiles; resize поля остаётся отдельным data migration gate.

## Godot Ember Migration v1.80 — authored visual Battlefield MeshLibrary (2026-09-01)

- `content/combat/tiles/ember_battlefield_tiles.tres` — единый visual owner items 0 Neutral, 1 Wet, 2 Ember, 3 Frozen, 4 Blocked. Base arena, E2/E3 и Combat Lab ссылаются на этот внешний Resource; `EmberCombatGrid3DWorld` больше не генерирует MeshLibrary, а при пустой scene link загружает тот же default path.
- Primitive meshes сохраняют прежние размеры/collision и поэтому ray-pick parity; общий shader различает surface каменной рамкой, water bands, emissive ember cracks, ice facets и blocked hazard bands. Это стилизованный graybox, а не schema: будущие voxel meshes заменяют item mesh под тем же ID.
- `EmberBattlefieldTileLibrary` централизует path/ID/name/mesh/collision validation. Arena configuration warnings используют тот же контракт. Кнопка `Тайлы…` открывает Resource, а `EmberBattlefieldTileLibraryPanel` показывает пять real meshes в одном editor-only SubViewport и зелёную/точную ошибочную диагностику.
- Новый `test_battlefield_tile_library.gd` проверяет resource sharing base/E2/E3/Lab, пять IDs, collision, distinct shader pattern и Inspector preview. Battlefield/grid/arena/lab/camera/resolver gates проходят. Старые height/fill tests больше не фиксируют форму пользовательской E2-карты: точные rule fixtures строятся только в памяти.

## Unified voxel Tile Kit + battle flow decision (2026-09-01)

- Подробный план: `docs/EMBER_VOXEL_TILE_AND_BATTLE_FLOW.md`. Новая art-плотность environment tiles — 32×32 voxel на один gameplay block; legacy models без metadata остаются 16. Добавляется явный `voxelsPerBlock`, а `sizeBlocks` не меняет смысл footprint.
- Нельзя менять глобальный `VOXELS_PER_BLOCK` с 16 на 32: все 10 текущих maps имеют `tileSize=16`, а 176 models не хранят resolution. Mesh строится в normalized block units; exploration (`tileSize=16`) и battle (`cell=1.2`) используют placement adapters. Текущий `EmberVoxelPrefab` кэш по одному `model_id` не подходит для двух физических размеров без этой нормализации.
- Автор получает один Godot Tile Kit/library UX с preview/search/tags/favorites и общими Brush/Rectangle/Fill/Pipette/Undo, но два режима layout: World и Battlefield. JOI остаётся source voxel sculptor; Godot — placement/scene/collision/diagnostics. `EmberBattlefieldResource` не владеет world layout, а будущий world pilot не копирует battle semantics.
- Первый battle plan ещё не закрыт: v1.81/D2.1h сделал safe resize/remap и deployment anchors; v1.82/D2.2a+b добавил Encounter Resource/library и terminal `talk → start_battle` с отдельной outcome chain после возврата. Session хранит только строки/ID, потому что SceneTree уничтожает outgoing Nodes. Остались retry/fade и идемпотентная result transaction.
- После encounter result gate добавляются reward transaction и combat quest events. Только затем моделируются enemy/tag/count objectives, loot и data-driven action/AI content. Voxel battle kit заменяет MeshLibrary items под прежними semantic ID; world-mode проверяется только на одной sandbox-карте до массовой миграции.

## Godot Ember Migration v1.81 — safe resize + deployment authoring (2026-09-01)

- `EmberBattlefieldResource` теперь владеет ordered `party_deployment_cells` / `enemy_deployment_cells`; `to_grid_dictionary()` проецирует их, а `EmberCombatGrid.initial_state()` размещает текущих lab units по canonical order. Удалены скрытые E2/E3 placement dictionaries. Будущий Encounter Resource свяжет явные unit slots, не создавая второй набор координат.
- `resize_preview()` является pure remap owner: девять anchors вычисляют offset, row-major terrain/elevation/blocked/groups переносятся в новые arrays, focus ищет ближайшую walkable клетку, deployments remap/crop. Отчёт содержит kept/lost/new cells и потерянные точки; Apply запрещён, если исчезает последняя сторона.
- `EmberBattlefieldEditorActions.resize_field()` коммитит width/height, четыре cell arrays, focus и обе стороны одной Editor Undo/Redo operation. Inspector показывает dimensions, anchor и loss-preview до Apply; кнопка `Размер…` в 3D toolbar открывает тот же Resource, не второй resize path.
- Общая палитра расширена с 8 до 10 инструментов: `Точка героев` / `Точка врагов` — single-cell toggle, видимый как Гn/Вn в мини-карте и editor arena. Нельзя ставить start на blocker/focus, накладывать стороны или удалить последнюю точку; Blocked/Focus также не могут незаметно удалить последний deployment.
- E2/E3 `.tres` получили прежние стартовые позиции как authored data. `content_signature`, validation и save/reopen включают deployments; изменение точки сразу перестраивает editor preview и передвигает lab actor.
- Gates: `test_battlefield_resource.gd` проверяет centered expansion, counts/offset, safe crop warning, atomic undo/redo, 10 tools, runtime placements и round-trip. Tile library, grid, resolver, arena, camera и Combat Lab tests проходят; headless editor регистрирует/снимает plugin без ошибок. Следующий срез — D2.2a Encounter Resource + visual library.

## Godot Ember Migration v1.82 — Encounter Resource + battle return (2026-09-01)

- Canonical encounters: sibling `../ember-godot/content/combat/encounters/*.tres`, class `EmberEncounterResource`, catalog `EmberEncounterCatalog`. Battlefield Resource остаётся owner cell/deployment data; Encounter хранит ссылки и ordered prototype unit IDs.
- Action schema расширена восьмым типом `start_battle { encounterId }`. Он terminal; post-result продолжение задаётся `victory_action_script_id` / `defeat_action_script_id`. Store, inline Inspector editor, Ember Graph, runtime normalizer и visual picker используют один тип.
- `EmberCombatTransition` process-local: pending/active encounter ID, return scene path, outcome action ID. Между сценами нельзя добавлять Node/UI references. Explore save остаётся v1; `arm_saved_spawn_restore()` переиспользует прежний spawn restore после возврата.
- `combat_lab.tscn` остаётся единственным runtime. HUD может выбрать Encounter из каталога или потребить transition; внешний `EmberCombatGrid3DWorld` получает Battlefield той же встречи. После результата мир создаёт новый InteractionUI и потребляет строковый outcome action.
- Fixture: `colored_crossing_demo.tres`, start chain `colored_crossing_start`, victory chain `colored_crossing_victory`. Gates: `test_encounter_resource.gd` и реальная смена сцен в `test_combat_encounter_transition.gd`; action/graph/combat/battlefield gates сохраняют parity.
- Не считать готовыми fade, retry/escape, idempotent reward transaction, полноценные unit/enemy/job/loot Resources или combat quest counters. Следующий срез — result/retry lifecycle, затем quest/reward bridge.
