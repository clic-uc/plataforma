import type { KanbanColumn } from "@/generated/prisma/enums";

/**
 * Historial de una tarea (TaskTransition): cada fila abre un período en `toColumn` con
 * `assigneeId` como asignado, que dura hasta la fila siguiente o hasta ahora. De esos
 * períodos salen el tiempo en cada columna, quién la trabajó (asignado durante PROGRESO)
 * y quién la revisó (asignado durante REVISION). Son duraciones de calendario, no
 * esfuerzo: las horas dedicadas van en TimeEntry.
 */
export interface TaskTransitionRow {
  fromColumn: KanbanColumn | null;
  toColumn: KanbanColumn;
  assigneeId: string | null;
  at: Date;
}

export interface TaskPeriod {
  column: KanbanColumn;
  assigneeId: string | null;
  from: Date;
  to: Date;
  /** El período sigue abierto (es el estado actual de la tarea); `to` es "ahora". */
  open: boolean;
}

export interface TaskHistorySummary {
  /** Milisegundos acumulados en cada columna, contando el período abierto hasta ahora. */
  columnMs: Partial<Record<KanbanColumn, number>>;
  /** Asignados durante En progreso, en orden de aparición. */
  workerIds: string[];
  /** Asignados durante En revisión, en orden de aparición. */
  reviewerIds: string[];
  /** Primera entrada a En progreso. */
  startedAt: Date | null;
  /** Última entrada a Listo, si la tarea sigue en Listo. */
  completedAt: Date | null;
  /** startedAt → completedAt. */
  cycleMs: number | null;
  /** createdAt → completedAt. */
  leadMs: number | null;
}

export function taskPeriods(rows: TaskTransitionRow[], now: Date): TaskPeriod[] {
  const sorted = [...rows].sort((a, b) => a.at.getTime() - b.at.getTime());
  return sorted.map((row, i) => {
    const next = sorted[i + 1];
    return {
      column: row.toColumn,
      assigneeId: row.assigneeId,
      from: row.at,
      to: next ? next.at : now,
      open: !next,
    };
  });
}

function addUnique(list: string[], id: string | null): void {
  if (id && !list.includes(id)) list.push(id);
}

export function summarizeTaskHistory(rows: TaskTransitionRow[], createdAt: Date, now: Date): TaskHistorySummary {
  const periods = taskPeriods(rows, now);
  const columnMs: Partial<Record<KanbanColumn, number>> = {};
  const workerIds: string[] = [];
  const reviewerIds: string[] = [];
  let startedAt: Date | null = null;

  for (const p of periods) {
    const ms = Math.max(0, p.to.getTime() - p.from.getTime());
    columnMs[p.column] = (columnMs[p.column] ?? 0) + ms;
    if (p.column === "PROGRESO") {
      addUnique(workerIds, p.assigneeId);
      startedAt ??= p.from;
    }
    if (p.column === "REVISION") addUnique(reviewerIds, p.assigneeId);
  }

  // Llegada a Listo: el inicio de la racha final de períodos en Listo. Un cambio de asignado
  // dentro de Listo abre otro período, pero no es una llegada nueva.
  let completedAt: Date | null = null;
  for (let i = periods.length - 1; i >= 0 && periods[i].column === "LISTO"; i--) completedAt = periods[i].from;

  return {
    columnMs,
    workerIds,
    reviewerIds,
    startedAt,
    completedAt,
    cycleMs: completedAt && startedAt ? completedAt.getTime() - startedAt.getTime() : null,
    leadMs: completedAt ? completedAt.getTime() - createdAt.getTime() : null,
  };
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * Duración de calendario en lenguaje humano, con dos unidades como máximo: "3 d 4 h",
 * "5 h 20 min", "45 min". Se redondea hacia abajo al minuto.
 */
export function formatDuration(ms: number): string {
  if (ms < MINUTE_MS) return "menos de 1 min";
  const days = Math.floor(ms / DAY_MS);
  const hours = Math.floor((ms % DAY_MS) / HOUR_MS);
  const minutes = Math.floor((ms % HOUR_MS) / MINUTE_MS);
  if (days > 0) return hours > 0 ? `${days} d ${hours} h` : `${days} d`;
  if (hours > 0) return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
  return `${minutes} min`;
}

/** Horas dedicadas (esfuerzo, no calendario): nunca pasa a días. "1 h 30 min", "30 h", "45 min". */
export function formatEffort(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest > 0 ? `${hours} h ${rest} min` : `${hours} h`;
}

/**
 * Tramo continuo en una columna: los períodos seguidos en la misma columna se juntan,
 * porque un cambio de asignado escribe una fila nueva sin que la tarea se mueva. `row` es
 * la fila que abrió el tramo (la entrada a la columna). Sirve para saber desde cuándo una
 * tarea está donde está y cuánto duró cada paso por una columna.
 */
export interface ColumnStint<T extends TaskTransitionRow = TaskTransitionRow> {
  column: KanbanColumn;
  from: Date;
  to: Date;
  open: boolean;
  row: T;
}

export function columnStints<T extends TaskTransitionRow>(rows: T[], now: Date): ColumnStint<T>[] {
  const sorted = [...rows].sort((a, b) => a.at.getTime() - b.at.getTime());
  const stints: ColumnStint<T>[] = [];
  for (const [i, row] of sorted.entries()) {
    const next = sorted[i + 1];
    const to = next ? next.at : now;
    const last = stints.at(-1);
    if (last && last.column === row.toColumn) {
      last.to = to;
      last.open = !next;
    } else {
      stints.push({ column: row.toColumn, from: row.at, to, open: !next, row });
    }
  }
  return stints;
}
