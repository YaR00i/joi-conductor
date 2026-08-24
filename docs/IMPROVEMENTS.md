# План улучшений

Живой бэклог после волны 1. Ember **в работе**: контракт и ближайший план — `docs/EMBER_AI_HANDOFF.md` и `docs/EMBER_RESTRUCTURE_PLAN.md`, не эта пометка. Мини-игры не трогать, пока явно не скажешь иначе.

Источник: рабочий список «На улучшения» + сверка с кодом (август 2026).

---

## Волны

### Волна 1 — баги и полировка — **сделано**

- Избранное: фильтр тегов по всей IndexedDB, не по текущим 36; догрузка блобами по 36.
- Порядок стены: round-robin колонки слева направо, затем вниз (`savedAt` desc).
- Фильтры вида: Все / Картинки / Видео (gif = картинка).
- Капсула счётчика «Избранное» в боковом меню выровнена.
- Виброблоки: wand / vibe_bullet авто-экипируются, если выбраны в пуле (`initialEquippedFromAllowed`).
- Журнал контрактов в слот сохранения; перенесён в Статистику справа от графиков.
- Принятые контракты переживают суточный ролловер (`acceptedAtMs`, не expire, дедлайн продлевается).

### Волна 2 — доработка существующего — **сделано**

1. **Избранное · метки магазина** — **сделано** (галочка / ✗ → магазин, фокус тега в Shop).
2. **Настройки** — **сделано** (карточки как Ember editor; блок «Среда» со скачиванием Ollama / Piper / Qwen).
3. **Qwen3-TTS** — **сделано** (CustomVoice / Base / Tokenizer-12Hz; 9 голосов; Electron-скачивание). Serve: qwen-tts (Windows) / vLLM (если есть).
4. **Сессия** — **сделано** (очередь: двигать / убрать / вставить паузу; BeatBar показывает «далее»).
5. **Контракты** — **сделано** (`briefRu` на карточках; Hypnotube / JOI-сайты; богаче текст faproulette).
6. **Магазин** — **сделано** (премиум скрывает купленное, сорт по цене, бейдж = сколько ещё купить).
7. **Дейлики** — **сделано** (на доске дня всегда одна привычка: зарядка / клетка / пробка).

### Волна 2.1 — среды ИИ качаются сами — **сделано**

