# Ember Voxel Bot — инструкция для Grok

Документ для бота, который **рисует воксельные пропы** под Ember (игра + редактор в репозитории `YaR00i/joi-conductor`). Не для правок движка, камеры, боя или Creative Mode. Корневой [`AGENTS.md`](../AGENTS.md) обязателен и имеет приоритет для правил работы с репозиторием.

Для Cursor / движкового агента: боты только открывают PR, сами не мержат. Владелец не должен ходить в GitHub UI: после «всё ок» смержить готовые env/kit через `gh pr merge` (skill `merge-voxel-bot-prs`). Перед своим пушем — fetch + rebase; не force-push и не перезаписывать `voxels/models` из открытых PR.

Актуально на 25 августа 2026. Если этот файл расходится с `docs/EMBER_AI_HANDOFF.md` по путям контента — сначала этот файл: он про пайплайн ассетов.

---

## 0. Вставить в системный промпт бота

```text
Ты — Voxel bro: художник воксельных пропов для Ember (JOI Conductor).
Репозиторий: https://github.com/YaR00i/joi-conductor

Сначала прочитай AGENTS.md и docs/EMBER_VOXEL_BOT.md целиком. Потом, только если нужно:
docs/EMBER_AI_HANDOFF.md §3–4, scripts/gen-ember-village.mjs,
content/ember/voxels/models/vox_vil_lamp.json, vox_vil_crate.json, vox_vil_bush.json.

Роль: новые модели в content/ember/voxels/models/<id>.json (+ опционально <id>.vox).
Не инженер движка. Не трогай src/game/three, Phaser, свет runtime, карты целиком,
content/ember/voxels/registry.json, git reset/checkout.
Не создавай новый manager/helper/schema/registry/генератор, если существующий скрипт и формат
покрывают задачу. Сначала доработай scripts/gen-ember-village.mjs или ближайший готовый шаблон.
Один новый файл модели — один законченный asset, а не новая инфраструктура.

Стиль: фэнтези JRPG / Zelda overworld, читается с камеры чуть сверху-сбоку (~45–60°).
Силуэт толстый, 6–10 цветов, детали < 2 вокселей не делать.
Визуальный референс для ПРОСМОТРА (не импорт): https://sketchfab.com/tags/magicavoxel
Не копируй чужие модели. Не тащи Sketchfab glTF/OBJ в Ember.

Одна волна = 6–8 новых id скриптом по образцу gen-ember-village.mjs.
Не пиши массив voxels руками в чат. Не раскладывай пропы по карте, пока не попросили.
После волны: ветка + PR в main. Не мержи PR — это сделает Cursor-агент владельца, когда он скажет «всё ок».
```

---

## 1. Что такое Ember (достаточно боту)

Ember — кубичный/воксельный мир внутри Electron-приложения. Explore-карты смотрят **сбоку-сверху**, как 3D-Zelda / JRPG, не чистый top-down и не Minecraft от первого лица.

Проп ставится на клетку карты как prefab: форма + палитра + коллизия + опциональный свет. Игра и редактор читают одно и то же.

Типичный проп: **1×1 блок** земли (16×16 вокселей по X/Z), высота 8–32 вокселя.

---

## 2. Куда писать файлы

Один объект = одна пара в `content/ember/voxels/models/`:

| Файл | Что внутри |
| --- | --- |
| `<id>.json` | Prefab: `id`, `nameRu`, `tags`, коллизия, свет, extra channels. Сетка может быть в `model.voxels` (ещё читается) или вынесена в `.vox`. |
| `<id>.vox` | MagicaVoxel: форма + палитра. Ember подхватывает, если JSON указывает `mesh.file` и occupancy в JSON пустая. |

Правильный JSON-конверт:

```json
{
  "id": "vox_fan_well",
  "nameRu": "Колодец",
  "tags": ["fantasy", "outdoor"],
  "mesh": { "kind": "vox", "file": "voxels/models/vox_fan_well.vox" },
  "model": {
    "id": "vox_fan_well",
    "nameRu": "Колодец",
    "sizeBlocks": { "x": 1, "y": 1, "z": 1 },
    "heightVoxels": 16,
    "palette": ["", "#5a4a40", "#8a7a68"],
    "voxels": [],
    "physical": true,
    "material": "stone"
  }
}
```

Пока генератор пишет только JSON (как `scripts/gen-ember-village.mjs`) — **можно оставить сетку в `model.voxels`**. Редактор это загрузит. Не обязательно сразу делать `.vox`.

**Не создавать** каталоги-монолиты:

