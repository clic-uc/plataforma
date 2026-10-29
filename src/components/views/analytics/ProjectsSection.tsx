import Link from "next/link";
import type { KanbanColumn } from "@/generated/prisma/enums";
import { KANBAN_ORDER, type ProjectReportRow, type ProjectsReport, type WorkloadRow } from "@/lib/analytics";
import { KANBAN_COLUMN_OPTIONS, projectStatusLabel } from "@/lib/api/status";
import { Panel, PersonCell, firstCol, focusRing, lastCol } from "@/components/views/analytics/parts";

const columnLabel = Object.fromEntries(KANBAN_COLUMN_OPTIONS.map((o) => [o.value, o.label])) as Record<KanbanColumn, string>;

/**
 * Columnas del kanban de menos a más avanzadas: gris, el acento cada vez más
 * intenso, y verde para Listo. Es una escala ordenada, no categórica.
 */
const COLUMN_FILL: Record<KanbanColumn, string> = {
  PENDIENTE: "bg-[color-mix(in_srgb,var(--text-3)_38%,transparent)]",
  PROGRESO: "bg-[color-mix(in_srgb,var(--accent)_40%,transparent)]",
  REVISAR: "bg-[color-mix(in_srgb,var(--accent)_70%,transparent)]",
  REVISION: "bg-accent",
  LISTO: "bg-ok",
};

function Dash() {
  return <span className="text-text-3">–</span>;
}

function count(n: number) {
  return n > 0 ? n : <Dash />;
}

export function ProjectsSection({ report }: { report: ProjectsReport }) {
  return (
    <div className="flex flex-col gap-4">
      <Panel
        title="Proyectos"
        aside={
          report.projects.length > 0
            ? `${report.projects.length} sin archivar · ${report.unassignedOpen} ${report.unassignedOpen === 1 ? "tarea abierta" : "tareas abiertas"} sin asignar`
            : undefined
        }
        flush
      >
        {report.projects.length === 0 ? (
          <p className="px-5 pb-3 text-sm text-text-3">No hay proyectos sin archivar.</p>
        ) : (
          <ProjectsTable projects={report.projects} />
        )}
      </Panel>

      <Panel title="Carga por persona" aside="Tareas abiertas asignadas, en proyectos sin archivar" flush>
        <WorkloadTable rows={report.workload} />
      </Panel>
    </div>
  );
}

function KanbanLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 pt-3 pb-2 text-xs text-text-3">
      {KANBAN_ORDER.map((c) => (
        <span key={c} className="inline-flex items-center gap-1.5">
          <span aria-hidden className={`inline-block size-2.5 rounded-[2px] ${COLUMN_FILL[c]}`} />
          {columnLabel[c]}
        </span>
      ))}
    </div>
  );
}

/** Barra apilada; los segmentos se separan con 2px para que se lean sin depender del color. */
function StackedBar({ parts, total, label }: { parts: { key: KanbanColumn; value: number }[]; total: number; label: string }) {
  return (
    <div role="img" aria-label={label} title={label} className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-sm">
      {parts
        .filter((p) => p.value > 0)
        .map((p) => (
          <span key={p.key} className={`h-full ${COLUMN_FILL[p.key]}`} style={{ flexGrow: p.value, flexBasis: 0, minWidth: 3 }} />
        ))}
      {total === 0 && <span className="h-full flex-1 bg-surface-2" />}
    </div>
  );
}

function tasksLabel(p: ProjectReportRow): string {
  return KANBAN_ORDER.filter((c) => p.tasks[c] > 0)
    .map((c) => `${columnLabel[c]}: ${p.tasks[c]}`)
    .join(", ");
}

