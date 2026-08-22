# Ember — инструкция и handoff для ИИ

Актуально на 22 августа 2026 года. Этот документ — рабочий контекст для Cursor/Codex при продолжении разработки Ember. Он описывает не только существующий код, но и намерение системы: чего добивались, какие решения уже приняты и куда двигаться дальше.

Для задач Ember этот handoff имеет приоритет над старой пометкой «Ember не трогаем» в общем `docs/IMPROVEMENTS.md`: пользователь явно продолжает разработку Ember.

## 1. Что такое Ember

Ember — встроенная в JOI Conductor игра и редактор контента с кубичной/воксельной стилистикой.

Основные игровые направления:

1. Исследование объёмных карт: прогулка, поиск путей, головоломки, интерактивные объекты, триггеры, события и сюжетные зоны.
2. Разломы/аномалии: отдельные карты с боем в духе Vampire Survivors — толпы врагов, автоматические атаки, опыт, сундуки и развитие билда.
3. Редактор должен позволять собирать оба типа карт без правки кода.

Источник правды режима — `EmberMap.playProfile` (`arena` | `explore`, omit = `arena`). Это один Three.js play loop (`EmberThreeWorld`), не два движка. В play мышь крутит камеру с pointer lock с клика «Начать». Esc открывает меню паузы (курсор виден). Chromium после Esc ~1.25 с отвергает `requestPointerLock` даже с клика, поэтому «Продолжить» активна после этой паузы и берёт lock с жеста. Пока lock нет, Windows ClipCursor по HWND окна + SetCursorPos в центр (как в играх): курсор не уходит на второй монитор и камера не упирается в край. Не открывать меню на каждый `pointerlockchange`/`pointerlockerror`. ЛКМ не атакует. Explore грузит всю карту до `api.ready` и не пересобирает свет при смене чанка.

- **Арена** (в т.ч. существующий `hu_tao_yard` без поля): волны из spawn table, F4/Shift+F4 орда, enemy LOD/crowd, мало PointLight cube-shadow, геометрия может быть простой.
- **Исследование** (деревня / JRPG): орда и F4 выключены; bake-солнце, уличные фонари (cube только у ближайших), окна = emissive fill без cube, стоячие/гуляющие NPC (кап 24, без боя и диалогов).

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
- `SceneEditorPanel.tsx` — нарративные сцены.
- `StageEditorPanel.tsx`, `SpawnEditorPanel.tsx` — стадии и волны.
- `ArtsEditorPanel.tsx` — библиотека артов/портретов и связанного контента.

## 3. Контент-пак

Исходные данные находятся в `content/ember/`:

- `pack.json` — метаданные и default stage;
- `maps/` — карты (`loadEmberPack` читает всю директорию; fallback — `hu_tao_yard`);
- `tilesets/` — тайлы, материалы, физика и семантика (директория; fallback — `graveyard_16`);
- `sprites/registry.json` — пиксельные спрайты;
- `voxels/models/<id>.json` + `voxels/models/<id>.vox` — пара prefab: JSON (id, теги, коллизия, свет, extra channels), MagicaVoxel `.vox` (форма + палитра). `writeVoxelRegistry` пишет оба файла; `loadEmberPack` склеивает пару. Старые JSON с `model.voxels` ещё читаются до первого save;
- обмен с внешним миром: `.vox` (форма + палитра), Ember JSON (коллизия/свет/id). Кодек: `src/game/voxel/vox/voxFile.ts`, `emberVoxCodec.ts`. Оси: MagicaVoxel Z-up → Ember Y-up (`ember(x,y,z) = vox(x,z,y)`). В скульпторе: **Импорт** / **Из .vox** / **В .vox** / **MagicaVoxel** (открыть файл и watch: save в MV → сетка в Ember, JSON не затирается); extra channels не ездят через MagicaVoxel. Куб/ластик: форма точка/линия/коробка/сфера (N, drag), выделение ↻X/Y/Z и Дубль (`voxelShapeBrush.ts`). Палитра: **Замена** (P) и Alt+клик слота — remap индекса по всей модели или выделению (`voxelPaletteOps.ts`);
- библиотека карты: поиск по имени/id/тегу и чипы тегов (`libraryTags.ts`, `emberLibraryIndex.ts`). Теги пишутся на prefab (`tags` у модели и обёртки JSON) и спрайте; префиксы `vox_vil_` / `vox_fan_` дают search-only `village` / `fantasy`, пока автор не сохранит явный список. Find References считает voxelProps, chest `closedModelId`/`sceneId` и чужие voxel-сцены; **К размещению** прыгает по открытой карте;
- `voxels/scenes/<id>.json` — только multi-object workspace, если сцена не совпадает с id модели;
- `loadEmberPack` читает `voxels/models/*.json` (и leftover `registry.json` / `village.json`, если они ещё лежат в корне), затем соседний `.vox` если `mesh.file` задан и occupancy в JSON пустая;
- сохранение через `writeVoxelRegistry(..., { dirtyIds })` пишет **только** изменённую пару json+`.vox`; отсутствие в памяти ≠ удаление;
- старые монолиты после сплита: `voxels/_legacy/` (локальный бэкап, не в git);
- `lights/registry.json`, `looks/registry.json` — пресеты света и внешнего вида;
- `stages/` — правила забега;
- `spawns/` — волны врагов;
- `weapons.json`, `enemies.json`, `pools/` — combat content;
- `regions` внутри карты — spawn/player/chest/teleport/trigger/camera и explore NPC (`npc_idle` / `npc_wander`);
- `playProfile` на карте — `arena` (бой) или `explore` (деревня); omit = арена;
- `scenes/`, `events/`, `arts/`, `portraits/` — нарратив и визуальные ресурсы.

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
- Z/elevation — высота;
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
- Spawn / Chest / Camera Bounds.

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
- **explore** — больше fill-ламп и NPC; прогулка без победы по таймеру. Streaming выключен: play ждёт `api.ready` (вся местность + props + bake всех local cubes + первый dynamic bake + один полный present для компиляции шейдеров). Realtime cubes — пул `dynamicPointShadows`, не обязательно на каждый оконный проём. Смена focus-чанка не делает `replaceLights` / не сбрасывает cached cubes.

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