- `content/ember/voxels/registry.json`
- `content/ember/voxels/village.json`
- `content/ember/voxels/fantasy.json`

`loadEmberPack` сам читает все `voxels/models/*.json`. Новый файл с уникальным `id` появляется в библиотеке без правок `loadPack.ts`.

Префиксы id (поиск в лотке библиотеки понимает их даже без тегов):

- `vox_vil_*` — деревня
- `vox_fan_*` — фэнтези / Zelda-overworld
- не занимать существующие `vox_vil_*` и случайные `vox_mr*` / `vox_ms*`

---

## 3. Оси и сетка (сломать легко)

**Модель Ember (то, что в JSON):**

- X / Z — земля
- Y — вверх
- упаковка: `index = x + z * sx + y * sx * sz`
- 1 блок карты = **16³** вокселей (`VOXELS_PER_BLOCK`)
- `sizeBlocks` — целые блоки, каждый 1…8
- `heightVoxels` — высота сетки, 1…128; X/Z всё равно кратны 16

**MagicaVoxel `.vox`:**

- X / Y — земля, **Z вверх**
- перевод: `ember(x, y, z) = vox(x, z, y)`
- кодек: `src/game/voxel/vox/voxFile.ts`, `src/game/voxel/emberVoxCodec.ts`

`palette[0]` всегда `""` (воздух). Индексы 1…255 — `#rrggbb`. На проп обычно **6–10 цветов**.

`physical: true` (или omit) — твёрдый. `false` — сквозь (трава, мелкий декор, навес).

Фонарь / костёр / алтарь с огнём:

- клетки огня в `emissive[]` (0…255, та же упаковка)
- `emissiveCastsLight: true` только если нужен настоящий PointLight
- не вешать cube-тени на каждый куст; у деревенского фонаря свет часто выключен (`emissiveCastsLight: false`), светит уличная лампа карты

---

## 4. Как должна выглядеть модель

Камера explore: орбита **чуть сверху-сбоку**. Модель обязана читаться:

1. силуэтом с 45–60° (крыша, козырёк, обод колодца, шляпка гриба);
2. сбоку (ствол, ножки лавки, столб указателя) — тонкая «проволока» в 1 воксель пропадёт;
3. без шума «песок из пикселей»: крупные пятна цвета, 2–3 тона на материал.

Типичные размеры первой волны:

- 1×1 блок, высота 8–20 вокселей: ящик, куст, камень, пень, трава
- 1×1, высота 24–32: фонарь, указатель, факел
- 2×1 только если объект реально широкий (навес, прилавок)

Не делать в первой волне дом 3×3 и дерево 2×2 — это отдельная сцена из нескольких пропов.

### Персонажи — не пропы

Если задача — персонаж, а не проп двора: читай `docs/EMBER_CHARACTER_STYLE.md` и кадр `docs/refs/dungeon-slasher-character.png`.
Тот же скелет `chibi_32` / `chibi_25d`, стиль `slasher`. Не мешать с `vox_vil_*` / `vox_fan_*`. Слоты скелета не менять.

---

## 5. Куда смотреть (референс, не импорт)

### Свои пропы в репо

Открыть в редакторе или просмотреть JSON:

| id | зачем смотреть |
| --- | --- |
| `vox_vil_lamp` | вертикальный силуэт, мало цветов, огонь как пятно |
| `vox_vil_crate` | ящик 1×1, читаемые доски |
| `vox_vil_barrel` | цилиндр из боксов, не «идеальная сфера» |
| `vox_vil_bench` | пустое под сиденьем, ножки толстые |
| `vox_vil_bush` | комок листвы + 1 акцент |
| `vox_vil_fence` | повтор штакетин, дырки между ними |
| `vox_vil_sign` | табличка смотрит в сторону, не в камеру top-down |

Образец генерации: `scripts/gen-ember-village.mjs` (`emptyGrid` / `setV` / `box` / `finishModel` / запись в `voxels/models/<id>.json`).

### Sketchfab — галерея MagicaVoxel

Смотреть орбитой, как игрок в Ember:

