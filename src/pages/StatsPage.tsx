import { useMemo, useState } from "react";
import type { NavId } from "../components/SideNav";
import {
  buildDiaryStats,
  formatAbortPct,
  formatStatMinutes,
  formatStatNumber,
  type DayBucket,
  type NamedCount,
  type StatsRange,
} from "../lib/diaryStats";
import { loadDiaryEntries } from "../lib/sessionDiary";
import { playUiNav, primeUiAudio } from "../lib/uiSound";

type Props = {
  revision?: number;
  onNavigate?: (id: NavId) => void;
};

type ChartSeries = {
  key: string;
  label: string;
  color: string;
  values: number[];
};

const RANGES: { id: StatsRange; label: string }[] = [
  { id: "7d", label: "7 дней" },
  { id: "14d", label: "14 дней" },
  { id: "30d", label: "30 дней" },
  { id: "all", label: "Всё" },
];

export function StatsPage({ revision = 0, onNavigate }: Props) {
  const [range, setRange] = useState<StatsRange>("30d");
  const entries = useMemo(() => loadDiaryEntries(), [revision]);
  const stats = useMemo(() => buildDiaryStats(entries, range), [entries, range]);
  const { days, summary } = stats;
  const empty = summary.sessions === 0;

  const labels = days.map((d) => d.label);

  const go = (id: NavId) => {
    if (!onNavigate) return;
    void primeUiAudio();
    playUiNav();
    onNavigate(id);
  };

  return (
    <div className="stats-page page--stats">
      <header className="stats-page__head">
        <div>
          <p className="stats-page__eyebrow">Из дневника</p>
          <h1 className="stats-page__title">Статистика</h1>
          <p className="stats-page__sub">
            Все записи дневника за период входят в сессии, минуты и эджи —
            и завершённые, и прерванные. Новые строки пишутся кнопкой
            «Завершить»; прерванные учитываются, только если уже лежат в
            дневнике.
          </p>
        </div>
        <div className="stats-page__ranges" role="tablist" aria-label="Период">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              role="tab"
              aria-selected={range === r.id}
              className={`stats-page__range${range === r.id ? " is-active" : ""}`}
              onClick={() => setRange(r.id)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </header>

      {empty ? (
        <div className="stats-page__empty">
          <p>Пока нет сессий в выбранном периоде.</p>
          <p className="stats-page__empty-hint">
            Заверши сессию — она попадёт в дневник и сюда.
          </p>
          {onNavigate ? (
            <div className="page-empty-ctas">
              <button
                type="button"
                className="page-empty-cta"
                onClick={() => go("session")}
              >
                К сессии
              </button>
              <button
                type="button"
                className="page-empty-cta page-empty-cta--ghost"
                onClick={() => go("roulette")}
              >
                К рулетке
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <section className="stats-kpis" aria-label="Сводка">
            <Kpi
              label="Сессии"
              value={formatStatNumber(summary.sessions)}
              hint={`${formatStatNumber(summary.completed)} зав. · ${formatStatNumber(summary.aborted)} прер.`}
            />
            <Kpi
              label="Abort %"
              value={formatAbortPct(summary.abortPct)}
              hint={
                summary.aborted > 0
                  ? `${formatStatNumber(summary.aborted)} прерванных`
                  : "прерванных нет"
              }
            />
            <Kpi
              label="Эджи"
              value={formatStatNumber(summary.edges)}
              hint={
                summary.avgEdges != null
                  ? `ср. ${formatStatNumber(summary.avgEdges, 1)}`
                  : undefined
              }
            />
            <Kpi
              label="Руины"
              value={formatStatNumber(summary.ruins)}
              hint={
                summary.avgRuins != null
                  ? `ср. ${formatStatNumber(summary.avgRuins, 1)}`
                  : undefined
              }
            />
            <Kpi label="Съел cum" value={formatStatNumber(summary.ateCum)} />
            <Kpi
              label="Время"
              value={formatStatMinutes(summary.minutes)}
              hint={
                summary.avgMinutes != null
                  ? `ср. ${formatStatMinutes(summary.avgMinutes)}`
                  : undefined
              }
            />
            <Kpi
              label="Настроение"
              value={
                summary.avgMood != null
                  ? formatStatNumber(summary.avgMood, 1)
                  : "—"
              }
              hint="средний score"
            />
          </section>

          <div className="stats-grid">
            <LineChart
              title="Сессии"
              subtitle="сколько раз в день"
              labels={labels}
              series={[
                {
                  key: "sessions",
                  label: "Сессии",
                  color: "#ff8a4a",
                  values: days.map((d) => d.sessions),
                },
                {
                  key: "completed",
                  label: "Завершённые",
                  color: "#3dd68c",
                  values: days.map((d) => d.completed),
                },
                {
                  key: "aborted",
                  label: "Прерванные",
                  color: "#a89078",
                  values: days.map((d) => d.aborted),
                },
              ]}
            />

            <LineChart
              title="Эджи"
              subtitle="сумма за день"
              labels={labels}
              series={[
                {
                  key: "edges",
                  label: "Эджи",
                  color: "#ffb070",
                  values: days.map((d) => d.edges),
                },
              ]}
            />

            <LineChart
              title="Руины"
              subtitle="сумма за день"
              labels={labels}
              series={[
                {
                  key: "ruins",
                  label: "Руины",
                  color: "#e07272",
                  values: days.map((d) => d.ruins),
                },
              ]}
            />

            <LineChart
              title="Сперма съедена"
              subtitle="сессии с ateCum = да"
              labels={labels}
              series={[
                {
                  key: "ate",
                  label: "Съел",
                  color: "#ff6b9d",
                  values: days.map((d) => d.ateCum),
                },
              ]}
            />

            <LineChart
              title="Время в сессии"
              subtitle="минуты за день"
              labels={labels}
              series={[
                {
                  key: "mins",
                  label: "Минуты",
                  color: "#f0a060",
                  values: days.map((d) => Math.round(d.minutes)),
                },
              ]}
              formatValue={(v) => formatStatMinutes(v)}
            />

            <LineChart
              title="Настроение"
              subtitle="средний mood score за день"
              labels={labels}
              series={[
                {
                  key: "mood",
                  label: "Mood",
                  color: "#c9a06a",
                  values: days.map((d) =>
                    d.moodCount > 0 ? d.moodSum / d.moodCount : 0,
                  ),
                },
              ]}
              formatValue={(v) => formatStatNumber(v, 1)}
              allowFraction
            />

            <LineChart
              title="Финалы"
              subtitle="исходы по дням"
              labels={labels}
              series={[
                {
                  key: "cum",
                  label: "Кончить",
                  color: "#3dd68c",
                  values: days.map((d) => d.finaleCum),
                },
                {
                  key: "ruin",
                  label: "Руина",
                  color: "#e07272",
                  values: days.map((d) => d.finaleRuin),
                },
                {
                  key: "deny",
                  label: "Отказ",
                  color: "#ff8a4a",
                  values: days.map((d) => d.finaleDeny),
                },
              ]}
            />
          </div>

          <div className="stats-tables">
            <CountTable
              title="Финалы"
              subtitle="всего за период"
              rows={[
                { id: "cum", label: "Кончить", count: summary.finaleCum },
                { id: "ruin", label: "Руина", count: summary.finaleRuin },
                { id: "deny", label: "Отказ", count: summary.finaleDeny },
                { id: "none", label: "Без финала", count: summary.finaleNone },
              ]}
              total={summary.sessions}
            />
            <CountTable
              title="Режимы"
              subtitle="как часто выбирал"
              rows={stats.byMode}
              total={summary.sessions}
            />
            <CountTable
              title="Куда кончать"
              subtitle="топ finish"
              rows={stats.byFinish}
              total={summary.sessions}
            />
            <CountTable
              title="Cumplay"
              subtitle="топ заданий"
              rows={stats.byCumplay}
              total={summary.sessions}
            />
            <DayTable days={days} />
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="stats-kpi">
      <span className="stats-kpi__label">{label}</span>
      <span className="stats-kpi__value">{value}</span>
      {hint ? <span className="stats-kpi__hint">{hint}</span> : null}
    </div>
  );
}

function CountTable({
  title,
  subtitle,
  rows,
  total,
}: {
  title: string;
  subtitle: string;
  rows: NamedCount[];
  total: number;
}) {
  return (
    <section className="stats-table">
      <header className="stats-table__head">
        <h2 className="stats-table__title">{title}</h2>
        <p className="stats-table__sub">{subtitle}</p>
      </header>
      {rows.length === 0 ? (
        <p className="stats-table__empty">Нет данных</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Параметр</th>
              <th>Кол-во</th>
              <th>%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const pct =
                total > 0 ? Math.round((row.count / total) * 100) : 0;
              return (
                <tr key={row.id}>
                  <td>{row.label}</td>
                  <td>{formatStatNumber(row.count)}</td>
                  <td>
                    <span className="stats-table__bar-wrap">
                      <span
                        className="stats-table__bar"
                        style={{ width: `${pct}%` }}
                      />
                      <span className="stats-table__pct">{pct}%</span>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

function DayTable({ days }: { days: DayBucket[] }) {
  const rows = [...days].reverse().filter((d) => d.sessions > 0);
  return (
    <section className="stats-table stats-table--wide">
      <header className="stats-table__head">
        <h2 className="stats-table__title">По дням</h2>
        <p className="stats-table__sub">детальная таблица активных дней</p>
      </header>
      {rows.length === 0 ? (
        <p className="stats-table__empty">Нет данных</p>
      ) : (
        <div className="stats-table__scroll">
          <table>
            <thead>
              <tr>
                <th>День</th>
                <th>Сессии</th>
                <th>Эджи</th>
                <th>Руины</th>
                <th>Съел</th>
                <th>Минуты</th>
                <th>Mood</th>
                <th>Cum</th>
                <th>Ruin</th>
                <th>Deny</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.day}>
                  <td>{d.label}</td>
                  <td>{d.sessions}</td>
                  <td>{d.edges}</td>
                  <td>{d.ruins}</td>
                  <td>{d.ateCum}</td>
                  <td>{Math.round(d.minutes)}</td>
                  <td>
                    {d.moodCount > 0
                      ? formatStatNumber(d.moodSum / d.moodCount, 1)
                      : "—"}
                  </td>
                  <td>{d.finaleCum}</td>
                  <td>{d.finaleRuin}</td>
                  <td>{d.finaleDeny}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function LineChart({
  title,
  subtitle,
  labels,
  series,
  formatValue,
  allowFraction = false,
}: {
  title: string;
  subtitle: string;
  labels: string[];
  series: ChartSeries[];
  formatValue?: (v: number) => string;
  allowFraction?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const w = 640;
  const h = 220;
  const pad = { t: 18, r: 16, b: 36, l: 40 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const n = Math.max(labels.length, 1);

  const allValues = series.flatMap((s) => s.values);
  const rawMax = Math.max(0, ...allValues);
  const maxY = rawMax <= 0 ? 1 : allowFraction ? rawMax * 1.15 : Math.ceil(rawMax * 1.15);
  const niceMax = allowFraction ? maxY : Math.max(1, Math.ceil(maxY));

  const xAt = (i: number) =>
    pad.l + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yAt = (v: number) =>
    pad.t + innerH - (Math.max(0, v) / niceMax) * innerH;

  const gridYs = [0, 0.5, 1].map((t) => ({
    y: pad.t + innerH * (1 - t),
    label: allowFraction
      ? formatStatNumber(niceMax * t, 1)
      : formatStatNumber(Math.round(niceMax * t)),
  }));

  const labelStep = Math.max(1, Math.ceil(n / 7));

  return (
    <section className="stats-chart">
      <header className="stats-chart__head">
        <div>
          <h2 className="stats-chart__title">{title}</h2>
          <p className="stats-chart__sub">{subtitle}</p>
        </div>
        <div className="stats-chart__legend">
          {series.map((s) => (
            <span key={s.key} className="stats-chart__leg">
              <i style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      </header>

      <div className="stats-chart__canvas">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          className="stats-chart__svg"
          role="img"
          aria-label={title}
          onMouseLeave={() => setHover(null)}
        >
          {gridYs.map((g) => (
            <g key={g.y}>
              <line
                x1={pad.l}
                x2={w - pad.r}
                y1={g.y}
                y2={g.y}
                className="stats-chart__grid"
              />
              <text
                x={pad.l - 8}
                y={g.y + 3}
                className="stats-chart__axis"
                textAnchor="end"
              >
                {g.label}
              </text>
            </g>
          ))}

          {series.map((s) => {
            const pts = s.values
              .map((v, i) => `${xAt(i)},${yAt(v)}`)
              .join(" ");
            return (
              <g key={s.key}>
                <polyline
                  points={pts}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="2.2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  className="stats-chart__line"
                />
                {s.values.map((v, i) => (
                  <circle
                    key={`${s.key}-${i}`}
                    cx={xAt(i)}
                    cy={yAt(v)}
                    r={hover === i ? 5 : 3.2}
                    fill={s.color}
                    className="stats-chart__dot"
                  />
                ))}
              </g>
            );
          })}

          {labels.map((label, i) =>
            i % labelStep === 0 || i === n - 1 ? (
              <text
                key={label + i}
                x={xAt(i)}
                y={h - 10}
                className="stats-chart__axis"
                textAnchor="middle"
              >
                {label}
              </text>
            ) : null,
          )}

          {labels.map((_, i) => (
            <rect
              key={`hit-${i}`}
              x={xAt(i) - innerW / Math.max(n, 1) / 2}
              y={pad.t}
              width={Math.max(12, innerW / Math.max(n, 1))}
              height={innerH}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
          ))}

          {hover != null && hover >= 0 && hover < n ? (
            <line
              x1={xAt(hover)}
              x2={xAt(hover)}
              y1={pad.t}
              y2={pad.t + innerH}
              className="stats-chart__hover-line"
            />
          ) : null}
        </svg>

        {hover != null && hover >= 0 && hover < n ? (
          <div className="stats-chart__tip">
            <strong>{labels[hover]}</strong>
            {series.map((s) => {
              const v = s.values[hover] ?? 0;
              const text = formatValue
                ? formatValue(v)
                : allowFraction
                  ? formatStatNumber(v, 1)
                  : formatStatNumber(v);
              return (
                <span key={s.key}>
                  <i style={{ background: s.color }} />
                  {s.label}: {text}
                </span>
              );
            })}
          </div>
        ) : null}
      </div>
    </section>
  );
}
