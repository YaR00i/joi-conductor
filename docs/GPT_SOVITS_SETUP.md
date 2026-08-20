# GPT-SoVITS + Ху Тао (катсцены)

Стек: **GPT-SoVITS api_v2** на `127.0.0.1:9880` → JOI Conductor (провайдер `sovits`).  
GPU: RTX 5070 12 GB — нормально для инференса.

Qwen Base и SoVITS **не делят** один wav: Qwen хватает короткой фразы (~3 с), SoVITS хочет **4–10 с** чистой речи.

## 1. Установка GPT-SoVITS

В приложении: **ИИ ресурсы → GPT-SoVITS → скачать**.

Качается в данные Electron (`%APPDATA%/joi-conductor/gpt-sovits/`):

1. клон [RVC-Boss/GPT-SoVITS](https://github.com/RVC-Boss/GPT-SoVITS)  
2. Python venv + CUDA torch (cu128)  
3. pretrained zip с Hugging Face (`XXXXRT/GPT-SoVITS-Pretrained`)  
4. `ffmpeg.exe` в корень репо (Windows)

Это несколько гигабайт и может занять десятки минут. Не закрывай окно, пока идёт прогресс.

Ручной запасной путь (если кнопка не смогла):

```powershell
cd $env:USERPROFILE\Projects
git clone https://github.com/RVC-Boss/GPT-SoVITS.git
cd GPT-SoVITS
conda create -n GPTSoVits python=3.10
conda activate GPTSoVits
pwsh -F install.ps1 --Device CU128 --Source HF
```

Запуск API (если не жмёшь «старт» в Голосе):

```powershell
python api_v2.py -a 127.0.0.1 -p 9880
```

Проверка: Today → Озвучка → **проверить** → «онлайн».

## 2. Голос из катсцены (реф SoVITS 4–10 с)

Нужен **чистый кусок речи актрисы 4–10 секунд**: без музыки, без чужих реплик, без сильного ревеба.

Короткий клип Qwen (`voice-refs/<госпожа>/ref.wav`, ~3 с) **не подставляй** сюда.

### Вырезать аудио из ролика

Положи катсцену, например `cutscene.mp4`, и:

```powershell
# весь звук дорожки
ffmpeg -i cutscene.mp4 -vn -ac 1 -ar 40000 voice-raw.wav

# или кусок с 12.5с длиной 8с
ffmpeg -ss 00:00:12.5 -i cutscene.mp4 -t 8 -vn -ac 1 -ar 40000 voice-raw.wav
```

Дочисти в Audacity (или аналог): вырежи тишину/музыку, нормализуй громкость, экспорт **WAV mono**.

В Голосе у движка SoVITS: **выбрать файл** → сохранится как:

```
joi-conductor/voice-refs/hu-tao/sovits-ref.wav
```

Укажи **дословный текст** этой фразы (это не `ref_text` Qwen).

Клип для Qwen Base по-прежнему:

```
joi-conductor/voice-refs/hu-tao/ref.wav
```

Важно: pretrained **GPT-SoVITS v2 не поддерживает русский** (`ru`). Языки: en / zh / ja / ko / yue / auto.

Рекомендация для Ху Тао:

- EN VO (как `VO_Hu_Tao_Hello`) → `prompt_lang=en`, `text_lang=en`, реплики на английском  
- CN клип → `zh` (+ `en` text при кросс-лингва)  
- Русский текст сессии → Piper / Edge, не SoVITS

## 3. Настройки в JOI Conductor

1. В Electron (`Запуск.bat`) можно **не** держать отдельный терминал:  
   галочка **Автозапуск GPT-SoVITS** или кнопка **старт**  
2. Today → Озвучка → движок **GPT-SoVITS**  
3. URL `http://127.0.0.1:9880`  
4. Путь `voice-refs/hu-tao/sovits-ref.wav` (не `ref.wav` от Qwen)  
5. Текст референса · языки **en / en**  
6. Пробы эмоций → сессия  

При закрытии приложения гасятся SoVITS (`:9880`) и Ollama (`:11434`).

Эмоции мапятся на `speed_factor` / `temperature` (не полный «актёрский» style-transfer; для сильнее — разные ref на tease/strict).

## 4. Если плохо звучит

- Реф короче 4 с или длиннее 10 с — пересобери  
- Музыка в фоне — почти всегда убивает сходство  
- Неверный `prompt_text` — модель плывёт  
- Первая фраза медленная (прогрев GPU) — нормально; дальше быстрее  
- Цифры нормализуются в приложении («12» → «двенадцать»), чтобы не ломалось как у Silero  

## 5. Опционально: дообучение

Zero-shot с 4–10 с уже ок. Если хочется ближе к актрисе — few-shot fine-tune в WebUI SoVITS (1+ мин нарезки той же актрисы). Веса потом указать в `tts_infer.yaml`.
