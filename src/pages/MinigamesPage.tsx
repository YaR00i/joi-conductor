import { useState } from "react";
import type { NavId } from "../components/SideNav";
import { PlayHubChrome } from "../components/HubChrome";
import { getActiveSaveSlot } from "../lib/saveSlots";
import { DoodleGame } from "./doodle/DoodleGame";
import { FarmGame } from "./farm/FarmGame";
import { MemoryGame } from "./memory/MemoryGame";
import { PuzzleGame } from "./puzzle/PuzzleGame";
import { PuzzleTaskEditor } from "./puzzle/PuzzleTaskEditor";
import { RunnerGame } from "./runner/RunnerGame";

interface Props {
  onReward: (cinders: number) => void;
  /** Deduct a wager from the wallet (no-op when unaffordable). */
  onSpend?: (cinders: number) => void;
  walletBalance?: number;
  onNavigate?: (id: NavId) => void;
}

type View = "catalog" | "puzzle" | "tasks" | "runner" | "doodle" | "memory" | "farm";

export function MinigamesPage({
  onReward,
  onSpend,
  walletBalance,
  onNavigate,
}: Props) {
  const [view, setView] = useState<View>("catalog");
  const isSandbox = getActiveSaveSlot() === "sandbox";

  if (view === "memory") {
    return (
      <div className="page page--minigames">
        <MemoryGame onReward={onReward} onExit={() => setView("catalog")} />
      </div>
    );
  }

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
  if (view === "farm") {
    return (
      <div className="page page--minigames">
        <FarmGame onReward={onReward} onExit={() => setView("catalog")} />
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
      {onNavigate ? (
        <PlayHubChrome active="minigames" onChange={onNavigate} />
      ) : (
        <header className="page-header">
          <div>
            <h1>Мини-игры</h1>
          </div>
        </header>
      )}
      <p className="muted">
        Простые игры на Угольки. Больше риска — больше награда.
      </p>

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
            Дудл-джамп: уголёк скачет сам, ты ведёшь его по платформам. Пружины,
            лёд, мигающие тени и сгустки холода — раскалывай их прыжком сверху.
            Копи жар и обналичивай на очагах: упал горячим — расплата стимулом.
          </div>
          <div className="minigame-card__cta">Играть →</div>
        </button>

        <button
          type="button"
          className="minigame-card"
          onClick={() => setView("memory")}
        >
          <div className="minigame-card__icon" aria-hidden>🎴</div>
          <div className="minigame-card__title">Пары на память</div>
          <div className="minigame-card__desc muted">
            Карточные пары из избранного. Серии подряд поднимают множитель
            до ×2, промахи жгут Угольки, некоторые пары прячут задание —
            выполни для бонуса или плати штраф. Найденная пара показывает
            себя целиком в панели награды.
          </div>
          <div className="minigame-card__cta">Играть →</div>
        </button>

        <button
          type="button"
          className="minigame-card"
          onClick={() => setView("farm")}
        >
          <div className="minigame-card__icon" aria-hidden>🍆</div>
          <div className="minigame-card__title">Пошлая ферма</div>
          <div className="minigame-card__desc muted">
            Весёлая ферма на таймере: сажай пошлые культуры, поливай жаждущие
            грядки и собирай урожай, пока он не обиделся. Хозяйка заходит с
            проверкой: чисто — бонус, бардак — наказание заданием.
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
