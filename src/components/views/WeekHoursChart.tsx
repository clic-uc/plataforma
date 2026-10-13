"use client";

import { useState } from "react";
import { formatHours, type ChartSeries, type WeekChart } from "@/lib/tiempo";

function seriesColor(series: ChartSeries): string {
  return series.slot === null ? "var(--series-other)" : `var(--series-${series.slot})`;
}

/**
 * Columnas apiladas de horas por día y proyecto. La leyenda lleva el total de
 * cada proyecto, y el historial de abajo es la vista de tabla de los mismos datos;
 * el color nunca es la única forma de identificar un proyecto.
 */
export function WeekHoursChart({ chart }: { chart: WeekChart }) {
  const [active, setActive] = useState<number | null>(null);
  const seriesByKey = new Map(chart.series.map((s) => [s.key, s]));
  const pct = (minutes: number) => `${(minutes / 60 / chart.axisMaxHours) * 100}%`;

  return (
    <div className="hours-chart">
      <div className="hours-plot">
        <div className="hours-axis" aria-hidden>
          {chart.ticks.map((t) => (
            <span key={t} style={{ bottom: `${(t / chart.axisMaxHours) * 100}%` }}>{t}h</span>
          ))}
        </div>

        <div className="hours-area">
          {chart.ticks.map((t) => (
            <div key={t} className="hours-grid" style={{ bottom: `${(t / chart.axisMaxHours) * 100}%` }} />
          ))}

          {chart.totalMinutes === 0 && <div className="hours-empty">Aún no registras horas esta semana.</div>}

          <div className="hours-cols">
            {chart.days.map((day, i) => (
              <div
                key={day.dayKey}
                className={`hours-col${active === i ? " active" : ""}`}
                tabIndex={day.totalMinutes > 0 ? 0 : -1}
                aria-label={
                  day.totalMinutes > 0
                    ? `${day.label}: ${formatHours(day.totalMinutes)}. ${day.segments
                        .map((s) => `${seriesByKey.get(s.key)?.name} ${formatHours(s.minutes)}`)
                        .join(", ")}`
                    : `${day.label}: sin horas`
                }
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
              >
                {day.totalMinutes > 0 && (
                  <div className="hours-stack" style={{ height: pct(day.totalMinutes) }}>
                    <span className="hours-total">{formatHours(day.totalMinutes)}</span>
                    {day.segments.map((s) => (
                      <div
                        key={s.key}
                        className="hours-seg"
                        style={{ flexGrow: s.minutes, background: seriesColor(seriesByKey.get(s.key)!) }}
                      />
                    ))}
                  </div>
                )}

                {active === i && day.totalMinutes > 0 && (
                  <div
                    className={`hours-tooltip${i >= 4 ? " left" : ""}`}
                    style={{ "--bar": pct(day.totalMinutes) } as React.CSSProperties}
                    role="tooltip"
                  >
                    <div className="hours-tooltip-title">{day.label}</div>
                    {[...day.segments].reverse().map((s) => {
                      const series = seriesByKey.get(s.key)!;
                      return (
                        <div key={s.key} className="hours-tooltip-row">
                          <span className="hours-swatch" style={{ background: seriesColor(series) }} />
                          <span className="hours-tooltip-name">{series.name}</span>
                          <span className="hours-tooltip-value">{formatHours(s.minutes)}</span>
                        </div>
                      );
                    })}
                    {day.segments.length > 1 && (
                      <div className="hours-tooltip-row total">
                        <span className="hours-tooltip-name">Total</span>
                        <span className="hours-tooltip-value">{formatHours(day.totalMinutes)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="hours-xlabels" aria-hidden>
        {chart.days.map((day) => (
          <span key={day.dayKey}>{day.label}</span>
        ))}
      </div>

      {chart.series.length > 0 && (
        <ul className="hours-legend">
          {chart.series.map((s) => (
            <li key={s.key}>
              <span className="hours-swatch" style={{ background: seriesColor(s) }} />
              <span className="hours-legend-name">{s.name}</span>
              <span className="hours-legend-value">{formatHours(s.minutes)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
