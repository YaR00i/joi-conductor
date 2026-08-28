# JOI Conductor

Личный дирижёр JOI-сессий: функции × BPM-паттерны × finish/cumplay.  
Голос Ху Тао (templates / local LLM). 3D-аватар — Phase 3.

**Ember** — цветастая top-down party JRPG с пошаговой стихийной боёвкой, воксельными зонами, спутниками и отношениями. Целевая игра переезжает на Godot 4; JOI Conductor пока остаётся владельцем общего контента и legacy-инструментов.

## Docs

- [Правила для AI-агентов](AGENTS.md)
- [Оболочка: сайдбар и хабы](docs/HUB.md)
- [Додзинси / Контент (nhentai)](docs/DOUJIN.md)
- [V1 Spec (Phase 1 — механика)](docs/V1_SPEC.md) ✅
- [V2 Spec (Phase 2 — voice + presets)](docs/V2_SPEC.md) ✅
- [Ember JRPG — единый Game Design Document](docs/EMBER_JRPG_DESIGN.md)
- [Исследование референсов и границы заимствования](docs/EMBER_JRPG_REFERENCES.md)
- [Ember AI handoff — действующие технические контракты](docs/EMBER_AI_HANDOFF.md)
- [Стиль персонажей Ember](docs/EMBER_CHARACTER_STYLE.md)
- [Пайплайн воксельных ботов](docs/EMBER_VOXEL_BOT.md)
- [Legacy-реструктуризация JOI/Three — maintenance only](docs/EMBER_RESTRUCTURE_PLAN.md)
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