Ориентир UX: [Soul of Waifu](https://github.com/jofizcd/Soul-of-Waifu) — «скачал релиз → installer.bat → модели из хаба», без ручного conda/pip. Мы не копируем их продукт (чат/RPG/агент на рабочем столе), только принцип: **кнопка в «ИИ ресурсы» ставит runtime + веса**.

| Среда | Сейчас | Как в SoW | Что сделать у нас |
| --- | --- | --- | --- |
| **Ollama (Local LLM)** | CLI zip качается при старте / pull модели (~1 ГБ), если нет системного Ollama | Models Hub: поиск HF, GGUF, llama.cpp CUDA/HIP/Vulkan + 10 облачных провайдеров | **Сделано (zip).** Дальше по желанию: облачный OpenAI-compat (OpenRouter) как запас без GPU; GGUF/llama.cpp не дублировать, пока хватает Ollama |
| **Piper** | Бинарь + Irina сами | Нет прямого аналога (у них Silero / Kokoro / XTTS) | **Сделано.** Оставить как офлайн-RU fallback |
| **Qwen3-TTS** | venv + `huggingface_hub` + **qwen-tts** (локальный `/v1/audio/speech` без vLLM). vLLM — опция на Linux | Qwen3 TTS local: 0.6B **и 1.7B**, клон 3 с | **Сделано (0.6B + qwen-tts).** 1.7B — опция «качество» |
| **GPT-SoVITS** | Кнопка в «ИИ ресурсы»: клон + venv + pretrained в userData. Отдельный реф 4–10 с (`sovits-ref.wav`), не клип Qwen | Клона нет; клон через Qwen Base | **Сделано.** Ручной `~/Projects/GPT-SoVITS` по-прежнему находится, если есть |
| **WD14 теггер** | Первый «Запустить сервер» ставит venv + onnx ~440 МБ в userData | Нет | **Сделано** |
| **Edge / Windows TTS** | Без среды | EdgeTTS + ElevenLabs | **Ок.** ElevenLabs не тащим (ключ, цензура, не локально) |
| **STT / звонок** | Нет | Faster Whisper + Silero VAD, full-duplex, перебивание | Волна 3 (чат/«как звонок»). Пакет: `faster-whisper` в отдельном venv, не в Qwen |
| **Silero TTS** | Нет | Быстрый русский local | Имеет смысл как RU-движок легче Piper+Irina и без SoVITS-EN. Кандидат в Голос после Qwen-Windows |
| **XTTS / Kokoro / RVC** | Нет | Есть | Не в приоритете: SoVITS уже клон; RVC — отдельный ад |
| **Картинки нейросетью** | Gelbooru + WD14, генерации нет | A1111 / Comfy / NovelAI / DALL-E / FLUX | Волна 3 «селфи вайфу», не среда сессии. Не смешивать с TTS/LLM |
| **Память персонажа** | LLM пишет реплики блока сессии, без дневника | Soul Memory: психология / отношения / эпизоды / дневник | Волна 3 чат. Для сессии достаточно bible + короткого контекста очереди |
| **Live2D / VRM / lip-sync** | Ember / Phase 3 в спеке | 28 эмоций, Live2D, VRM | Ember **не трогаем**. VRM — V2_SPEC Phase 3, отдельно |

Не берём из SoW (другой жанр): Soul Companion (мышь/клава/скрин), Soul Stage (настолка), Discord-бот, MCP-плагины, lorebooks как у Tavern.

Отложено из этой волны: Silero TTS — кандидат в Голос позже, не блокер 2.1.

### Волна 3 — новые системы

- **3.0 CBT / plapping · проверка ударов** — **готово.** Переключатель Честь (метроном считает акценты) / Микрофон (Keuwlsoft-стиль: порог, гистерезис, пауза; тихий удар не считается). Док в сессии + Настройки → Геймплей.
- **3.1 Чат + Soul Memory** — **в работе.** Свободный чат (не очередь сессии). Память как в Soul of Waifu: MEMORY.md / USER.md / темы / дневник, роутер после пачки реплик. Селфи и Whisper — позже.
- HotScreen (цензор медиа на сцене сессии) — после 3.1.

### Парковка (не трогать, пока не скажешь)

- Мини-игры, в том числе «играть с вайфу в мини-играх». Ember не в парковке: см. `docs/EMBER_AI_HANDOFF.md`.

---

## Заметки по Qwen3-TTS (0.6B)

Все веса опираются на акустический кодек **Tokenizer-12Hz** — его надо скачать вместе с моделью.

| Роль | Hugging Face id | Зачем |
| --- | --- | --- |
| Tokenizer | `Qwen/Qwen3-TTS-Tokenizer-12Hz` | Кодек, обязателен для CustomVoice и Base |
| CustomVoice | `Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice` | 9 пресет-голосов, прод, **без** клона 3 сек |
| Base | `Qwen/Qwen3-TTS-12Hz-0.6B-Base` | Клон / fine-tune с ~3 сек рефа — это то, что нужно для голоса госпожи |

Голоса CustomVoice: Vivian, Serena, Uncle_Fu, Dylan, Eric, Ryan, Aiden, Ono_Anna, Sohee.

Старый id `Qwen/Qwen3-TTS-0.6B` и голоса Cherry / Ethan / Chelsie — это не эта линейка; мигрируем на CustomVoice + Serena.

Скачивание: Electron → `%APPDATA%/joi-conductor/qwen-tts/` (venv + веса) через `huggingface_hub`. Сервер: **qwen-tts** (`scripts/qwen_tts_server.py`, OpenAI `/v1/audio/speech`). vLLM — если пакет есть (Linux). Клон Base: `ref_audio` из wav госпожи.

---

## Ключевые файлы

- Избранное: `src/pages/FavoritesPage.tsx`, `src/lib/mediaFavorites.ts`, `src/lib/contentUnlocks.ts` (`tagPurchaseStatus`)
- Магазин: `src/pages/ShopPage.tsx`, `src/lib/shopFocus.ts`, `src/lib/wallet.ts`
- Настройки / ИИ ресурсы: `src/pages/SettingsPage.tsx`, `src/components/BrainPanel.tsx`, `src/components/TtsSettingsPanel.tsx`
- Ollama: `electron/ollama.mjs`, `electron/ollamaInstall.mjs`, `electron/ollamaRuntime.mjs`
- Qwen: `src/lib/qwenTtsCatalog.ts`, `electron/qwen.mjs`, `electron/qwenInstall.mjs`, `electron/qwenEnv.mjs`, `electron/qwenProcess.mjs`, `scripts/qwen_tts_server.py`
- SoVITS: `electron/sovitsProcess.mjs`, `docs/GPT_SOVITS_SETUP.md`
- WD14: `electron/wd14Process.mjs`, `electron/wd14Install.mjs`, `docs/WD14_TAGGER.md`
- Сессия: `src/pages/SessionPage.tsx`, `src/components/SessionQueuePanel.tsx`, `src/lib/queueEdit.ts`, `src/lib/sessionRuntime.ts`, `src/components/BeatBar.tsx`
- Чат / Soul Memory: `src/pages/ChatPage.tsx`, `src/lib/soul/`
- Контракты: `src/lib/contracts/catalog.ts`, `src/lib/contracts/dailyBoard.ts`
- Дейлики: `HABIT_CONTRACT_IDS` в `catalog.ts`; `listOpenContractsToday` в `src/lib/dailyBrief.ts`
