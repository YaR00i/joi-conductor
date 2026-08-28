import { useMemo, useState, type CSSProperties } from "react";
import type { NavId } from "../components/SideNav";
import { ProgressHubChrome } from "../components/HubChrome";
import {
  ACHIEVEMENT_SET_ORDER,
  cindersForAchievementLevel,
  ensureAchievementsMigrated,
  formatCounterValue,
  listAchievementProgress,
  loadAchievements,
  totalLevels,
  unlockedCount,
  type AchievementProgress,
  type AchievementSet,
} from "../lib/achievements";
import { achievementActionCta } from "../lib/achievementActionCta";
import { getActiveMistress } from "../lib/mistress";
import { mistressUnlockSnapshotFromWallet } from "../lib/wallet";
import { playUiNav, primeUiAudio } from "../lib/uiSound";

type Props = {
  revision?: number;
  onNavigate?: (id: NavId) => void;
};

export function AchievementsPage({ revision = 0, onNavigate }: Props) {
  const state = useMemo(
    () =>
      ensureAchievementsMigrated(
        loadAchievements(),
        mistressUnlockSnapshotFromWallet(),
      ),
    [revision],
  );

  const groups = useMemo(() => {
    return ACHIEVEMENT_SET_ORDER.map((g) => ({
      id: g.id,
      title: g.titleRu,
      items: listAchievementProgress(state.counters, g.id),
    })).filter((g) => g.items.length > 0);
  }, [state.counters]);

  const items = useMemo(
    () => groups.flatMap((g) => g.items),
    [groups],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected =
    items.find((i) => i.def.id === selectedId) ?? items[0] ?? null;

  const unlocked = unlockedCount(state.counters);
  const levels = totalLevels(state.counters);

  return (
    <div className="achievements-page page--achievements">
      {onNavigate ? (
        <ProgressHubChrome active="achievements" onChange={onNavigate} />
      ) : (
        <header className="achievements-page__head">
          <div>
            <p className="achievements-page__eyebrow">
              Витрина {getActiveMistress().displayNameRu}
            </p>
            <h1 className="achievements-page__title">Достижения</h1>
          </div>
        </header>
      )}
      <header className="achievements-page__head">
        <p className="achievements-page__sub">
          Сессии · контроль грани · режимы · финал · госпожи. Счётчики растут
          только после «Завершить». За каждый новый уровень — угольки.
        </p>
        <div className="achievements-page__totals" aria-label="Сводка">
          <div className="achievements-page__total">
            <span className="achievements-page__total-val">
              {unlocked}/{items.length}
            </span>
            <span className="achievements-page__total-label">открыто</span>
          </div>
          <div className="achievements-page__total">
            <span className="achievements-page__total-val">{levels}</span>
            <span className="achievements-page__total-label">сумма ур.</span>
          </div>
        </div>
      </header>

      <div className="achievements-page__body">
        <div className="achievements-page__groups">
          {groups.map((g) => (
            <AchievementGroup
              key={g.id}
              setId={g.id}
              title={g.title}
              items={g.items}
              selectedId={selected?.def.id ?? null}
              onSelect={setSelectedId}
            />
          ))}
        </div>

        {selected ? (
          <aside className="achievements-detail" aria-live="polite">
            <AchievementDetail item={selected} onNavigate={onNavigate} />
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function AchievementGroup({
  setId,
  title,
  items,
  selectedId,
  onSelect,
}: {
  setId: AchievementSet;
  title: string;
  items: AchievementProgress[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section
      className={`achievements-group achievements-group--${setId}`}
      aria-label={title}
    >
      <h2 className="achievements-group__title">{title}</h2>
      <div className="achievements-showcase">
        {items.map((item) => (
          <AchievementTile
            key={item.def.id}
            item={item}
            active={selectedId === item.def.id}
            onSelect={() => onSelect(item.def.id)}
          />
        ))}
      </div>
    </section>
  );
}

function AchievementTile({
  item,
  active,
  onSelect,
}: {
  item: AchievementProgress;
  active: boolean;
  onSelect: () => void;
}) {
  const { def, level, unlocked, progress } = item;

  return (
    <button
      type="button"
      className={[
        "ach-tile",
        unlocked ? "is-unlocked" : "is-locked",
        active ? "is-active" : "",
        level >= def.tiers.length ? "is-maxed" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ "--ach-accent": def.accent } as CSSProperties}
      onClick={onSelect}
      title={def.nameRu}
    >
      <div className="ach-tile__medallion" aria-hidden>
        <span className="ach-tile__ring" />
        <span className="ach-tile__glyph">{def.glyph}</span>
        {level > 0 ? (
          <span className="ach-tile__lvl">Ур. {level}</span>
        ) : (
          <span className="ach-tile__lvl ach-tile__lvl--locked">?</span>
        )}
      </div>
      <span className="ach-tile__name">{def.nameRu}</span>
      <span className="ach-tile__bar" aria-hidden>
        <span
          className="ach-tile__bar-fill"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </span>
    </button>
  );
}

function AchievementDetail({
  item,
  onNavigate,
}: {
  item: AchievementProgress;
  onNavigate?: (id: NavId) => void;
}) {
  const { def, value, level, nextTier, progress } = item;
  const maxed = nextTier == null;
  const action = achievementActionCta(def.id);

  return (
    <div
      className="achievements-detail__inner"
      style={{ "--ach-accent": def.accent } as CSSProperties}
    >
      <div className="achievements-detail__hero">
        <div className="achievements-detail__medallion" aria-hidden>
          <span className="achievements-detail__glyph">{def.glyph}</span>
        </div>
        <div>
          <p className="achievements-detail__eyebrow">
            {level > 0 ? `Уровень ${level}` : "Ещё не открыто"}
            {maxed ? " · макс." : ""}
          </p>
          <h2 className="achievements-detail__title">{def.nameRu}</h2>
          <p className="achievements-detail__blurb">{def.blurbRu}</p>
        </div>
      </div>

      <div className="achievements-detail__stats">
        <div>
          <span className="achievements-detail__stat-label">Сейчас</span>
          <span className="achievements-detail__stat-val">
            {formatCounterValue(value, def.unit)}
          </span>
        </div>
        <div>
          <span className="achievements-detail__stat-label">
            {maxed ? "Потолок" : "До следующего"}
          </span>
          <span className="achievements-detail__stat-val">
            {maxed
              ? formatCounterValue(def.tiers[def.tiers.length - 1]!, def.unit)
              : formatCounterValue(nextTier, def.unit)}
          </span>
        </div>
      </div>

      <div className="achievements-detail__progress">
        <div className="achievements-detail__progress-track">
          <div
            className="achievements-detail__progress-fill"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
        <p className="achievements-detail__progress-hint">
          {maxed
            ? "Все уровни открыты"
            : `${Math.round(progress * 100)}% до ур. ${level + 1}`}
        </p>
      </div>

      {!maxed && onNavigate ? (
        <button
          type="button"
          className="achievements-detail__cta"
          onClick={() => {
            void primeUiAudio();
            playUiNav();
            onNavigate(action.nav);
          }}
        >
          {action.labelRu}
        </button>
      ) : null}

      <ol className="achievements-detail__tiers">
        {def.tiers.map((need, i) => {
          const lv = i + 1;
          const done = value >= need;
          const reward = cindersForAchievementLevel(lv);
          return (
            <li
              key={lv}
              className={`achievements-detail__tier${done ? " is-done" : ""}`}
            >
              <span className="achievements-detail__tier-lv">Ур. {lv}</span>
              <span className="achievements-detail__tier-need">
                {formatCounterValue(need, def.unit)}
              </span>
              <span className="achievements-detail__tier-reward">
                +{reward} угольков
              </span>
              <span className="achievements-detail__tier-mark" aria-hidden>
                {done ? "✓" : "·"}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
