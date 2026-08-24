# Ember — план стабилизации и реструктуризации

Актуально на 25 августа 2026 года. Этот план исполняется постепенно и не разрешает большой rewrite. Общие обязательные правила находятся в [`AGENTS.md`](../AGENTS.md), текущий технический контракт — в [`EMBER_AI_HANDOFF.md`](EMBER_AI_HANDOFF.md).

## 1. Зачем это делаем

Ember сейчас функционально стабилен, но несколько файлов объединяют слишком много ответственности. Размер сам по себе не является утечкой, однако React state, Three lifecycle, ввод, сохранение, сериализация и gameplay в одной области повышают риск stale closures, двойных listener'ов, неполного dispose и случайной полной перестройки мира.

Цель: оставить те же данные, поведение и визуальный результат, но сделать ownership состояния и ресурсов явным.

Не цели этого плана:

- не переписывать Ember с нуля;
- не менять JSON-схему ради декомпозиции;
- не создавать второй runtime/editor;
- не переносить всё в ECS;
- не дробить код механически по 100 строк;
- не смешивать реструктуризацию с Creative Mode или новой большой механикой.

## 2. Базовый срез

Срез перед началом миграции:

- `npm test`: 165 файлов, 949 тестов проходят;
- `npx vite build`: production bundle собирается;
- `npm run build` (`tsc --noEmit` + vite) проходит; прежние ошибки `ChatLlmSampling` в `createOllamaSoulClient` закрыты.
- initial JS: около 2.01 MB minified / 498 KB gzip;
- глобальный CSS: около 569 KB minified / 95.8 KB gzip;
- Ember editor tabs уже lazy-loaded;
- статический аудит главных модулей не показал дисбаланса `addEventListener/removeEventListener`, но это не заменяет mount/unmount smoke-test.

Крупные legacy-модули:

| Файл | Примерный размер | Риск |
| --- | ---: | --- |
| `src/styles.css` | 35k строк | глобальный cascade и весь CSS в initial load |
| `VoxelSculptPanel.tsx` | 8.4k | React + Three + input + history + disk lifecycle |
| `MapEditorPanel.tsx` | 8.2k | 7k строк в одном React-компоненте |
| `mapUtils.ts` | 6.9k, 118 exports | 64 потребителя, цикл с `mapLighting` |
| `SpriteEditorPanel.tsx` | 5.2k | документ, layers, frames, canvas и UI вместе |
| `EmberThreeWorld.ts` | 5.1k | render, input, crowd, combat, save и overlay в одном class |
| `TileEditorPanel.tsx` | 3.8k | похожий pixel lifecycle, много локального state |

## 3. Целевая форма

Используем **façade + strangler migration**:

1. Старый публичный entry point остаётся на месте.
2. Из него выносится одна ответственность в leaf-модуль/controller/hook.
3. Потребители переводятся постепенно.
4. Старый файл временно re-export/delegate, не содержит второй реализации.
5. После миграции всех потребителей compatibility-слой удаляется отдельной работой.

Для runtime hot path — прямые вызовы system methods и передаваемый `FrameContext`, а не глобальный event bus. Для editor — controller владеет ресурсами viewport, React hook владеет UI state, чистые command-функции владеют изменением данных.

## 4. Волна 0 — страховка

Статус: **следующая**.

### Работа

1. Добавить автоматическую проверку import cycles с baseline-allowlist. Новый цикл запрещён; первым Ember-циклом к удалению является `mapUtils ↔ mapLighting`.
2. Добавить legacy file-budget guard:
   - новые TS/TSX — предупреждение после 500 строк, ошибка после 800 без allowlist;
   - перечисленные legacy-монолиты не должны расти сверх baseline;
   - допустимо временное превышение только если та же работа уменьшает ответственность/размер после миграции.
3. Создать editor lifecycle smoke:
   - 20 раз открыть/закрыть Map/Voxel/Sprite/Tile editor;
   - после закрытия один или ноль ожидаемых canvas, без накопления ResizeObserver/listener/RAF;
   - object URL от reference/import освобождены.
4. Создать play lifecycle smoke:
   - несколько запусков/остановок `EmberThreeWorld`;
   - `destroy()` идемпотентен;
   - `renderer.info.memory` и число WebGL canvas возвращаются к baseline с учётом cache Three.js.
5. Зафиксировать F3 normal и crowd stress перед затрагиванием runtime.

### Выход из волны

- новые guard-тесты проходят локально;
- smoke выявляет ресурс по owner, а не просто общий счётчик;
- runtime/editor поведение не изменено;
- baseline записан в этот документ или отдельный измерительный лог.

## 5. Волна 1 — декомпозиция `mapUtils`

Статус: **после волны 0**. Это первый кодовый рефакторинг.

### Предлагаемые границы

- `mapHeight.ts`: height/elevation layers, surface elevation, vertical pad;
- `mapCollision.ts`: spans, physical AABB, occupancy, movement/jump;
- `mapNavigation.ts`: connector direction/bands, navigation surface, walkable sampling;
- `mapTeleport.ts`: target resolution и occupancy state;
- `mapRegions.ts`: region lookup/center/random point;
- `mapCoordinates.ts`: world/tile/canvas conversions;
- `mapLightConfig.ts`: defaults, normalization, resolved light/grade/atmosphere;
- `mapLightSources.ts`: authored/emissive source collection и LOS;
- `mapLighting.ts`: surface lighting без импорта `mapUtils`;
- `mapCanvasPaint.ts`: 2D editor/Phaser geometry и light passes;
- `mapFactory.ts`: создание пустой карты.

Имена уточняются по существующим модулям. Нельзя заводить дубликат, если предметный файл уже существует.