- тег: [sketchfab.com/tags/magicavoxel](https://sketchfab.com/tags/magicavoxel)
- сортировка по лайкам: [search `tag:magicavoxel`](https://sketchfab.com/search?type=models&sort_by=-likeCount&q=tag:magicavoxel)

Что снимать глазом с хороших работ:

- ограниченная палитра;
- крупные массы (крыша, ствол, камень), не кружево в 1 воксель;
- козырьки и карнизы, которые держат форму сбоку;
- props масштаба «поставить на клетку», не целый город в одном меше.

**Запрещено:** скачивать Sketchfab glTF/USDZ/OBJ и пихать в Ember. Это уже полигоны, скульптор их не красит. Не копировать конкретную модель 1:1 (чужая лицензия + чужой стиль). С тега берём **язык формы**, не файлы.

Если у работы есть исходник `.vox` и лицензия позволяет — MagicaVoxel-файл можно импортировать в скульптор Ember (**Импорт .vox**). glTF с той же страницы — нет.

Другие безопасные взгляды: свои `vox_vil_*` в Three-превью редактора; MagicaVoxel на диске, если пользователь открыл sibling `.vox`.

---

## 6. Как генерировать (обязательный способ)

1. Новый скрипт `scripts/gen-ember-fantasy-props.mjs` **по паттерну** `gen-ember-village.mjs`.
2. Хелперы: `emptyGrid(sx, sy, sz)`, `setV`, `box`, `finishModel`.
3. Для каждой модели — `writeFile` в `content/ember/voxels/models/<id>.json` в конверте `{ id, nameRu, tags, model }`.
4. Не печатать тысячи нулей в чат.
5. Не править существующие `vox_vil_*.json`, карты, тайлы, `src/**`, кроме случая «подключить файл» — **подключать не нужно**.
6. После скрипта: `node scripts/gen-ember-fantasy-props.mjs`.
7. В отчёте: список id, куда смотреть (Ember Editor → карта → библиотека → Воксели → поиск `fan` или тег `fantasy`), что должно быть видно с орбиты.

Теги на модели: lowercase через дефис, например `fantasy`, `outdoor`, `light`. Поиск в лотке идёт по id, `nameRu` и тегам.

---

## 7. Чего не делать

- Не `git reset` / `checkout` / force push.
- Не затирать и не «чистить» `registry.json`.
- Не писать glTF, OBJ, PNG-атласы, Minecraft schematic как правду Ember.
- Не тащить Sketchfab-меш в `content/ember`.
- Не менять Three/Phaser, камеру play, шейдеры, физику.
- Не раскладывать пропы по `maps/*.json` в той же задаче, что генерация библиотеки.
- Не делать 30 моделей за раз. Волна = 6–8.
- Не чинить «весь пак сразу», если одна модель каша: переделывать один id.

---

## 8. Волны работы

**Волна 1 — библиотека (сделано).** `scripts/gen-ember-fantasy-props.mjs`

`vox_fan_signpost`, `vox_fan_well`, `vox_fan_torch`, `vox_fan_crate_old`,
`vox_fan_rock`, `vox_fan_grass` (`physical: false`), `vox_fan_shrine`,
`vox_fan_tree_stump`.

**Env2 — путь / лес / вода / пещера (сделано).** `scripts/gen-ember-fantasy-env2.mjs`

`vox_fan_lantern_stone`, `vox_fan_cart` (2×1), `vox_fan_gate_post`, `vox_fan_log`,
`vox_fan_reeds` (`physical: false`, tag `water`), `vox_fan_stalagmite` (tag `cave`),
`vox_fan_campfire`, `vox_fan_mushrooms`.

**Env3 — двор / улица деревни (следующая библиотека).** Новый скрипт
`scripts/gen-ember-fantasy-env3.mjs`. Не перегенерировать Wave 1 / env2.
Не копировать `vox_vil_*`. Расстановка на карту — отдельная задача.

1. `vox_fan_barrel` — бочка, обручи, клёпки; не идеальный цилиндр
2. `vox_fan_bench` — лавка, толстые ножки, пустота под сиденьем
3. `vox_fan_fence` — сегмент забора 1×1, столбы + перекладины, дырки между
4. `vox_fan_hay` — стог / тюк сена, перевязан, массивный
5. `vox_fan_bucket` — деревянное ведро + верёвка
6. `vox_fan_flowers` — клумба (`physical: false`), 2–3 цвета цветков
7. `vox_fan_notice_board` — доска объявлений, два столба, бумажки
8. `vox_fan_lantern_paper` — бумажный фонарь на шесте; emissive, без cube-теней, tag `light`

Теги: `fantasy` + `outdoor` на всех. Extra: `light` на фонаре.

**Расстановка на `hu_tao_village`** — отдельная задача после env3.

**Env11 — рынок / площадь (сделано).** `scripts/gen-ember-fantasy-env11.mjs`

`vox_fan_stall` (2×1, striped awning), `vox_fan_produce`, `vox_fan_fountain` (tag `water`),
`vox_fan_statue`, `vox_fan_hitch`, `vox_fan_laundry` (`physical: false`),
`vox_fan_crate_stack`, `vox_fan_flowerbox` (`physical: false`).
Теги: `fantasy`, `outdoor`, `town`, `market`.

**Env13 — входы зданий / городской kit (сделано).** `scripts/gen-ember-fantasy-env13.mjs`

`vox_fan_door` (~24h, 1×1), `vox_fan_window` (elev 1, tag `light`, без cube-теней),
`vox_fan_shop_front` (2×1, shallow facade), `vox_fan_awning_stripe` (2×1, `physical: false`),
`vox_fan_chimney`, `vox_fan_porch`, `vox_fan_mail_box`, `vox_fan_banner` (`physical: false`).
Теги: `fantasy`, `outdoor`, `town`, `building`. Дверь — только меш; `kind:door` вешается на карте.

**Карты `fan_town*`.** JRPG-городок `content/ember/maps/fan_town.json` + интерьеры `fan_town_inn` / `fan_town_smith` / `fan_town_mage` / `fan_town_house`. Входы: `vox_fan_door` + `vox_fan_porch` (регионы `*_enter` на крыльце). Kit2 display goods на `fan_town_smith` / `fan_town_inn` (не дублируют `weapon_rack` / `armor_stand`). Не править `hu_tao_*`.

**Крупные вещи** (мельница, лодка, мост) — несколько пропов или voxel scene, не один гигантский массив.

---

## 9. Промпт на первую задачу (вставить пользователю)

```text
Прочитай docs/EMBER_VOXEL_BOT.md.

Сделай волну 1: скрипт scripts/gen-ember-fantasy-props.mjs по образцу
scripts/gen-ember-village.mjs. Запиши 8 моделей vox_fan_* в
content/ember/voxels/models/<id>.json. Не трогай registry.json, карты и src.

Перед боксами открой https://sketchfab.com/tags/magicavoxel и держи в голове
2–3 работы с толстым силуэтом (колодец / ящик / факел / камень). Не копируй их.

Стиль: Kokiri / Hateno / Clock Town, камера 45–60°. Запусти скрипт. В конце —
список id и что я должен увидеть в библиотеке редактора.
```

---

## 10. Как понять, что бот не наврал

- появились файлы `content/ember/voxels/models/vox_fan_*.json` с уникальными id;
- `registry.json` не схлопнулся и не раздулся на весь каталог;
- git diff не содержит `src/game/three` и карт, если их не просили;
- в редакторе проп ставится на землю, читается с орбиты, не «иголка» и не шум.

Движковые правки и Creative Mode этому боту не отдавать — это другой чат / `EMBER_AI_HANDOFF.md`.

---

## 11. Промпт на env3 (двор / улица)

```text
Fantasy environment prop library only. No map placement, no registry.json, no src/** changes.
Wave 1 and env2 files are unchanged by the env3 generator.

Read docs/EMBER_VOXEL_BOT.md. Wave 1 = scripts/gen-ember-fantasy-props.mjs.
Env2 = scripts/gen-ember-fantasy-env2.mjs. Do not rewrite those scripts or their vox_fan_* outputs.

Env3 — village yard / street
Script scripts/gen-ember-fantasy-env3.mjs (same emptyGrid / setV / box / finishModel pattern)
writes eight new ids. MagicaVoxel form language: thick masses, 6–10 colors, readable at 45–60°.
Does not copy vox_vil_* test assets.

id	What it is	Notes
vox_fan_barrel	Barrel	Staves + iron hoops; not a perfect cylinder
vox_fan_bench	Bench	Thick legs, open gap under the seat
vox_fan_fence	Fence segment	1×1; posts + rails with holes between
vox_fan_hay	Hay bale	Tied rectangular mass
vox_fan_bucket	Wooden bucket	Staves, rope, optional water disc
vox_fan_flowers	Flower patch	physical: false; thick clumps, 2–3 flower colors
vox_fan_notice_board	Notice board	Two posts, papers, nails
vox_fan_lantern_paper	Paper lantern on a pole	Small emissive, no cube shadows

Tags: fantasy + outdoor on all. Extra: light on lantern_paper.
Prefix vox_fan_* is already inferred as fantasy in library search.

How to review / test
node scripts/gen-ember-fantasy-env3.mjs — regenerates the eight env3 files only.
Ember Editor → map → library → Воксели → search fan, or tags fantasy / outdoor / light.
Place each prop and orbit 45–60°. Expect thick silhouettes. Flowers are walk-through.
Lantern glows without cube shadows.

Intentionally not in this PR: placing props on hu_tao_village, or large multi-prop scenes.
```
