import type { KanbanColumn } from "@/generated/prisma/enums";
import { todayKey } from "@/lib/tiempo";

// Horas por registrar del Dashboard, sin React ni Prisma.
//
// Las horas se registran al sacar una tarea de En progreso / En revisión, pero solo
// quien la tenía asignada puede hacerlo y la pregunta se puede omitir. Lo que quedó
// sin registrar se recupera del historial (TaskTransition): cada tramo en que fui el
// asignado de la tarea en una columna de trabajo, ya terminado, es un período pendiente
// hasta que registro horas vinculadas a esa tarea o lo descarto.

/** Días hacia atrás (desde el fin del período) en que un período sigue pendiente. */
export const PENDING_HOURS_WINDOW_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export type WorkKind = "TRABAJO" | "REVISION";

/** Columna de trabajo → tipo de horas que le corresponden. */
const KIND_BY_COLUMN: Partial<Record<KanbanColumn, WorkKind>> = { PROGRESO: "TRABAJO", REVISION: "REVISION" };

export interface PendingTransitionRow {
  id: string;
  toColumn: KanbanColumn;
  assigneeId: string | null;
  at: Date;
  hoursDismissedAt: Date | null;
}

/** Un TimeEntry propio vinculado a una tarea. */
export interface LinkedEntry {
  taskId: string;
  kind: string;
  createdAt: Date;
}

export interface PendingPeriod {
  /** Fila que abrió el período: la que se marca al descartar. */
  transitionId: string;
  kind: WorkKind;
  from: Date;
  to: Date;
  /** Día de Chile en que terminó: fecha propuesta para registrar las horas. */
  suggestedDate: string;
}

interface WorkPeriod {
  row: PendingTransitionRow;
  column: KanbanColumn;
  assigneeId: string | null;
  from: Date;
  to: Date | null;
}

/**
 * Tramos continuos con la misma columna y el mismo asignado. Filas seguidas iguales en
 * ambas cosas se juntan (no deberían existir, pero no abren un período nuevo); cambiar
 * de columna o de asignado lo cierra. `to` es null en el último: sigue abierto.
 */
function workPeriods(rows: PendingTransitionRow[]): WorkPeriod[] {
  const sorted = [...rows].sort((a, b) => a.at.getTime() - b.at.getTime());
  const periods: WorkPeriod[] = [];
  for (const row of sorted) {
    const last = periods.at(-1);
    if (last && last.column === row.toColumn && last.assigneeId === row.assigneeId) continue;
    if (last) last.to = row.at;
    periods.push({ row, column: row.toColumn, assigneeId: row.assigneeId, from: row.at, to: null });
  }
  return periods;
}

/**
 * Períodos pendientes de una tarea para `memberId`: fue el asignado en PROGRESO o REVISION,
 * el período terminó dentro de la ventana, la fila que lo abrió no está descartada y no hay
 * un registro suyo de esa tarea y ese tipo creado desde que empezó el período. `entries`
 * son los registros de esa persona; los de otras tareas se ignoran. Del más reciente al
 * más antiguo.
 */
export function pendingPeriods(
  taskId: string,
  rows: PendingTransitionRow[],
  entries: LinkedEntry[],
  memberId: string,
  now: Date,
): PendingPeriod[] {
  const windowStart = now.getTime() - PENDING_HOURS_WINDOW_DAYS * DAY_MS;
  const pending: PendingPeriod[] = [];

  for (const period of workPeriods(rows)) {
    const kind = KIND_BY_COLUMN[period.column];
    if (!kind || period.assigneeId !== memberId) continue;
    if (!period.to || period.to.getTime() < windowStart) continue;
    if (period.row.hoursDismissedAt) continue;

    const from = period.from.getTime();
    const logged = entries.some((e) => e.taskId === taskId && e.kind === kind && e.createdAt.getTime() >= from);
    if (logged) continue;

    pending.push({
      transitionId: period.row.id,
      kind,
      from: period.from,
      to: period.to,
      suggestedDate: todayKey(period.to),
    });
  }

  return pending.reverse();
}
