# JOI Conductor — правила для AI-агентов

Этот файл обязателен для Codex, Cursor, Grok и любых других агентов, меняющих проект. Для Ember дополнительно читать `docs/EMBER_AI_HANDOFF.md`; продуктовый vision находится в `docs/EMBER_JRPG_DESIGN.md`. Оболочка приложения (сайдбар, хабы Прогресс / Контент / Мини-игры) — `docs/HUB.md`. `docs/EMBER_RESTRUCTURE_PLAN.md` не исполнять: Three-волны на паузе.

## Ember: Godot, не Three

С 29 августа 2026 года **Ember через Three.js приостановлен** (JOI play, `EmberThreeWorld`, World Editor viewport, crowd/atlas/свет в `src/game/three`). Не добавлять туда механики, реструктуризацию и второй renderer.

**Фокус** — sibling `../ember-godot` (Godot 4 Forward+) и **постепенная миграция**, которая уже идёт: карты после импорта — `.tscn`, voxel-модели по-прежнему пара `.json` + `.vox` в этом репо. План приёмки — `../ember-godot/MIGRATION_TEST_PLAN.md`. Новые продуктовые системы только в Godot. JOI остаётся владельцем пака и voxel-скульптора; вкладки «Аномалия» / «Ember Editor» — frozen shell, не дорожная карта.

Явная команда починить конкретный Three-баг имеет приоритет над этой паузой; не разворачивать её в новую фичу.

## Главный принцип

Дорабатывай существующий контракт, а не создавай параллельный. Перед новым типом, полем, helper, manager, renderer, collision/pathfinding-системой или UI-потоком сначала найди существующую реализацию через `rg` и её тесты.

- Нельзя копировать формулы между editor, preview и runtime. Общая математика живёт в чистом leaf-модуле и вызывается всеми потребителями.
- Новый модуль допустим, когда у него одна чёткая ответственность и он разгружает монолит. Новый файл не является оправданием второй системы.
- Не создавать `*Utils2`, `*ManagerNew`, `*ServiceV2`, временные compatibility-системы без плана удаления и ссылки на него.
- Не добавлять специальные ветки для конкретной карты, координаты, лестницы или id объекта, если поведение можно выразить данными и общим контрактом.

## Контроль размера

Legacy-монолиты: `styles.css`, `VoxelSculptPanel.tsx`, `MapEditorPanel.tsx`, `mapUtils.ts`, `SpriteEditorPanel.tsx`, `EmberThreeWorld.ts`, `TileEditorPanel.tsx`.

- Не добавляй в них новую самостоятельную подсистему. Сначала вынеси алгоритм/controller/hook в предметный модуль.
- Изменение монолита больше примерно 150 строк должно либо исправлять локальный дефект, либо уменьшать файл/ответственность в той же работе.
- Новый TS/TSX-файл: цель до 500 строк, мягкий предел 800. React-компонент: цель до 300 строк. Больший размер требует объяснения в handoff.
- Не дроби код механически на десятки файлов. Граница проходит по ответственности и ownership ресурсов, а не по числу строк.
- В `mapUtils.ts` не добавляй новый домен: создавай leaf-модуль и временно re-export через compatibility barrel согласно плану.
- `EmberThreeWorld` не наращивать: новые gameplay/render подсистемы идут в Godot, не в façade Three.

## Тесты механик Ember

Продуктовые механики проверять в **Godot** (`scenes/agent_sandbox.tscn`, headless GDScript в `ember-godot`). JOI `npm run ember-agent` / MCP `ember-agent` — сверка пака и legacy `exploreSim`, не замена Godot play. Не водить WASD в Chromium. Не использовать арену `hu_tao_p1` и двор `hu_tao_yard`. Деревню `hu_tao_village` не водить в браузере для проверки движка. Default stage пака — арена, его не менять.

## Crowd-навигация

Источник правды — baked height-surface grid (`enemyCrowdOpenField.ts`, `navigationSurfaceElevAtWorld`), а не плоские этажи и не спецмаршруты для отдельных лестниц. Подъём не выше `MAX_AUTO_STEP_VOXELS = 4`; игрок и враг видят одну физическую поверхность. Не сериализовать flow в JSON карты, не восстанавливать connector-chain / route hashing / «администраторский» коридор, не ставить локальный `scale: 1.04` вместо общего seam bleed `0.05`.

## JOI/Three на паузе

Не начинать волны из `docs/EMBER_RESTRUCTURE_PLAN.md` и не чинить Three «заодно». Документ — архив ownership, не backlog. Если пользователь явно просит узкий Three-hotfix: не rewrite, не V2 рядом со старым, не новые системы в `EmberThreeWorld`.

## Вертикальный контракт Ember

Изменение данных считается законченным только по цепочке: schema/types → normalization/validation → editor → preview → runtime → serialization → targeted tests → документация.

