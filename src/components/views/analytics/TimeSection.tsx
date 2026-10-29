import { HEAT_THRESHOLDS_MINUTES, heatLevel, type ActivityReport } from "@/lib/analytics";
import { formatHours, formatWeek, seriesColor } from "@/lib/tiempo";
import { HEAT_CELL, Panel, PeopleChips, PersonCell, Swatch, weekShort } from "@/components/views/analytics/parts";

/** "3.25": las celdas no repiten la "h"; la leyenda ya dice que son horas. */
function hoursNumber(minutes: number): string {
  return String(Number((minutes / 60).toFixed(2)));
}

const HEAT_LEGEND = HEAT_THRESHOLDS_MINUTES.map((from, i) => {
  const to = HEAT_THRESHOLDS_MINUTES[i + 1];
  const h = (m: number) => m / 60;
  if (i === 0) return `Menos de ${h(to)}h`;
  return to ? `${h(from)}–${h(to)}h` : `${h(from)}h o más`;
});

export function TimeSection({ report }: { report: ActivityReport }) {
  const n = report.weeks.length;
  const activeCount = report.rows.filter((r) => r.member.status === "ACTIVO").length;

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title="Horas por persona y semana"
        aside={`${formatHours(report.totalMinutes)} en ${n} semanas · ${formatHours(Math.round(report.totalMinutes / n))} por semana en promedio`}
        flush
      >
        <HoursHeatmap report={report} />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel title="Horas por proyecto" aside={`Últimas ${n} semanas`}>
          <ProjectBars report={report} />
        </Panel>

        <Panel
          title="Sin horas esta semana"
          aside={activeCount > 0 ? `${report.missingHours.length} de ${activeCount} activos` : undefined}
        >
          <p className="mb-3 text-xs text-text-3">
            Semana en curso, {formatWeek(report.currentWeek)}. No cuenta a quienes están en Hiatus.
          </p>
          {report.missingHours.length > 0 ? (
            <PeopleChips members={report.missingHours} />
          ) : (
            <p className="text-sm text-text-2">Todos los activos registraron horas esta semana.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}

function HoursHeatmap({ report }: { report: ActivityReport }) {
  const last = report.weeks.length - 1;

  if (report.rows.length === 0) {
    return <p className="px-5 pb-3 text-sm text-text-3">No hay miembros aprobados todavía.</p>;
  }

  // Celdas separadas (border-spacing) en vez de líneas: el color de cada casilla
  // ya ordena la tabla.
  const cell = "border-b-0! p-0! pb-1!";
  return (
    <>
      <div className="overflow-x-auto px-3">
        <table className="border-separate! border-spacing-x-1">
          <thead>
            <tr>
              <th scope="col" className="w-56 min-w-44 border-b-0! pl-2!">Persona</th>
              {report.weeks.map((w, i) => (
                <th
                  key={w}
                  scope="col"
                  className={`min-w-14 border-b-0! px-0! text-center! align-bottom ${i === last ? "text-text-1!" : ""}`}
                  title={formatWeek(w)}
                >
                  {i === last && <span className="block text-2xs font-normal text-text-3">en curso</span>}
                  {weekShort(w)}
                </th>
              ))}
              <th scope="col" className="min-w-16 border-b-0! pr-2! text-right! align-bottom">Total</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row) => (
              <tr key={row.member.id} className={row.member.status === "HIATUS" ? "opacity-60" : undefined}>
                <td className={`${cell} pr-3! pl-2!`}>
                  <PersonCell member={row.member} />
                </td>
                {row.minutes.map((m, i) => (
                  <td key={report.weeks[i]} className={cell}>
                    <div
                      className={`grid h-8 place-items-center rounded-sm text-sm tabular-nums ${HEAT_CELL[heatLevel(m)]}`}
                      title={`${row.member.name} · ${formatWeek(report.weeks[i])}: ${m > 0 ? formatHours(m) : "sin horas"}`}
                    >
                      {m > 0 ? hoursNumber(m) : <span aria-label="sin horas">–</span>}
                    </div>
                  </td>
                ))}
                <td className={`${cell} pr-2! text-right! font-semibold tabular-nums text-text-1!`}>
                  {row.totalMinutes > 0 ? formatHours(row.totalMinutes) : <span className="font-normal text-text-3">–</span>}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="text-sm tabular-nums">
              <th scope="row" className="pt-3 pl-2 text-left font-medium text-text-2">
                Total equipo
              </th>
              {report.weekTotals.map((m, i) => (
                <td key={report.weeks[i]} className="pt-3 text-center font-medium text-text-2">
                  {m > 0 ? hoursNumber(m) : <span className="text-text-3">–</span>}
                </td>
              ))}
              <td className="pt-3 pr-2 text-right font-semibold text-text-1">
                {formatHours(report.totalMinutes)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 pt-3 pb-2 text-xs text-text-3">
        <span>Horas por semana</span>
        {HEAT_LEGEND.map((label, i) => (
          <span key={label} className="inline-flex items-center gap-1.5">
            <span aria-hidden className={`inline-block size-3 rounded-[2px] ${HEAT_CELL[i + 1]}`} />
            {label}
          </span>
        ))}
      </div>
    </>
  );
}

function ProjectBars({ report }: { report: ActivityReport }) {
  if (report.projects.length === 0) {
    return <p className="text-sm text-text-3">Nadie registró horas en las últimas {report.weeks.length} semanas.</p>;
  }
  const max = Math.max(...report.projects.map((p) => p.minutes));

  return (
    <ul className="flex flex-col gap-3">
      {report.projects.map((p) => (
        <li key={p.key} className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)_7.5rem] items-center gap-4">
          <span className="flex min-w-0 items-center gap-2 text-sm text-text-1">
            <Swatch color={seriesColor(p)} />
            <span className="truncate">{p.name}</span>
          </span>
          <span className="h-2.5 rounded-sm bg-surface-2">
            <span className="block h-full rounded-sm" style={{ width: `${(p.minutes / max) * 100}%`, background: seriesColor(p) }} />
          </span>
          <span className="text-right text-sm tabular-nums">
            <span className="font-semibold text-text-1">{formatHours(p.minutes)}</span>
            <span className="text-text-3">
              {" · "}
              {p.people} {p.people === 1 ? "persona" : "personas"}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

