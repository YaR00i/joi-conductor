# Ember — единый voxel tile kit и переход в бой

Статус: общий план принят после v1.80; первый пункт D2.1h выполнен в Godot Migration v1.81. Это не новая параллельная карта и не возврат к Three.js.

## Что увидит автор

В Godot появляется один рабочий вход **Ember Tiles** с общей библиотекой воксельных тайлов: карточки с preview, поиск, biome/tags, избранное, размер в блоках, collision и предупреждения. У него два режима размещения:

- **Мир** — земля, края, стены, вода, дорожки и декор зоны;
- **Поле боя** — та же художественная библиотека, но поверх неё автор задаёт боевые свойства клетки: высоту, преграду, связанную поверхность и Geo-фокус.

Кисть, прямоугольник, заливка, пипетка, preview штриха и Undo/Redo общие. Форматы расположения различаются намеренно: мир не должен хранить panel groups, а бой не должен становиться владельцем всей exploration-карты.

Скульптор исходной voxel-модели остаётся в JOI. Godot отвечает за библиотеку, размещение, сцену, collision-preview и диагностику. Это один art source и один authoring UX, а не два независимых voxel-редактора.

## Единица масштаба

Нужно разделить два понятия, которые legacy Ember смешивает числом `16`:

1. **Блок** — игровая площадь. Один блок занимает одну клетку по X/Z независимо от детализации модели.
2. **Плотность арта** — сколько маленьких вокселей помещается вдоль стороны блока.

Принято:

- новые environment tiles создаются в плотности **32×32 вокселя на блок**;
- существующие модели без нового metadata-поля считаются legacy **16×16 на блок**;
- один новый 32-grid тайл занимает в мире ровно столько же места, сколько старый 16-grid тайл;
- `sizeBlocks` продолжает описывать footprint целыми блоками;
- явное `voxelsPerBlock` описывает только плотность исходника и по умолчанию равно `16`;
- одна gameplay-ступень боевого рельефа планируется как **половина блока = 16 новых art voxels**; декоративные сколы/бордюры ниже этой величины не меняют дальность и проходимость.

32 выбрано вместо 24, потому что даёт точное наследование legacy-сетки: один старый воксель равен сетке 2×2 новых. Можно быстро делать coarse-edit с шагом 2 и переходить к мелкой детали с шагом 1 без дробных координат.

Аудит 2026-09-01:

- все 10 текущих world maps используют `tileSize = 16`;
- все 176 voxel metadata описывают footprint через `sizeBlocks`, но не имеют явного разрешения;
- 62 модели имеют `.vox`; их размеры подтверждают legacy 16-grid, а размеры 32 сейчас означают два блока, поэтому разрешение нельзя угадывать по размеру файла;
- текущая battle cell равна `1.2` Godot units, а exploration block — `16` units. Эти числа пока сохраняются как presentation scale adapters и не входят в art metadata.

## Техническая граница

Voxel mesh строится в нормализованных **block units**, затем placement adapter выбирает физический размер блока:

- exploration adapter читает текущий `map.tileSize` (сейчас 16);
- battle adapter читает размер GridMap cell (сейчас 1.2);
- preview использует тот же builder и тот же scale descriptor;
- collision строится из той же нормализованной геометрии;
- световые параметры хранятся в block units и настраиваются placement adapter, а не запекаются в один prefab для случайного `tileSize`.

Это исправляет текущую скрытую проблему: `EmberVoxelPrefab` кэширует один prefab по `model_id`, хотя мир и бой имеют разные физические размеры. Нельзя просто вызвать существующий prefab builder с `1.2` после импорта с `16` — первый сохранённый вариант победит.

### Ownership

- JOI `voxels/models/<id>.json + <id>.vox` — исходный арт, footprint и `voxelsPerBlock`;
- общий Godot Tile Kit — preview, tags, варианты и нормализованные meshes;
- world layout — текущая импортированная map data, затем один-way migration конкретной карты в Godot Resource;
- `EmberBattlefieldResource` — боевые свойства клетки;
- arena `.tscn` — камера, свет, декор, актёры и композиция;
- `GridMap/MeshLibrary` — размещение/проекция, но не gameplay-проходимость и не elemental rules.

## Почему штатный GridMap остаётся базой

Godot `GridMap` уже даёт редактирование сетки в 3D и ссылается на элементы `MeshLibrary` с mesh/collision. Это соответствует handcrafted-зонам и малым аренам. Он не масштабирует сам mesh при смене `cell_size`, поэтому нормализация в block units обязательна.

Источники:

