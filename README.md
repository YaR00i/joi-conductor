# JOI Conductor

Личный дирижёр JOI-сессий: функции × BPM-паттерны × finish/cumplay.  
Голос Ху Тао (templates / local LLM). 3D-аватар — Phase 3.

## Docs

- [V1 Spec (Phase 1 — механика)](docs/V1_SPEC.md) ✅
- [V2 Spec (Phase 2 — voice + presets)](docs/V2_SPEC.md) ✅
- [Ember Anomaly (игра — vertical slice + editor)](docs/EMBER_ANOMALY.md)
- [Ember AI handoff (архитектура, решения и ближайший план)](docs/EMBER_AI_HANDOFF.md)
- [Hu Tao bible notes](docs/character/hu-tao.md)
- [Игрушки и механика](docs/TOYS_MECHANICS.md)

## Run

**Своё окно (Electron):** `Запуск.bat`

```bash
npm install
npm run app
```

Ollama (опционально): запусти Ollama → на «Сегодня» режим голоса **Local LLM** → «Проверить LLM».

## Phase 2 status

- [x] Character bible → TemplateVoice
- [x] LocalLlmVoice (Ollama proxy `/api/ollama`) + settings UI
- [x] Presets (light / medium / heavy / anal / denial / feet / cei)
- [x] Toys owned / allowed UI → queue filter
- [x] RLGL / cluster / tease banners
- [x] Export JSON: preset + voice
