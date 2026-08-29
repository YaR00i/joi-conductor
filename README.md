# JOI Conductor

Личный дирижёр JOI-сессий: функции × BPM-паттерны × finish/cumplay.  
Голос Ху Тао (templates / local LLM). 3D-аватар — Phase 3.

**Ember** — цветастая top-down party JRPG с пошаговой стихийной боёвкой, воксельными зонами, спутниками и отношениями. **Игра разрабатывается в Godot 4** (sibling `ember-godot`); миграция идёт постепенно. JOI Conductor владеет паком (`content/ember`) и voxel-скульптором. **Three.js play/editor в этом репо на паузе** — не дорожная карта.

## Docs

- [Правила для AI-агентов](AGENTS.md)
- [Оболочка: сайдбар и хабы](docs/HUB.md)
- [Додзинси / Контент (nhentai)](docs/DOUJIN.md)
- [V1 Spec (Phase 1 — механика)](docs/V1_SPEC.md) ✅
- [V2 Spec (Phase 2 — voice + presets)](docs/V2_SPEC.md) ✅
- [Ember JRPG — единый Game Design Document](docs/EMBER_JRPG_DESIGN.md)
- [Исследование референсов и границы заимствования](docs/EMBER_JRPG_REFERENCES.md)
- [Ember AI handoff — Godot-миграция + frozen Three-контракт](docs/EMBER_AI_HANDOFF.md)
- [Стиль персонажей Ember](docs/EMBER_CHARACTER_STYLE.md)
- [Пайплайн воксельных ботов](docs/EMBER_VOXEL_BOT.md)
- [JOI/Three — пауза, архив монолитов](docs/EMBER_RESTRUCTURE_PLAN.md)
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