function ProjectsTable({ projects }: { projects: ProjectReportRow[] }) {
  const td = "py-3! tabular-nums";
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th scope="col" className={firstCol}>Proyecto</th>
              <th scope="col" className="w-[34%] min-w-56">Tareas por columna</th>
              <th scope="col" className="text-right!">Features hechas</th>
              <th scope="col" className="text-right!">Issues abiertos</th>
              <th scope="col" className="text-right!" title="Tareas abiertas sin asignar">Sin asignar</th>
              <th scope="col" className={`${lastCol} text-right!`}>Equipo</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id}>
                <td className={`${td} ${firstCol}`}>
                  <Link href={`/proyectos/${p.id}`} className={`rounded-sm font-medium text-text-1 hover:text-accent-ink ${focusRing}`}>
                    {p.name}
                  </Link>
                  <div className="text-xs text-text-3">{projectStatusLabel[p.status]}</div>
                </td>
                <td className={td}>
                  {p.totalTasks === 0 ? (
                    <span className="text-text-3">Sin tareas</span>
                  ) : (
                    <div className="flex items-center gap-3">
                      <StackedBar
                        parts={KANBAN_ORDER.map((c) => ({ key: c, value: p.tasks[c] }))}
                        total={p.totalTasks}
                        label={tasksLabel(p)}
                      />
                      <span className="shrink-0 text-xs text-text-3">
                        <span className="font-semibold text-text-1">{p.tasks.LISTO}</span> de {p.totalTasks} listas
                      </span>
                    </div>
                  )}
                </td>
                <td className={`${td} text-right!`}>
                  {p.totalFeatures === 0 ? (
                    <Dash />
                  ) : (
                    <>
                      <span className="text-text-1">
                        {p.features.HECHO} de {p.totalFeatures}
                      </span>
                      {p.features.EN_PROGRESO > 0 && <div className="text-xs text-text-3">{p.features.EN_PROGRESO} en progreso</div>}
                    </>
                  )}
                </td>
                <td className={`${td} text-right! text-text-1!`}>{count(p.openIssues)}</td>
                <td className={`${td} text-right! text-text-1!`}>{count(p.unassignedOpen)}</td>
                <td className={`${td} ${lastCol} text-right! text-text-1!`}>
                  {p.team > 0 ? `${p.team} ${p.team === 1 ? "persona" : "personas"}` : <span className="text-text-3">Sin equipo</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <KanbanLegend />
    </>
  );
}

function WorkloadTable({ rows }: { rows: WorkloadRow[] }) {
  if (rows.length === 0) return <p className="px-5 pb-3 text-sm text-text-3">No hay miembros aprobados todavía.</p>;

  const max = Math.max(1, ...rows.map((r) => r.total));
  const td = "py-2! tabular-nums text-right! text-text-1!";
  const nobody = rows.every((r) => r.total === 0);

  return (
    <>
      {nobody && <p className="px-5 pb-2 text-sm text-text-3">Nadie tiene tareas abiertas asignadas.</p>}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th scope="col" className={`${firstCol} w-56 min-w-44`}>Persona</th>
              <th scope="col" className="w-[40%] min-w-40">
                <span className="sr-only">Distribución</span>
              </th>
              <th scope="col" className="text-right!">Pendiente</th>
              <th scope="col" className="text-right!">En progreso</th>
              <th scope="col" className="text-right!">En revisión</th>
              <th scope="col" className={`${lastCol} text-right!`}>Abiertas</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.member.id} className={r.member.status === "HIATUS" ? "opacity-60" : undefined}>
                <td className={`${firstCol} py-2!`}>
                  <PersonCell member={r.member} />
                </td>
                <td className="py-2!">
                  {r.total > 0 && (
                    <div style={{ width: `${(r.total / max) * 100}%` }}>
                      <StackedBar
                        parts={[
                          { key: "PENDIENTE", value: r.pendiente },
                          { key: "PROGRESO", value: r.progreso },
                          { key: "REVISION", value: r.revision },
                        ]}
                        total={r.total}
                        label={`Pendiente: ${r.pendiente}, en progreso: ${r.progreso}, en revisión: ${r.revision}`}
                      />
                    </div>
                  )}
                </td>
                <td className={td}>{count(r.pendiente)}</td>
                <td className={td}>{count(r.progreso)}</td>
                <td className={td}>{count(r.revision)}</td>
                <td className={`${td} ${lastCol} font-semibold`}>{count(r.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-5 pt-3 pb-2 text-xs text-text-3">
        En revisión junta Por revisar y En revisión. Hiatus al final, atenuados.
      </p>
    </>
  );
}
