import Link from "next/link";
import type { KanbanColumn, TaskDifficulty } from "@/generated/prisma/enums";
import type {
  CycleRow,
  DifficultyCycleRow,
  DurationStats,
  KanbanReport,
  ProjectCycleRow,
  ThroughputWeek,
  WipColumn,
  WipTask,
} from "@/lib/kanban-metrics";
import { MIN_P85_SAMPLE, WIP_COLUMNS, weekOfInstant } from "@/lib/kanban-metrics";
import { KANBAN_COLUMN_OPTIONS, taskDifficultyLabel } from "@/lib/api/status";
import { formatDayMonth } from "@/lib/api/format";
import { formatDuration, formatEffort } from "@/lib/task-history";
import { formatWeek, seriesColor } from "@/lib/tiempo";
import { Figure, Panel, PersonCell, Swatch, firstCol, focusRing, lastCol, weekShort } from "@/components/views/analytics/parts";

const columnLabel = Object.fromEntries(KANBAN_COLUMN_OPTIONS.map((o) => [o.value, o.label])) as Record<KanbanColumn, string>;

const difficultyLabel = (d: TaskDifficulty | null) => (d ? taskDifficultyLabel[d] : "Sin estimar");

function Dash({ title }: { title?: string }) {
  return (
    <span className="text-text-3" title={title}>
      –
    </span>
  );
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

export function KanbanSection({ report }: { report: KanbanReport }) {
  const n = report.weeks.length;
  const historyStart = report.historySince ? new Date(report.historySince) : null;
  // Solo se avisa si el historial no alcanza a cubrir el rango elegido.
  const partial = historyStart !== null && weekOfInstant(historyStart) > report.weeks[0];

  return (
    <div className="flex flex-col gap-4">
      {partial && (
        <p className="px-1 text-sm text-text-2">
          El paso de las tareas por las columnas se registra desde el {formatDayMonth(historyStart)}: lo anterior no tiene fechas y no
          cuenta para estas métricas.
        </p>
      )}

      <Figures report={report} />

      <Panel title="Tareas terminadas por semana" aside={`Llegaron a Listo · últimas ${n} semanas`}>
        <ThroughputChart report={report} />
      </Panel>

      <Panel
        title="Trabajo en curso"
        aside={report.wip.length > 0 ? "En progreso, por revisar y en revisión · las que llevan más tiempo en su columna primero" : undefined}
        flush
      >
        <WipTable report={report} />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Tiempo en cada columna" aside={`Pasos que terminaron en las últimas ${n} semanas`}>
          <ColumnTimes report={report} />
        </Panel>
        <Panel title="Por dificultad" aside="Tareas terminadas en el rango" flush>
          <DifficultyTable rows={report.byDifficulty} empty={report.overall.completed === 0} />
        </Panel>
      </div>

      <Panel title="Por proyecto" aside={`Últimas ${n} semanas`} flush>
        <ProjectTable rows={report.byProject} />
      </Panel>

      <p className="px-1 text-xs text-text-3">
        Tiempo de ciclo: desde que la tarea entra por primera vez a En progreso hasta que llega a Listo. Lead time: desde que se
        crea. Son medianas, no promedios, para que una tarea olvidada no las mueva; el p85 (el 85 % tardó eso o menos) aparece con{" "}
        {MIN_P85_SAMPLE} tareas o más. Los tiempos son de calendario, con noches y fines de semana; las horas dedicadas son las que
        cada persona registró al mover la tarea.
      </p>
    </div>
  );
}

// ─── Cifras ───

function Figures({ report }: { report: KanbanReport }) {
  const { overall } = report;
  const label = (title: string, s: DurationStats) => (
    <>
      {title}
      {s.p85Ms !== null && <span className="block">p85 {formatDuration(s.p85Ms)}</span>}
    </>
  );
  const wipDetail = WIP_COLUMNS.filter((c) => report.wipByColumn[c] > 0)
    .map((c) => `${report.wipByColumn[c]} ${columnLabel[c].toLowerCase()}`)
    .join(" · ");

  return (
    <section className="grid grid-cols-2 gap-y-4 rounded-lg border border-border bg-surface px-5 py-4 md:grid-cols-4 md:divide-x md:divide-border">
      <Figure
        value={report.throughput.total}
        label={`Terminadas en ${report.weeks.length} semanas`}
        tone={report.throughput.total === 0 ? "muted" : "default"}
      />
      <div className="md:pl-5">
        <Figure
          value={overall.cycle.medianMs !== null ? formatDuration(overall.cycle.medianMs) : "–"}
          label={label("Tiempo de ciclo, mediana", overall.cycle)}
          tone={overall.cycle.medianMs === null ? "muted" : "default"}
        />
      </div>
      <div className="md:pl-5">
        <Figure
          value={overall.lead.medianMs !== null ? formatDuration(overall.lead.medianMs) : "–"}
          label={label("Lead time, mediana", overall.lead)}
          tone={overall.lead.medianMs === null ? "muted" : "default"}
        />
      </div>
      <div className="md:pl-5">
        <Figure
          value={report.wip.length}
          label={
            <>
              En curso ahora
              {report.wip.length > 0 && <span className="block">{wipDetail}</span>}
            </>
          }
          tone={report.wip.length === 0 ? "muted" : "default"}
        />
      </div>
    </section>
  );
}

// ─── Throughput ───

/** Tope y marcas enteras del eje: como mucho 4 tramos. */
function countAxis(max: number): { top: number; ticks: number[] } {
  const step = Math.max(1, Math.ceil(Math.max(max, 1) / 4));
  const top = Math.max(step * Math.ceil(Math.max(max, 1) / step), 2);
  const ticks: number[] = [];
  for (let t = 0; t <= top; t += step) ticks.push(t);
  return { top: ticks.at(-1)!, ticks };
}

function ThroughputChart({ report }: { report: KanbanReport }) {
  const { throughput } = report;
  const { top, ticks } = countAxis(Math.max(0, ...throughput.weeks.map((w) => w.total)));
  const seriesByKey = new Map(throughput.series.map((s) => [s.key, s]));
  const last = throughput.weeks.length - 1;

  if (throughput.total === 0) {
    return (
      <p className="text-sm text-text-3">
        Ninguna tarea llegó a Listo en las últimas {throughput.weeks.length} semanas. Se cuentan las que se mueven a Listo en el kanban.
      </p>
    );
  }

  const describe = (w: ThroughputWeek) =>
    w.total === 0
      ? `${formatWeek(w.week)}: ninguna`
      : `${formatWeek(w.week)}: ${plural(w.total, "tarea", "tareas")}` +
        (throughput.series.length > 1 ? ` (${w.segments.map((s) => `${seriesByKey.get(s.key)?.name} ${s.count}`).join(", ")})` : "");

  return (
    <div>
      <div className="flex gap-2">
        <div aria-hidden className="relative h-40 w-5 shrink-0 text-right text-xs tabular-nums text-text-3">
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 translate-y-1/2" style={{ bottom: `${(t / top) * 100}%` }}>
              {t}
            </span>
          ))}
        </div>
        <div className="relative h-40 flex-1">
          {ticks.map((t) => (
            <div
              key={t}
              aria-hidden
              className={`absolute inset-x-0 border-t ${t === 0 ? "border-border" : "border-dashed border-border/70"}`}
              style={{ bottom: `${(t / top) * 100}%` }}
            />
          ))}
          <ol className="absolute inset-0 flex items-end gap-2">
            {throughput.weeks.map((w) => (
              <li
                key={w.week}
                className="flex h-full flex-1 flex-col items-center justify-end"
                title={describe(w)}
                aria-label={describe(w)}
              >
                {w.total > 0 && (
                  <>
                    <span className="mb-1 text-xs font-semibold tabular-nums text-text-1">{w.total}</span>
                    <div className="flex w-full max-w-12 flex-col-reverse gap-0.5" style={{ height: `${(w.total / top) * 100}%` }}>
                      {w.segments.map((s, i) => (
                        <span
                          key={s.key}
                          className={`block ${i === w.segments.length - 1 ? "rounded-t-sm" : ""}`}
                          style={{ flexGrow: s.count, flexBasis: 0, background: seriesColor(seriesByKey.get(s.key)!) }}
                        />
                      ))}
                    </div>
                  </>
                )}
              </li>
            ))}
          </ol>
        </div>
      </div>
      <div aria-hidden className="mt-2 flex gap-2 pl-7 text-xs text-text-3">
        {throughput.weeks.map((w, i) => (
          <span key={w.week} className={`flex-1 text-center ${i === last ? "font-semibold text-text-1" : ""}`}>
            {weekShort(w.week)}
          </span>
        ))}
      </div>
      {throughput.series.length > 1 && (
        <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
          {throughput.series.map((s) => (
            <li key={s.key} className="inline-flex items-center gap-2">
              <Swatch color={seriesColor(s)} />
              <span className="text-text-1">{s.name}</span>
              <span className="tabular-nums text-text-3">{s.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── WIP ───

function WipTable({ report }: { report: KanbanReport }) {
  if (report.wip.length === 0) {
    return <p className="px-5 pb-3 text-sm text-text-3">No hay tareas en progreso ni en revisión.</p>;
  }

  // Referencia para "más que lo habitual": el p85 de los pasos ya terminados por esa columna.
  const p85 = new Map(report.columns.map((c) => [c.column as KanbanColumn, c.stats.p85Ms]));
  const td = "py-2.5!";

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th scope="col" className={firstCol}>Tarea</th>
            <th scope="col">Columna</th>
            <th scope="col" className="w-52">Asignada a</th>
            <th scope="col">Dificultad</th>
            <th scope="col" className={`${lastCol} text-right!`}>En la columna</th>
          </tr>
        </thead>
        <tbody>
          {report.wip.map((t) => (
            <WipRow key={t.id} task={t} td={td} over={overUsual(t, p85.get(t.column) ?? null)} showProject={report.projectId === null} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function overUsual(t: WipTask, p85Ms: number | null): boolean {
  return p85Ms !== null && t.ageMs > p85Ms;
}

function WipRow({ task: t, td, over, showProject }: { task: WipTask; td: string; over: boolean; showProject: boolean }) {
  const since = formatDayMonth(new Date(t.since));
  return (
    <tr>
      <td className={`${td} ${firstCol}`}>
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="shrink-0 font-mono text-xs text-text-3">{t.label}</span>
          <span className="min-w-0 truncate text-text-1">{t.name}</span>
        </div>
        {showProject && (
          <Link
            href={`/proyectos/${t.project.id}`}
            className={`rounded-sm text-xs text-text-3 hover:text-accent-ink ${focusRing}`}
          >
            {t.project.name}
          </Link>
        )}
      </td>
      <td className={`${td} whitespace-nowrap text-text-1!`}>{columnLabel[t.column as WipColumn]}</td>
      <td className={td}>{t.assignee ? <PersonCell member={t.assignee} /> : <span className="text-text-3">Sin asignar</span>}</td>
      <td className={`${td} whitespace-nowrap`}>{t.difficulty ? <span className="text-text-1">{difficultyLabel(t.difficulty)}</span> : <Dash title="Sin estimar" />}</td>
      <td className={`${td} ${lastCol} whitespace-nowrap text-right! tabular-nums`}>
        {t.sinceKnown ? (
          <>
            <span className={`font-semibold ${over ? "text-warn" : "text-text-1"}`}>{formatDuration(t.ageMs)}</span>
            <div className="text-xs text-text-3">
              {over ? (
                <span title="Lleva más que el 85 % de las tareas que pasaron por esta columna en el rango">Más que lo habitual · </span>
              ) : null}
              desde el {since}
            </div>
          </>
        ) : (
          <>
            <span className="font-semibold text-text-1">Desde antes del {since}</span>
            <div className="text-xs text-text-3">ya estaba ahí al empezar el historial</div>
          </>
        )}
      </td>
    </tr>
  );
}

// ─── Tiempo por columna ───

function ColumnTimes({ report }: { report: KanbanReport }) {
  const withData = report.columns.filter((c) => c.stats.count > 0);
  if (withData.length === 0) {
    return (
      <p className="text-sm text-text-3">
        Todavía ninguna tarea salió de una columna en el rango. Cada paso cuenta desde que la tarea entra a la columna hasta que sale.
      </p>
    );
  }

  const max = Math.max(...withData.map((c) => c.stats.p85Ms ?? c.stats.medianMs ?? 0), 1);
  const pct = (ms: number) => `${(ms / max) * 100}%`;

  return (
    <>
      <ul className="flex flex-col gap-4">
        {report.columns.map(({ column, stats }) => (
          <li key={column} className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-x-4 gap-y-1">
            <span className="text-sm text-text-1">{columnLabel[column]}</span>
            {stats.medianMs === null ? (
              <span className="text-sm text-text-3">Sin pasos terminados</span>
            ) : (
              <span className="text-sm tabular-nums">
                <span className="font-semibold text-text-1">{formatDuration(stats.medianMs)}</span>
                <span className="text-text-3">
                  {stats.p85Ms !== null && ` · p85 ${formatDuration(stats.p85Ms)}`} · {plural(stats.count, "paso", "pasos")}
                </span>
              </span>
            )}
            {stats.medianMs !== null && (
              <div
                className="relative col-start-2 h-2 rounded-sm bg-surface-2"
                role="img"
                aria-label={`${columnLabel[column]}: mediana ${formatDuration(stats.medianMs)}${stats.p85Ms !== null ? `, p85 ${formatDuration(stats.p85Ms)}` : ""}`}
              >
                <span className="absolute inset-y-0 left-0 rounded-sm bg-accent" style={{ width: pct(stats.medianMs) }} />
                {stats.p85Ms !== null && (
                  <span aria-hidden className="absolute -inset-y-1 w-0.5 rounded-full bg-text-2" style={{ left: `calc(${pct(stats.p85Ms)} - 1px)` }} />
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-text-3">
        Barra: mediana de cada paso por la columna. Por revisar es la espera hasta que alguien toma la revisión.
      </p>
    </>
  );
}

// ─── Tablas de ciclo ───

/** Mediana grande y p85 abajo. */
function DurationCell({ stats }: { stats: DurationStats }) {
  if (stats.medianMs === null) return <Dash />;
  return (
    <>
      <span className="text-text-1">{formatDuration(stats.medianMs)}</span>
      {stats.p85Ms !== null && <div className="text-xs text-text-3">p85 {formatDuration(stats.p85Ms)}</div>}
    </>
  );
}

function EffortCell({ row }: { row: CycleRow }) {
  if (row.effortMedianMinutes === null) return <Dash title={row.completed > 0 ? "Nadie registró horas en estas tareas" : undefined} />;
  return (
    <>
      <span className="text-text-1">{formatEffort(Math.round(row.effortMedianMinutes))}</span>
      {row.withEffort < row.completed && <div className="text-xs text-text-3">{row.withEffort} de {row.completed} con horas</div>}
    </>
  );
}

/** `last`: la columna de horas por tarea cierra la tabla y se alinea con el título del panel. */
function CycleHeaders({ last = false }: { last?: boolean }) {
  return (
    <>
      <th scope="col" className="text-right!">Terminadas</th>
      <th scope="col" className="text-right!" title="De la primera entrada a En progreso hasta Listo">Ciclo</th>
      <th scope="col" className="text-right!" title="De la creación hasta Listo">Lead time</th>
      <th
        scope="col"
        className={`${last ? lastCol : ""} text-right!`}
        title="Mediana de horas registradas por tarea terminada, de todas las personas"
      >
        Horas por tarea
      </th>
    </>
  );
}

function CycleCells({ row, td, last = false }: { row: CycleRow; td: string; last?: boolean }) {
  return (
    <>
      <td className={`${td} text-right! text-text-1!`}>{row.completed > 0 ? row.completed : <Dash />}</td>
      <td className={`${td} text-right!`}>
        <DurationCell stats={row.cycle} />
      </td>
      <td className={`${td} text-right!`}>
        <DurationCell stats={row.lead} />
      </td>
      <td className={`${td} ${last ? lastCol : ""} text-right!`}>
        <EffortCell row={row} />
      </td>
    </>
  );
}

function DifficultyTable({ rows, empty }: { rows: DifficultyCycleRow[]; empty: boolean }) {
  if (empty) return <p className="px-5 pb-3 text-sm text-text-3">Ninguna tarea terminada en el rango.</p>;
  const td = "py-2.5! tabular-nums align-top";
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th scope="col" className={firstCol}>Dificultad</th>
            <CycleHeaders last />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.difficulty ?? "none"}>
              <td className={`${td} ${firstCol} ${r.difficulty ? "text-text-1!" : "text-text-3!"}`}>{difficultyLabel(r.difficulty)}</td>
              <CycleCells row={r} td={td} last />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProjectTable({ rows }: { rows: ProjectCycleRow[] }) {
  if (rows.length === 0) return <p className="px-5 pb-3 text-sm text-text-3">No hay proyectos sin archivar.</p>;
  const td = "py-2.5! tabular-nums align-top";
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th scope="col" className={firstCol}>Proyecto</th>
            <CycleHeaders />
            <th scope="col" className="text-right!" title="Horas registradas al sacar tareas de En progreso, en el rango">
              Horas de trabajo
            </th>
            <th scope="col" className={`${lastCol} text-right!`} title="Horas registradas al sacar tareas de En revisión, en el rango">
              Horas de revisión
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className={`${td} ${firstCol}`}>
                <Link href={`/proyectos/${r.id}`} className={`rounded-sm font-medium text-text-1 hover:text-accent-ink ${focusRing}`}>
                  {r.name}
                </Link>
              </td>
              <CycleCells row={r} td={td} />
              <td className={`${td} text-right! text-text-1!`}>{r.workedMinutes > 0 ? formatEffort(r.workedMinutes) : <Dash />}</td>
              <td className={`${td} ${lastCol} text-right! text-text-1!`}>
                {r.reviewedMinutes > 0 ? formatEffort(r.reviewedMinutes) : <Dash />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
