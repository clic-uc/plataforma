import { KANBAN_COLUMN_OPTIONS } from "@/lib/api/status";
import type { ProjectTask } from "@/lib/api/projects";
import { formatDuration, formatEffort } from "@/lib/task-history";

/** Columnas que cuentan como ciclo: desde que alguien la toma hasta que llega a Listo. */

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CL", { day: "numeric", month: "short", timeZone: "America/Santiago" });
}

const names = (people: { name: string }[]) => people.map((p) => p.name).join(", ");

function Row({ label, title, children }: { label: string; title?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_1fr] gap-3 py-1 text-sm">
      <dt className="text-text-3" title={title}>
        {label}
      </dt>
      <dd className="min-w-0 text-text-1">{children}</dd>
    </div>
  );
}

/**
 * Historial de la tarea en el detalle: quién la trabajó y revisó, cuánto estuvo en cada
 * columna y las horas dedicadas (totales del proyecto, de todas las personas). Sin
 * movimientos, una sola línea.
 */
export function TaskHistory({ task }: { task: ProjectTask }) {
  const h = task.history;
  const current = task.columnValue;
  const visited = KANBAN_COLUMN_OPTIONS.filter((opt) => (h.columnMs[opt.value] ?? 0) > 0 || opt.value === current);
  const quiet =
    h.workedBy.length === 0 &&
    h.reviewedBy.length === 0 &&
    h.minutesWorked === 0 &&
    h.minutesReviewed === 0 &&
    visited.length <= 1;

  if (quiet) {
    const label = KANBAN_COLUMN_OPTIONS.find((opt) => opt.value === current)?.label ?? "";
    return (
      <section className="mt-5 border-t border-border pt-4">
        <h3 className="mb-1 text-sm font-semibold text-text-2">Historial</h3>
        <p className="text-sm text-text-3">
          Creada el {formatDay(h.createdAt)}. Sigue en {label}, sin movimientos
          {h.columnMs[current] ? ` (${formatDuration(h.columnMs[current])})` : ""}.
        </p>
      </section>
    );
  }

  // Listo crece para siempre: no se grafica. El resto se compara contra la columna más larga.
  const bars = visited.filter((opt) => opt.value !== "LISTO");
  const maxMs = Math.max(1, ...bars.map((opt) => h.columnMs[opt.value] ?? 0));
  // La misma definición que Analíticas: primera entrada a En progreso → llegada a Listo.
  const cycleMs = h.cycleMs ?? 0;
  const leadMs = h.completedAt ? new Date(h.completedAt).getTime() - new Date(h.createdAt).getTime() : null;
  const hours = [
    h.minutesWorked > 0 && `${formatEffort(h.minutesWorked)} de trabajo`,
    h.minutesReviewed > 0 && `${formatEffort(h.minutesReviewed)} de revisión`,
  ].filter(Boolean);

  return (
    <section className="mt-5 border-t border-border pt-4">
      <h3 className="mb-2 text-sm font-semibold text-text-2">Historial</h3>

      <dl>
        {h.workedBy.length > 0 && <Row label="La trabajó">{names(h.workedBy)}</Row>}
        {h.reviewedBy.length > 0 && <Row label="La revisó">{names(h.reviewedBy)}</Row>}
        <Row label="Horas" title="Registradas al mover la tarea, sumando a todas las personas">
          {hours.length > 0 ? (
            <span className="tabular-nums">{hours.join(" · ")}</span>
          ) : (
            <span className="text-text-3">Nadie ha registrado horas en esta tarea</span>
          )}
        </Row>
        {h.completedAt && (
          <>
            <Row label="Terminada">
              {formatDay(h.completedAt)}
              {leadMs !== null && leadMs > 0 && (
                <span className="text-text-3"> · {formatDuration(leadMs)} desde que se creó</span>
              )}
            </Row>
            {cycleMs > 0 && (
              <Row label="Ciclo" title="Desde que entró por primera vez a En progreso hasta que llegó a Listo">
                <span className="tabular-nums">{formatDuration(cycleMs)}</span>
                <span className="text-text-3"> entre En progreso y Listo</span>
              </Row>
            )}
          </>
        )}
        {!h.completedAt && <Row label="Creada">{formatDay(h.createdAt)}</Row>}
      </dl>

      {bars.length > 0 && (
        <>
          <h4 className="mt-3 mb-1.5 text-xs font-semibold text-text-2">Tiempo en cada columna</h4>
          <ul className="flex flex-col gap-1">
            {bars.map((opt) => {
              const ms = h.columnMs[opt.value] ?? 0;
              const isCurrent = opt.value === current;
              return (
                <li key={opt.value} className="grid grid-cols-[96px_1fr_auto] items-center gap-3 text-sm">
                  <span className={isCurrent ? "font-semibold text-text-1" : "text-text-2"}>{opt.label}</span>
                  <span className="h-1.5 rounded-sm bg-surface-2">
                    <span
                      className={`block h-full rounded-sm ${isCurrent ? "bg-accent" : "bg-text-3"}`}
                      style={{ width: `${Math.max(2, (ms / maxMs) * 100)}%` }}
                    />
                  </span>
                  <span className="min-w-20 text-right text-text-1 tabular-nums">
                    {formatDuration(ms)}
                    {isCurrent && <span className="text-text-3"> · ahora</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
