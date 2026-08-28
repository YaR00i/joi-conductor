import {
  FARM_DIFFICULTIES,
  type FarmDifficulty,
  type FarmDifficultyId,
} from "../../lib/farmReward";
import { FARM_CROPS } from "./farmField";
import { CropArt, HeelArt, WeedArt } from "./FarmArt";

/** Setup screen: rules brief + difficulty pick + crop showcase for the round. */

interface Props {
  difficultyId: FarmDifficultyId;
  onDifficulty: (id: FarmDifficultyId) => void;
  onStart: () => void;
  onBack: () => void;
}

function diffMeta(d: FarmDifficulty): string {
  return `${d.cols}×${d.rows} · ${Math.round(d.roundSec / 60)}:${String(
    d.roundSec % 60,
  ).padStart(2, "0")} · проверок: ${d.inspections.length}`;
}

export function FarmSetup({ difficultyId, onDifficulty, onStart, onBack }: Props) {
  return (
    <div className="farm-setup">
      <div className="farm-setup__bar">
        <button
          type="button"
          className="puzzle-hud__btn puzzle-hud__btn--back"
          onClick={onBack}
          title="Выйти из игры"
        >
          ←
        </button>
        <div className="farm-setup__heading">
          <h1 className="farm-setup__title">Пошлая ферма</h1>
          <p className="farm-setup__sub muted">
            Раунд на время в духе «Весёлой фермы» — с характером.
          </p>
        </div>
      </div>

      <div className="farm-setup__cols">
        <section className="farm-setup__panel farm-setup__panel--rules">
          <h2 className="farm-setup__panel-title">Как играть</h2>
          <ul className="farm-setup__rules">
            <li>
              <span className="farm-rule__ico" aria-hidden>
                <CropArt id="cucumber" className="farm-rule__art" />
              </span>
              Кликни пустую грядку — посадишь выбранную культуру из лотка снизу.
            </li>
            <li>
              <span className="farm-rule__ico" aria-hidden>
                <CropArt id="banana" className="farm-rule__art" />
              </span>
              Растение растёт и наливается; спелое — собирай, пока окно не вышло.
            </li>
            <li>
              <span className="farm-rule__ico" aria-hidden>
                <CropArt id="eggplant" className="farm-rule__art" />
              </span>
              Жаждующая грядка стоит на месте и просит каплю — кликни, чтобы полить.
            </li>
            <li>
              <span className="farm-rule__ico" aria-hidden>
                <WeedArt className="farm-rule__art" />
              </span>
              Колючий сорняк лезет на пустую землю и злит проверку — вырви кликом.
            </li>
            <li>
              <span className="farm-rule__ico" aria-hidden>
                <HeelArt className="farm-rule__art" />
              </span>
              Хозяйка заходит с проверкой: чисто — бонус, бардак — наказание
              заданием (эдж, шлепки, стимул…).
            </li>
          </ul>
          <p className="farm-setup__note muted">
            Серии сборов греют множитель до ×2; каждое увядшее растение сжигает
            серию и бьёт по Уголькам.
          </p>
        </section>

        <section className="farm-setup__panel farm-setup__panel--diffs">
          <h2 className="farm-setup__panel-title">Сложность</h2>
          <div className="farm-diffs">
            {FARM_DIFFICULTIES.map((d) => (
              <button
                key={d.id}
                type="button"
                className={`farm-diff${d.id === difficultyId ? " is-on" : ""}`}
                onClick={() => onDifficulty(d.id)}
              >
                <span className="farm-diff__name">{d.labelRu}</span>
                <span className="farm-diff__meta muted">{diffMeta(d)}</span>
                {d.id === difficultyId ? <span className="farm-diff__check">✓</span> : null}
              </button>
            ))}
          </div>
        </section>

        <section className="farm-setup__panel farm-setup__panel--crops">
          <h2 className="farm-setup__panel-title">Культуры</h2>
          <div className="farm-setup__crops">
            {FARM_CROPS.map((c) => (
              <div key={c.id} className="farm-setup__crop">
                <span className="farm-setup__crop-art" aria-hidden>
                  <CropArt id={c.id} className="farm-setup__crop-svg" />
                </span>
                <span className="farm-setup__crop-body">
                  <span className="farm-setup__crop-head">
                    <span className="farm-setup__crop-name">{c.nameRu}</span>
                    <span className="farm-setup__crop-meta muted">
                      {Math.round(c.growMs / 1000)}с · +{c.value}
                    </span>
                  </span>
                  <span className="farm-setup__crop-joke muted">{c.jokeRu}</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="farm-setup__footer">
        <button type="button" className="puzzle-config__start" onClick={onStart}>
          🌱 Взяться за тяпку
        </button>
      </div>
    </div>
  );
}