## 11. Ближайший план

### Сначала — стабилизация мира

1. Проверить полный static shadow bake на нескольких authored и emissive источниках: стены, voxel props, спрайты, разные Z и максимальное мерцание.
2. Если 1.5× окажется недостаточно или слишком дорого, вынести `shadowBakeReachMultiplier` в компонент/Inspector света с безопасным диапазоном, но не возвращать per-frame bake.
3. Прогнать collision regression: проход под блоком, лестницы, стены неполной высоты, stacked voxel props, падение, step-up и разные Scale.
4. Убедиться, что Library placement, Outliner selection и Inspector дают одинаковый объект и одинаковые undo/redo операции.
5. В play проверить map-wide sun bake (тени объектов за игроком не обрываются) и свет ламп внутри солнечной умбры. Дальние лампы не должны пересобирать cube maps. F3 и F4.

### Скульптор (MagicaVoxel-паритет)

1. Watch `.vox` / открыть MagicaVoxel — **сделано**.
2. Shape brushes (линия/коробка/сфера) + поворот/дубль выделения — **сделано** (`voxelShapeBrush.ts`, N / ] / [ / Ctrl+D).
3. Replace-color по палитре — **сделано** (`voxelPaletteOps.ts`: инструмент **Замена**/P, Alt+клик слота, Shift стирает цвет; выделение ограничивает область).
4. Isolation + overlay коллизии + preview explore-камеры — **сделано**: Shift+H / `/` изоляция, Alt+H показать все; collision overlay рисует AABB физических вокселей и капсулу игрока на `player_start`; Q / Explore — камера как в play; в скульпторе **Капсула** и **Игра** (Shift+F).
5. Library tags + Find References — **сделано**: теги на voxel/sprite, поиск и чипы в лотке библиотеки, Find References в инспекторе (**К размещению** на открытой карте).
6. Creative Mode — **позже**, не в работе сейчас. Контент-боту Grok его не давать.

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

1. Gameplay semantics: tile portal/trigger, `scriptId`, camera bounds и цепочка trigger → event → action.
2. Asset Library 2.0: tags/categories, usage references, safe rename/import, bulk actions.
3. Balance editors: enemies, weapons, pools, stages и playtest from editor.
4. Декомпозиция `MapEditorPanel.tsx` на editor services/hooks без изменения поведения.
5. `loadEmberPack` уже грузит `maps/`, `stages/`, `tilesets/`, `spawns/` и `voxels/models/*.json` как директории. Один воксельный объект = json+`.vox`; save пишет только dirty id. Explore-карта `hu_tao_village`, стадия `village_stroll` (default stage остаётся ареной).
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

1. Прочитать этот файл и релевантный раздел `docs/EMBER_ANOMALY.md`. Если задача — **воксельные модельки для Grok / Voxel bro**, вместо движка читать `docs/EMBER_VOXEL_BOT.md`.
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
