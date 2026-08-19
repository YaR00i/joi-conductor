# GPT-SoVITS + Ху Тао (катсцены)

Стек: **GPT-SoVITS api_v2** на `127.0.0.1:9880` → JOI Conductor (провайдер `sovits`).  
GPU: RTX 5070 12 GB — нормально для инференса.

## 1. Установка GPT-SoVITS

```powershell
cd $env:USERPROFILE\Projects
git clone https://github.com/RVC-Boss/GPT-SoVITS.git
cd GPT-SoVITS
```

Дальше по их README (conda/venv + CUDA torch). Кратко:

- Python 3.10/3.11  
- PyTorch с CUDA под твою карту  
- Скачать pretrained weights (кнопки в WebUI / скрипты репо)

Запуск API:

```powershell
cd $env:USERPROFILE\Projects\GPT-SoVITS
python api_v2.py -a 127.0.0.1 -p 9880
```

Проверка: в приложении Today → Озвучка → **Проверить SoVITS** → «онлайн».

## 2. Голос из катсцен игры

Нужен **чистый кусок речи актрисы 5–15 секунд**: без музыки, без чужих реплик, без сильного ревеба.

### Вырезать аудио из ролика

Положи катсцену, например `cutscene.mp4`, и:

```powershell
# весь звук дорожки
ffmpeg -i cutscene.mp4 -vn -ac 1 -ar 40000 voice-raw.wav

# или кусок с 12.5с длиной 8с
ffmpeg -ss 00:00:12.5 -i cutscene.mp4 -t 8 -vn -ac 1 -ar 40000 voice-raw.wav
```

Дочисти в Audacity (или аналог): вырежи тишину/музыку, нормализуй громкость, экспорт **WAV mono**.

Сохрани как:

```
joi-conductor/voice-refs/hu-tao/ref.wav
```

В настройках укажи **дословный текст** этой фразы.

Важно: pretrained **GPT-SoVITS v2 не поддерживает русский** (`ru`). Языки: en / zh / ja / ko / yue / auto.

Рекомендация для Ху Тао:

- EN VO (как `VO_Hu_Tao_Hello`) → `prompt_lang=en`, `text_lang=en`, реплики на английском  
- CN клип → `zh` (+ `en` text при кросс-лингва)  
- Русский текст сессии → Piper / Edge, не SoVITS

## 3. Настройки в JOI Conductor

1. В Electron (`Запуск.bat`) можно **не** держать отдельный терминал:  
   галочка **Автозапуск GPT-SoVITS** или кнопка **Запустить голос**  
2. Today → Озвучка → движок **GPT-SoVITS**  
3. URL `http://127.0.0.1:9880`  
4. Путь `voice-refs/hu-tao/ref.wav`  
5. Текст референса · языки **en / en**  
6. Пробы эмоций → сессия  

При закрытии приложения гасятся SoVITS (`:9880`) и Ollama (`:11434`).

Эмоции мапятся на `speed_factor` / `temperature` (не полный «актёрский» style-transfer; для сильнее — разные ref на tease/strict).

## 4. Если плохо звучит

- Реф короче 3 с или длиннее 20 с — пересобери  
- Музыка в фоне — почти всегда убивает сходство  
- Неверный `prompt_text` — модель плывёт  
- Первая фраза медленная (прогрев GPU) — нормально; дальше быстрее  
- Цифры нормализуются в приложении («12» → «двенадцать»), чтобы не ломалось как у Silero  

## 5. Опционально: дообучение

Zero-shot с 5–15 с уже ок. Если хочется ближе к актрисе — few-shot fine-tune в WebUI SoVITS (1+ мин нарезки той же актрисы). Веса потом указать в `tts_infer.yaml`.
