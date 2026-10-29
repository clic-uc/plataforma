import { useWeekStandups } from "@/lib/api/analytics";
import { STREAK_WINDOW_WEEKS, type ActivityReport, type StandupCell, type WeekStandups } from "@/lib/analytics";
import { formatEntryDate, formatWeek, shiftWeek, todayKey } from "@/lib/tiempo";
import { Avatar, LoadError, Panel, PeopleChips, PersonCell, focusRing, weekShort } from "@/components/views/analytics/parts";

const CELL_LABEL: Record<StandupCell, string> = {
  sent: "Enviado",
  missing: "Falta",
  na: "Aún no era miembro",
};

function StandupMark({ cell }: { cell: StandupCell }) {
  if (cell === "na") return <span className="text-sm text-text-3">·</span>;
  return (
    <span
      className={`inline-block size-4 rounded-sm ${cell === "sent" ? "bg-accent" : "border-[1.5px] border-border-dash"}`}
    />
  );
}

export function StandupsSection({
  report,
  week,
  onWeekChange,
}: {
  report: ActivityReport;
  /** Semana que se está leyendo. */
  week: string;
  onWeekChange: (week: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Panel title="StandUps por semana" aside="Elige una semana para leer sus StandUps" flush>
        <StandupGrid report={report} week={week} onWeekChange={onWeekChange} />
      </Panel>
      <WeekReader week={week} currentWeek={report.currentWeek} onWeekChange={onWeekChange} />
    </div>
  );
}

function StandupGrid({
  report,
  week,
  onWeekChange,
}: {
  report: ActivityReport;
  week: string;
  onWeekChange: (week: string) => void;
}) {
  const last = report.weeks.length - 1;
  const selected = report.weeks.indexOf(week);
  const colBg = (i: number) => (i === selected ? "bg-surface-2" : "");

  if (report.rows.length === 0) {
    return <p className="px-5 pb-3 text-sm text-text-3">No hay miembros aprobados todavía.</p>;
  }

  return (
    <>
      <div className="overflow-x-auto px-3">
        <table className="border-separate! border-spacing-0">
          <thead>
            <tr>
              <th scope="col" className="w-56 min-w-44 pl-2!">Persona</th>
              {report.weeks.map((w, i) => (
                <th key={w} scope="col" className={`min-w-14 rounded-t-md px-0.5! pt-0.5! pb-1! align-bottom ${colBg(i)}`}>
                  <button
                    type="button"
                    onClick={() => onWeekChange(w)}
                    aria-pressed={i === selected}
                    title={`Leer los StandUps de ${formatWeek(w)}`}
                    className={`w-full cursor-pointer rounded-sm px-1 py-1 text-center text-xs font-semibold transition-colors duration-150 hover:text-text-1 ${focusRing} ${
                      i === selected ? "text-accent-ink" : "text-text-3"
                    }`}
                  >
                    {i === last && <span className="block text-2xs font-normal">en curso</span>}
                    {weekShort(w)}
                  </button>
                </th>
              ))}
              <th scope="col" className="min-w-20 text-right! align-bottom" title="Semanas seguidas con StandUp">
                Racha
              </th>
              <th scope="col" className="min-w-24 pr-2! text-right! align-bottom">
                En el rango
              </th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row) => {
              const expected = row.standups.filter((c) => c !== "na").length;
              const sent = row.standups.filter((c) => c === "sent").length;
              return (
                <tr key={row.member.id} className={row.member.status === "HIATUS" ? "opacity-60" : undefined}>
                  <td className="py-2! pl-2!">
                    <PersonCell member={row.member} />
                  </td>
                  {row.standups.map((cell, i) => (
                    <td
                      key={report.weeks[i]}
                      className={`px-0.5! py-2! text-center! leading-none ${colBg(i)}`}
                      title={`${formatWeek(report.weeks[i])}: ${CELL_LABEL[cell]}`}
                    >
                      <StandupMark cell={cell} />
                      <span className="sr-only">{CELL_LABEL[cell]}</span>
                    </td>
                  ))}
                  <td className="py-2! text-right! tabular-nums text-text-1!">
                    {row.streak > 0 ? (
                      `${row.streak >= STREAK_WINDOW_WEEKS ? `${STREAK_WINDOW_WEEKS}+` : row.streak} ${row.streak === 1 ? "semana" : "semanas"}`
                    ) : (
                      <span className="text-text-3">–</span>
                    )}
                  </td>
                  <td className="py-2! pr-2! text-right! tabular-nums">
                    {expected > 0 ? `${sent} de ${expected}` : <span className="text-text-3">–</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="text-sm tabular-nums">
              <th scope="row" className="pt-2.5 pb-1.5 pl-2 text-left font-medium text-text-2">
                Enviados
              </th>
              {report.standupTotals.map((t, i) => (
                <td key={report.weeks[i]} className={`rounded-b-md pt-2.5 pb-1.5 text-center text-text-2 ${colBg(i)}`}>
                  {t.expected > 0 ? `${t.sent}/${t.expected}` : "–"}
                </td>
              ))}
              <td />
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 pt-3 pb-2 text-xs text-text-3">
        <span className="inline-flex items-center gap-1.5">
          <StandupMark cell="sent" /> Enviado
        </span>
        <span className="inline-flex items-center gap-1.5">
          <StandupMark cell="missing" /> Falta
        </span>
        <span className="inline-flex items-center gap-1.5">
          <StandupMark cell="na" /> Aún no era miembro
        </span>
        <span>Racha: semanas seguidas con StandUp. Los totales no cuentan a quienes están en Hiatus.</span>
      </div>
    </>
  );
}

function WeekReader({
  week,
  currentWeek,
  onWeekChange,
}: {
  week: string;
  currentWeek: string;
  onWeekChange: (week: string) => void;
}) {
  const { data, error, isPlaceholderData } = useWeekStandups(week);
  const navButton = `grid size-8 cursor-pointer place-items-center rounded-md border border-border text-text-2 transition-colors duration-150 hover:bg-surface-2 hover:text-text-1 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent ${focusRing}`;

  return (
    <section className="min-w-0 rounded-lg border border-border bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div className="flex items-center gap-2">
          <button type="button" className={navButton} onClick={() => onWeekChange(shiftWeek(week, -1))} aria-label="Semana anterior">
            ‹
          </button>
          <button
            type="button"
            className={navButton}
            onClick={() => onWeekChange(shiftWeek(week, 1))}
            disabled={week >= currentWeek}
            aria-label="Semana siguiente"
          >
            ›
          </button>
          <h2 className="ml-1 text-base font-semibold text-text-1">
            StandUps de la semana {formatWeek(week)}
            {week === currentWeek && <span className="ml-2 text-xs font-normal text-text-3">en curso</span>}
          </h2>
        </div>
        {data && (
          <div className="text-xs text-text-3">
            {data.entries.length} {data.entries.length === 1 ? "enviado" : "enviados"}
            {data.missing.length > 0 && ` · faltan ${data.missing.length}`}
          </div>
        )}
      </header>

      {error ? (
        <div className="p-5">
          <LoadError error={error} what="los StandUps" />
        </div>
      ) : !data ? (
        <p className="px-5 py-4 text-sm text-text-3">Cargando…</p>
      ) : (
        <div className={`transition-opacity duration-150 ${isPlaceholderData ? "opacity-60" : ""}`}>
          <WeekReaderBody data={data} />
        </div>
      )}
    </section>
  );
}

function WeekReaderBody({ data }: { data: WeekStandups }) {
  return (
    <>
      {data.missing.length > 0 && (
        <div className="flex flex-wrap items-start gap-x-3 gap-y-2 border-b border-border px-5 py-3">
          <span className="pt-0.5 text-sm text-text-2">Sin StandUp:</span>
          <PeopleChips members={data.missing} />
        </div>
      )}

      {data.entries.length === 0 ? (
        <p className="px-5 py-5 text-sm text-text-3">Nadie envió el StandUp esta semana.</p>
      ) : (
        <ol>
          {data.entries.map((e) => (
            <li
              key={e.member.id}
              className="grid gap-x-8 gap-y-3 border-b border-border px-5 py-5 last:border-b-0 md:grid-cols-[13rem_minmax(0,1fr)]"
            >
              <div className="flex items-start gap-2.5">
                <Avatar member={e.member} />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-text-1">{e.member.name}</div>
                  <div className="text-xs text-text-3">Enviado el {formatEntryDate(todayKey(new Date(e.updatedAt)))}</div>
                </div>
              </div>
              <div className="flex max-w-[72ch] flex-col gap-4">
                <StandupAnswer label="¿Qué hice?" text={e.text} />
                {e.learned && <StandupAnswer label="¿Qué aprendí?" text={e.learned} />}
              </div>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

function StandupAnswer({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold text-text-3">{label}</div>
      <p className="text-base whitespace-pre-wrap text-text-1 [overflow-wrap:anywhere]">{text}</p>
    </div>
  );
}