Новая механика Ember принимается в **Godot**: Inspector/viewport, Undo/Redo, save/reopen и ручной сценарий. Addons — реестр `../ember-godot/docs/EMBER_ADDONS.md` (версия, лицензия, support, owner данных, удаление); не заводить через addon второй gameplay/schema owner. JOI Three editor/play в эту цепочку больше не входят, пока пауза не снята.

- Координаты данных: X/Y — карта, Z — высота; Three.js: X/Z — земля, Y — вверх. Используй готовые преобразования.
- Height/collision/pathfinding игрока и AI должны опираться на одну физическую поверхность.
- Preview обязан совпадать с commit; тяжёлая операция фиксируется один раз на pointer-up/Enter, не на каждом move/input.
- Не меняй JSON-схему ради временного UI-состояния. Производные cache/flow/grid не сериализуются без versioning-решения.
- Не создавать третий renderer, отдельный Creative runtime или вторую реализацию в legacy Phaser.
- Воксельная библиотека — пара `content/ember/voxels/models/<id>.json` + `<id>.vox`. Сохранение только через `writeVoxelRegistry` с `dirtyIds`. Не дампить каталог в `registry.json`.

## Производительность и lifecycle

- Запрещены per-frame `scene.traverse`, массовые allocations в crowd loop, динамический rebuild всех shadow maps, полная remesh/reload мира на мелкий input.
- Каждый listener, observer, RAF, timer, object URL, worker и GPU-ресурс обязан иметь симметричную очистку.
- При извлечении controller/system сохраняй profiler labels и hot path; не заменяй прямой fixed-step вызов event bus-ом.
- Performance-правка принимается только с F3 до/после; crowd — F4/Shift+F4/F6/Shift+F6, XP в stress равен нулю.

## Рабочий процесс

1. Прочитать релевантные документы и `git status --short`; не перезаписывать чужие незавершённые изменения. Пользователь параллельно гоняет Grok / Voxel bro: они рисуют пропы и **открывают PR**, сами не мержат (см. `docs/EMBER_VOXEL_BOT.md`). Владелец раньше жал Merge в браузере; теперь это делает Cursor-агент через `gh pr merge` после «всё ок». Перед своим коммитом и пушем — `git fetch`; пуш только после rebase на `origin/main`, без force-push и без затирания `voxels/models` из открытых PR.
2. Найти существующий контракт, его потребителей и тесты. Объяснить, почему нужен новый модуль/поле.
3. Делать один ограниченный вертикальный срез. Не совмещать рефакторинг с новой механикой без необходимости.
4. Сначала targeted tests, затем `npm test`, `npx tsc --noEmit`, `npx vite build` / `npm run build`. Ошибка `tsc` — регрессия.
5. Визуальные изменения Ember — в Godot editor/play (`../ember-godot`). JOI-оболочку (хабы, контент) проверять в Electron. Для lifecycle JOI — несколько mount/unmount или Reload.
6. Обновлять `docs/EMBER_AI_HANDOFF.md` при изменении технического контракта Ember (в т.ч. Godot-миграции, которую зеркалят в `../ember-godot`). Оболочку JOI фиксировать в `docs/HUB.md`. Продуктовые решения — `docs/EMBER_JRPG_DESIGN.md`. `EMBER_RESTRUCTURE_PLAN.md` не вести как активный backlog.

### Коммуникация и authoring

- Пользователь не обязан знать технические названия Godot. Перед существенным контрактным решением кратко объяснять простыми словами: что увидит автор, что хранится в данных, что происходит в runtime и почему выбран этот вариант.
- Вместе с механикой проектировать её удобное создание и связывание в Godot. Предпочитать подписанные библиотеки, визуальные ссылки, диагностику и безопасные presets вместо требования вручную помнить ID/flags.
- До собственной подсистемы проверять штатные Godot nodes/resources/editor APIs и поддерживаемые addons. Готовый addon можно брать как UX-референс без установки; устанавливать только после проверки ownership в `../ember-godot/docs/EMBER_ADDONS.md`.

## Защищённые текущие работы

- Не менять клипы/геометрию крышки сундуков: они переделываются пользователем.
- Дверь в `(12,8)`, ранее отмеченная пользователем, расположена намеренно.
- Не возрождать персонажа auburn: закрытые PR #5 / #6 и их ветки сняты с origin; не открывать заново.
- Не применять `git reset`, `checkout --`, массовое удаление или форматирование всего репозитория.
- Не затирать волны Grok voxel-ботов: их PR в `main` — ожидаемый параллельный поток. Мержить эти PR только после явного «всё ок» / «можно мержить» (skill `merge-voxel-bot-prs`).
- Point-shadow atlas (§9.1) и весь Three play/свет заморожены вместе с паузой. Не расширять K и не чинить умбры новым bake в Three. Богатый ночной свет и механики — `ember-godot`, не второй renderer в этом репо.

Если запрос противоречит этому файлу, явная последняя команда пользователя имеет приоритет. Зафиксируй исключение в итоговом сообщении.
