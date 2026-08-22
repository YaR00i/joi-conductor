import { useState } from "react";
import { getActiveSaveSlot } from "../lib/saveSlots";
import { DoodleGame } from "./doodle/DoodleGame";
import { PuzzleGame } from "./puzzle/PuzzleGame";
import { PuzzleTaskEditor } from "./puzzle/PuzzleTaskEditor";
import { RunnerGame } from "./runner/RunnerGame";

interface Props {
  onReward: (cinders: number) => void;
  /** Deduct a wager from the wallet (no-op when unaffordable). */
  onSpend?: (cinders: number) => void;
  walletBalance?: number;
}

type View = "catalog" | "puzzle" | "tasks" | "runner" | "doodle";

export function MinigamesPage({ onReward, onSpend, walletBalance }: Props) {
  const [view, setView] = useState<View>("catalog");
  const isSandbox = getActiveSaveSlot() === "sandbox";

  if (view === "puzzle") {
    return (
      <div className="page page--minigames">
        <PuzzleGame onReward={onReward} onExit={() => setView("catalog")} />
      </div>
    );
  }
  if (view === "runner") {
    return (
      <div className="page page--minigames">
        <RunnerGame
          onReward={onReward}
          onSpend={onSpend}
          walletBalance={walletBalance}
          onExit={() => setView("catalog")}
        />
      </div>
    );
  }
  if (view === "doodle") {
    return (
      <div className="page page--minigames">
        <DoodleGame onReward={onReward} onExit={() => setView("catalog")} />
      </div>
    );
  }
  if (view === "tasks" && isSandbox) {
    return (
      <div className="page page--minigames">
        <PuzzleTaskEditor onExit={() => setView("catalog")} />
      </div>
    );
  }

  return (
    <div className="page page--minigames">
      <header className="page-header">
        <div>
          <h1>Мини-игры</h1>
          <p className="muted">Простые игры на Угольки. Больше риска — больше награда.</p>
        </div>
      </header>

      <div className="minigames-grid">
        <button
          type="button"
          className="minigame-card"
          onClick={() => setView("puzzle")}
        >
          <div className="minigame-card__icon" aria-hidden>🧩</div>
          <div className="minigame-card__title">Пазл</div>
          <div className="minigame-card__desc muted">
            Собери картинку из избранного или с диска. Особые кусочки дают
            задания: эдж, шлепки, стимул. Чем быстрее — тем больше Угольков.
          </div>
          <div className="minigame-card__cta">Играть →</div>
        </button>

        <button
          type="button"
          className="minigame-card"
          onClick={() => setView("runner")}
        >
          <div className="minigame-card__icon" aria-hidden>🏃</div>
          <div className="minigame-card__title">Пробег толпы</div>
          <div className="minigame-card__desc muted">
            Гонка с воротами-множителями: веди толпу через плюсы и иксы,
            выполняй задания огненных врат и перемалывай встречные толпы.
            Красные врата и проигранные схватки режут награду, босс ждёт у финиша.
          </div>
          <div className="minigame-card__cta">Играть →</div>
        </button>

        <button
          type="button"
          className="minigame-card"
          onClick={() => setView("doodle")}
        >
          <div className="minigame-card__icon" aria-hidden>🦘</div>
          <div className="minigame-card__title">Прыжки уголька</div>
          <div className="minigame-card__desc muted">
            Дудл-джамп: уголёк скачет сам, ты ведёшь его по платформам. Пружины
            подбрасывают выше, хрупкий камень осыпается, а огненные платформы
            дают задания: успех — Угольки и рывок, провал — штраф, туман и удар
            стимула. Упал — подъём окончен.
          </div>
          <div className="minigame-card__cta">Играть →</div>
        </button>

        {isSandbox ? (
          <button
            type="button"
            className="minigame-card minigame-card--tool"
            onClick={() => setView("tasks")}
          >
            <div className="minigame-card__icon" aria-hidden>📝</div>
            <div className="minigame-card__title">Редактор заданий</div>
            <div className="minigame-card__desc muted">
              Свои задания для особых кусочков: тип, текст, параметры, бонус и
              штраф. Доступно только в Песочнице, играется в обоих слотах.
            </div>
            <div className="minigame-card__cta">Открыть →</div>
          </button>
        ) : (
          <div className="minigame-card minigame-card--locked">
            <div className="minigame-card__icon" aria-hidden>📝</div>
            <div className="minigame-card__title">Редактор заданий</div>
            <div className="minigame-card__desc muted">
              Доступен только в слоте «Песочница». Переключись в настройках,
              чтобы создавать свои задания для особых кусочков.
            </div>
          </div>
        )}

        <div className="minigame-card minigame-card--soon">
          <div className="minigame-card__icon" aria-hidden>🎲</div>
          <div className="minigame-card__title">Ещё игры…</div>
          <div className="minigame-card__desc muted">Скоро появятся новые мини-игры.</div>
        </div>
      </div>
    </div>
  );
}
