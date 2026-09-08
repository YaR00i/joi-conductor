# WD14 авто-тегирование локальных медиа

Система автоматически проставляет booru-теги (`1girl`, `standing`, `nude`, …) на
локально импортируемые изображения, чтобы фильтры тегов и квестовые кэши
работали на локальных файлах так же, как на Gelbooru-постах.

Используется модель **WD-V1-4 MoAT v2** (`SmilingWolf/wd-v1-4-moat-tagger-v2`, файл `model.onnx`) —
универсальный теггер с хорошим покрытием общего booru-контента. Старый URL
`…/wd-v1-4-moat-tagger.onnx` Hugging Face закрыл (HTTP 401).

## Архитектура (гибрид)

Приоритет бэкенда:

1. **Python-сервер** (`scripts/wd14_server.py`, порт `7878`) — рекомендуется.
   Точный, модель грузится один раз, GPU-friendly через onnxruntime.
   Запускается кнопкой «Запустить сервер» в панели локального источника
   (Roulette → Медиа → Локальные файлы). Первый старт сам создаёт venv и
   качает onnx в `%APPDATA%/joi-conductor/wd14/`.
2. **WASM-фолбэк** (onnxruntime-web в браузере) — *запланирован, но пока не
   подключён*. Каркас в `src/lib/wd14Tagger.ts` (`probeWasmBackend` /
   `tagViaWasm`) возвращает «not available», чтобы UI деградировал мягко, без
   крашей. Будет добавлен отдельным PR (требуется ~5 МБ wasm-рантайма + та же
   MoAT-модель в кеше IndexedDB).
3. **none** — теги остаются равными имени файла (текущее поведение до WD14).

## Установка Python-сервера

### Авто (из приложения)

В Roulette → Медиа → источник «Локальные файлы» нажми **«Запустить сервер»**.
Первый старт создаёт venv и качает MoAT onnx + `selected_tags.csv` в
`%APPDATA%/joi-conductor/wd14/` (~330 МБ). Прогресс виден в панели.
Процесс живёт до закрытия приложения. Кнопка «Проверить» пингует `/models`.

Ручной conda и файлы в `scripts/wd14-models/` по-прежнему работают, если уже
стоят — приложение сначала берёт app-venv и модели в userData.

### Запуск вручную (для проверки)

```bash
python scripts/wd14_server.py --port 7878
```

Открой `http://127.0.0.1:7878/models` — должно вернуть
`{"object":"list","data":[{"id":"wd14-moat",...}],"online":true}`.

Опционально: отдельный conda env `wd14` или `WD14_PYTHON` / `WD14_MODEL_DIR`.

## Настройки

В `MediaSettings` (хранится в `joi-conductor-media-settings`):

| поле              | дефолт                     | описание                                      |
| ----------------- | -------------------------- | --------------------------------------------- |
| `autoTagOnImport` | `true`                     | Тегировать при выборе файлов/папки            |
| `wd14Url`         | `http://127.0.0.1:7878`    | URL Python-сервера                            |
| `wd14Threshold`   | `0.35`                     | Порог уверенности для general-тегов (0.05–0.95) |

Переключатель «при импорте» и кнопки запуска находятся прямо в панели
локального источника.

## Что происходит с тегами

- `MediaItem.tags` становится space-separated строкой booru-тегов
  (`"1girl standing nude"`), как у Gelbooru-постов.
- `MediaItem.tagScores` хранит per-tag уверенность (для будущих оверлеев).
- `MediaItem.tagSource` = `"auto"` (теггер), `"filename"` (дефолт), `"manual"`.

После тегирования работают: `filterMediaByTags`, квестовые кэши
(`prefetchQuestMedia`), skip-wager-обучение — всё на локальных файлах.

## Troubleshooting

- **«сервер WD14 не запущен» / backend none** — Python не найден или сервер
  упал. Проверь статус кнопкой «Проверить»; `detail` покажет причину
  (модель не найдена, python env отсутствует). Первый «Запустить сервер»
  должен сам поставить venv + onnx.
- **«модель не найдена»** — веса ещё не скачались (сеть / диск). Повтори
  старт; готовые файлы лежат в `%APPDATA%/joi-conductor/wd14/models/`
  (`model.onnx` + `selected_tags.csv`). Старый путь `scripts/wd14-models/`
  тоже подхватывается, если там уже есть оба файла.
- **Медленно на CPU** — MoAT на CPU ~1–3 с на картинку. Поставь
  `onnxruntime-gpu` для GPU-инференса.
- **Тегов мало / много** — подними/опусти `wd14Threshold` (0.2 — больше тегов,
  0.5 — строже).
- **Видео/GIF** — теггер работает только со статичными кадрами; видео-файлы
  пропускаются (остаются с тегом из имени).

## Файлы

- `scripts/wd14_server.py` — FastAPI-сервер (MoAT + ONNX).
- `electron/wd14Process.mjs` — lifecycle (spawn/status/stop).
- `electron/wd14Install.mjs` — venv + скачивание onnx в userData.
- `electron/wd14Client.mjs` — HTTP-клиент к `POST /tag`.
- `src/lib/wd14Tagger.ts` — оркестратор гибрида (renderer).
- `src/lib/media.ts` — `MediaItem`/`MediaSettings` расширены, `mediaFromFilesWithBlobs`.
- `src/components/RouletteHubPanels.tsx` — UI-панель (`Wd14Panel`).
- IPC: `media:wd14-status`, `media:wd14-start`, `media:wd14-stop`, `media:wd14-tag`, `media:wd14-progress`
  (`electron/main.mjs` + `electron/preload.cjs` namespace `media`).