- [Godot GridMap](https://docs.godotengine.org/en/stable/classes/class_gridmap.html)
- [Godot — Using GridMaps](https://docs.godotengine.org/en/stable/tutorials/3d/using_gridmaps.html)
- [NIS America — Disgaea D2 Geo Effects](https://www.nisamerica.com/disgaea/dis_d2/system/geo_effect.html)

`Terrain3D` остаётся кандидатом только для одной будущей большой природной зоны. Он может отвечать за дальний плавный рельеф, но не заменяет voxel Tile Kit и не владеет боевыми клетками. `Voxel Tools` не нужен, пока дизайн не требует свободных туннелей и разрушения объёма.

## Что осталось закрыть в первом боевом плане

Уже готовы: pure resolver, preview/commit, движение и защита, height/surface mutation, 3D GridMap projection, отдельные arena-сцены, CameraRig, semantic Battlefield Resource, 3D-кисти, Undo/Redo, save/reopen и общая visual MeshLibrary.

До первого production loop остаются четыре обязательные границы:

1. **Безопасный resize/remap поля.** Якорь, новые размеры, preview потерь, перенос focus/groups/spawns, одна Undo-операция и validation.
2. **Deployment/spawn anchors.** Точки партии и врагов редактируются прямо в 3D; нельзя сохранить encounter с точкой вне поля, в blocker или с конфликтом клеток.
3. **Encounter Resource и библиотека.** Карточка encounter выбирает arena, battlefield, состав сторон и начальную расстановку. На первом проходе она может использовать текущих тестовых бойцов и действия; полноценные enemy/jobs/loot не моделируются заранее.
4. **Battle session/result.** Бой получает production boundary, возвращает `victory/defeat/escape`, а награды, save и quest events добавляются только через проверяемый result.

Только затем текущие hardcoded lab actors/actions постепенно переводятся в data-driven content. AI, loot tables, полноценные способности, destructibles и combat quest counters являются следующими вертикальными срезами, а не условием первого перехода в бой.

## Событие «Битва» из обычной локации

Авторский сценарий:

1. На объекте или `Area3D` открыть прежнюю цепочку действий.
2. После диалога выбрать шаг **Битва**.
3. Выбрать encounter по визуальной карточке с preview арены и состава, не вводить путь/ID вручную.
4. В Play игра делает fade, загружает отдельную battle arena, а после победы возвращает героя на прежнее место и продолжает следующие шаги цепочки.

Данные и runtime:

- action step хранит только ссылку на `EmberEncounterResource`; arena не дублируется в каждом триггере;
- process-local battle session хранит return scene/map, позицию, остаток action chain и identity источника;
- существующий action runner **приостанавливается**, а не помечает взаимодействие выполненным до результата;
- victory возвращает в мир, применяет один result transaction и продолжает очередь;
- defeat сначала предлагает retry/return policy; escape добавляется только вместе с реальным правилом побега;
- `change_map` не маскируется под бой: это terminal-переход, а battle — возобновляемое действие с результатом;
- durable save хранит последствия боя, но не временные ссылки на уничтоженную сцену.

Godot при `change_scene_to_file/packed` освобождает старую сцену, поэтому continuation нельзя держать ссылкой на UI или Node. Он должен быть чистым session data и восстанавливаться после сигнала `scene_changed`.

## Порядок следующих вертикальных срезов

1. **D2.1h — resize/remap + deployment anchors — выполнено в v1.81.** Battlefield editor переносит layout атомарно, preview показывает потери, а runtime читает canonical starts.
2. **D2.2a — Encounter Resource + визуальная библиотека — выполнено в v1.82.** Одна E2-встреча, validation, native Inspector, mini-map и save/reopen.
3. **D2.2b — battle action + return — первый проход выполнен в v1.82.** Terminal `talk → battle`, возврат на сохранённую позицию и отдельная outcome chain. Остались fade/retry и идемпотентная result transaction.
4. **D2.2c — result/reward/quest bridge.** Один проверяемый enemy/tag/count event и один reward transaction; после этого возвращаются combat-типы целей заданий.
5. **V1 Tile Scale — `voxelsPerBlock` и normalized builder.** Legacy 16 + new 32 в одной библиотеке, без изменения размеров карт.
6. **V1 Battle Voxel Kit.** Neutral/edge/wet/ember/frozen/blocker заменяют primitive meshes под прежними semantic ID.
7. **V1 World Surface pilot.** Одна маленькая sandbox-зона получает world-mode тех же Tile Kit/кистей и one-way migration; только после приёмки переносится `fan_town`.
8. **Biome kits и большие зоны.** Grass/dirt/stone/water/road/edge/corner/ramp + variants, затем отдельный Terrain3D gate при доказанной необходимости.

Каждый пункт проходит Inspector/viewport, preview, runtime, Undo/Redo, save/reopen и targeted test. Массовая конверсия всех карт до sandbox-gate запрещена.
