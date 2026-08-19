# WD14 авто-тегирование локальных медиа

Система автоматически проставляет booru-теги (`1girl`, `standing`, `nude`, …) на
локально импортируемые изображения, чтобы фильтры тегов и квестовые кэши
работали на локальных файлах так же, как на Gelbooru-постах.

Используется модель **WD-V1-4 MoAT** (SmilingWolf/wd-v1-4-moat-tagger) —
универсальный теггер с хорошим покрытием общего booru-контента.

## Архитектура (гибрид)

Приоритет бэкенда:

1. **Python-сервер** (`scripts/wd14_server.py`, порт `7878`) — рекомендуется.
   Точный, модель грузится один раз, GPU-friendly через onnxruntime.
   Запускается кнопкой «Запустить сервер» в панели локального источника
   (Roulette → Медиа → Локальные файлы).
2. **WASM-фолбэк** (onnxruntime-web в браузере) — *запланирован, но пока не
   подключён*. Каркас в `src/lib/wd14Tagger.ts` (`probeWasmBackend` /
   `tagViaWasm`) возвращает «not available», чтобы UI деградировал мягко, без
   крашей. Будет добавлен отдельным PR (требуется ~5 МБ wasm-рантайма + та же
   MoAT-модель в кеше IndexedDB).
3. **none** — теги остаются равными имени файла (текущее поведение до WD14).

## Установка Python-сервера

### 1. Модель

Скачать два файла из
[`SmilingWolf/wd-v1-4-moat-tagger`](https://huggingface.co/SmilingWolf/wd-v1-4-moat-tagger)
и положить в `scripts/wd14-models/`:

```
scripts/wd14-models/
├── model.onnx            ← переименуй wd-v1-4-moat-tagger.onnx
└── selected_tags.csv
```

Размер модели ~440 МБ. Альтернативно можно оставить оригинальное имя
`wd-v1-4-moat-tagger.onnx` — сервер найдёт его как alias.

### 2. Python-зависимости

Рекомендуется отдельный conda env `wd14` (его и ищет `electron/wd14Process.mjs`):

```bash
conda create -n wd14 python=3.11 -y
conda activate wd14
pip install fastapi uvicorn python-multipart onnxruntime numpy pillow
# для GPU:
# pip install onnxruntime-gpu
```

Либо системный Python + те же пакеты. Скрипт также ищет `python` в PATH и
env-переменную `WD14_PYTHON` (полный путь до python.exe).

### 3. Запуск вручную (для проверки)

```bash
python scripts/wd14_server.py --port 7878
```

Открой `http://127.0.0.1:7878/models` — должно вернуть
`{"object":"list","data":[{"id":"wd14-moat",...}],"online":true}`.

### 4. Запуск из приложения

В Roulette → Медиа → источник «Локальные файлы» нажми **«Запустить сервер»**.
Electron сам поднимет процесс (`scripts/wd14_server.py` через найденный
python.exe) и будет держать его до закрытия приложения. Кнопка «Проверить»
пингует `/models` и обновляет статус.

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
  (модель не найдена, python env отсутствует).
- **«модель не найдена: scripts/wd14-models»** — положи `model.onnx` и
  `selected_tags.csv` (см. шаг 1).
- **Медленно на CPU** — MoAT на CPU ~1–3 с на картинку. Поставь
  `onnxruntime-gpu` для GPU-инференса.
- **Тегов мало / много** — подними/опусти `wd14Threshold` (0.2 — больше тегов,
  0.5 — строже).
- **Видео/GIF** — теггер работает только со статичными кадрами; видео-файлы
  пропускаются (остаются с тегом из имени).

## Файлы

- `scripts/wd14_server.py` — FastAPI-сервер (MoAT + ONNX).
- `electron/wd14Process.mjs` — lifecycle (spawn/status/stop), клон sovitsProcess.
- `electron/wd14Client.mjs` — HTTP-клиент к `POST /tag`.
- `src/lib/wd14Tagger.ts` — оркестратор гибрида (renderer).
- `src/lib/media.ts` — `MediaItem`/`MediaSettings` расширены, `mediaFromFilesWithBlobs`.
- `src/components/RouletteHubPanels.tsx` — UI-панель (`Wd14Panel`).
- IPC: `media:wd14-status`, `media:wd14-start`, `media:wd14-stop`, `media:wd14-tag`
  (`electron/main.mjs` + `electron/preload.cjs` namespace `media`).