### Порядок

1. Составить список 118 exports и назначить каждому один owner.
2. Сначала вынести примитивы, которые нужны `mapLighting`, и удалить цикл.
3. Оставить `mapUtils.ts` как compatibility barrel без новой логики.
4. Переводить потребителей группами: tests → editor → Three runtime → agent/content.
5. После каждой группы запускать targeted tests; не менять формулы одновременно с переносом.
6. Удалять re-export только когда `rg` не находит потребителей старого пути.

### Выход из волны

- Ember import-cycle удалён;
- `mapUtils.ts` не содержит алгоритмов;
- 949+ тестов проходят;
- collision/lighting/editor snapshots не изменились;
- F3 normal/crowd не хуже baseline больше измерительного шума.

## 6. Волна 2 — CSS ownership

Статус: **после стабилизации map contracts**.

### Фаза A: безопасный разрез

Разнести `src/styles.css` в прежнем порядке правил:

- `styles/base.css`;
- `styles/app-shell.css`;
- `styles/session.css`;
- `styles/ember/editor-shell.css`;
- `styles/ember/map-editor.css`;
- `styles/ember/tile-editor.css`;
- `styles/ember/sprite-editor.css`;
- `styles/ember/voxel-editor.css`;
- `styles/responsive.css`.

`styles.css` временно остаётся только ordered-import entry. Не вводить cascade layers и не менять specificity в этой фазе.

### Фаза B: загрузка по вкладкам

После pixel/visual regression импортировать domain CSS из соответствующих lazy editor entry points. Общий shell остаётся initial. Следить за порядком HMR и отсутствием FOUC.

### Выход из волны

- визуальные скриншоты основных вкладок совпадают;
- CSS initial chunk заметно меньше;
- новый Ember selector имеет одного domain owner;
- нет дублирующихся поздних overrides без комментария причины.

## 7. Волна 3 — controllers редакторов

Статус: **после волн 0–2, по одному редактору**.

### Voxel

1. Вынести 2k+ строк Three effect в `VoxelStudioController` с одним `dispose()`.
2. Callback bridge передаёт команды наружу, controller не хранит React state.
3. History/session recovery/autosave вынести в `useVoxelDocumentHistory`.
4. Scene transform и selection остаются в чистых `voxelScene*` helpers.
5. JSX панели выносить только после стабилизации controller API.

### Map

1. `MapViewportController` владеет preview, gizmo, pick и overlays.
2. `useMapEditorCommands` создаёт один commit/undo для завершённой операции.
3. `useMapEditorSelection` владеет primary/multi/marquee/filter state.
4. `MapEditorPanel` остаётся orchestration и layout.

### Sprite и Tile

1. Общие bitmap/history/navigation операции собирать в `usePixelDocument`, используя уже созданные `pixel*` leaf-модули.
2. Не объединять tile face semantics и sprite layers/frames в одну универсальную модель.
3. Общий UI shell допустим; domain-команды остаются раздельными.

### Выход из каждого редактора

- главный component заметно уменьшился;
- viewport/controller имеет один owner и один cleanup;
- переключение вкладок проходит lifecycle smoke;
- undo/redo и save/reload дают тот же JSON;
- визуальная проверка всех режимов редактора выполнена.

## 8. Волна 4 — façade `EmberThreeWorld`

Статус: **последняя Ember-волна**. Crowd переносится последним.

Предлагаемый порядок извлечения:

1. `PlayInputController`: keys, pointer lock, cursor fallback, pause transitions;
2. `PlayOverlayController`: fade, debug/profiler DOM, HUD bridge;
3. `MapTransitionController`: arrival, reload, autosave reasons;
4. `CombatSystem`: weapons, projectiles, orbitals, gems;
5. `CrowdSystem`: spawn/AI/spatial/flow/avoidance только после отдельного benchmark gate;
6. `WorldEnvironment`: terrain/light/shadow/reflection — только если ownership можно отделить без дублирования renderer state.

`EmberThreeWorld` остаётся façade: создаёт системы, задаёт порядок frame phases и уничтожает их в обратном порядке. Не использовать mixin, наследование или event bus внутри fixed-step.

### Выход из волны

- frame profiler сохраняет прежние категории;
- порядок `world → combat → AI → terrain → camera → environment → render` зафиксирован тестом/кодом;
- 700-enemy F3 p95 и draw calls не хуже baseline;
- `destroy()` безопасен после частичной и полной инициализации;
- map reload не оставляет старые meshes/lights/actors.

## 9. Волна 5 — вторичные монолиты

Только после предыдущих волн:

- `content/types.ts` делить по устойчивым доменам с центральным public barrel;
- `App.tsx` — routing/shell отдельно от domain orchestration;
- `sessionRuntime.ts` — state machine, persistence и side effects раздельно.

Не начинать эту волну только ради уменьшения line count.

## 10. Правило работы агента над волной

Перед реализацией агент обязан написать в комментарии задачи:

1. какой owner меняется;
2. какие существующие функции будут переиспользованы;
3. какой compatibility path остаётся;
4. какие тесты доказывают отсутствие изменения поведения;
5. какой измеримый exit criterion закрывается.

Одна работа закрывает один seam. Если обнаружена новая архитектурная проблема, её добавить в этот план, а не исправлять параллельно без согласования.

## 11. Журнал

- 2026-08-25 — выполнен аудит; создан план и постоянные правила для агентов.
- Волна 0 — не начата.
- Волна 1 — не начата.
- Волна 2 — не начата.
- Волна 3 — не начата.
- Волна 4 — не начата.
- Волна 5 — не начата.
