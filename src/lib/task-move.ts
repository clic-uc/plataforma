import type { KanbanColumn } from "@/generated/prisma/enums";

/**
 * Qué preguntar al cambiar una tarea de columna (kanban o edición). El servidor impone las
 * reglas (ASSIGNEE_REQUIRED, TIME_NOT_ALLOWED); esto solo las anticipa para pedir lo que
 * falta en una sola ventana, o mover directo si no falta nada.
 */

/** Columnas que exigen asignado. Igual que WORK_COLUMNS de lib/api/projects.ts, sin depender del cliente. */
const WORK: readonly KanbanColumn[] = ["PROGRESO", "REVISION"];

export function isWorkColumn(column: KanbanColumn): boolean {
  return WORK.includes(column);
}

/**
 * Si la tarea, tal como quedaría, necesita asignado. Entrar a una columna de trabajo sin
 * asignado se rechaza, y también quitárselo estando en una; una tarea antigua que ya está ahí
 * sin asignado pasa mientras no cambie de columna (ni de asignado, que sigue siendo nadie).
 */
export function assigneeRequired(from: KanbanColumn, to: KanbanColumn, previousAssigneeId: string | null): boolean {
  if (!isWorkColumn(to)) return false;
  return from !== to || previousAssigneeId !== null;
}

export type MoveAssigneeQuestion =
  /** Va a una columna de trabajo sin asignado: hay que elegir a alguien. */
  | "required"
  /** De En progreso a Por revisar: reasignar a quien revisará, o dejarla sin asignar (por defecto). */
  | "reassign";

export interface MovePlan {
  assignee: MoveAssigneeQuestion | null;
  /** Ofrecer registrar horas: quien mueve es el asignado y la tarea sale de esta columna de trabajo. */
  time: "TRABAJO" | "REVISION" | null;
}

export interface MoveContext {
  from: KanbanColumn;
  to: KanbanColumn;
  assigneeId: string | null;
  moverId: string;
}

export function planMove({ from, to, assigneeId, moverId }: MoveContext): MovePlan {
  if (from === to) return { assignee: null, time: null };

  let assignee: MoveAssigneeQuestion | null = null;
  if (assigneeRequired(from, to, assigneeId) && assigneeId === null) assignee = "required";
  else if (from === "PROGRESO" && to === "REVISAR") assignee = "reassign";

  return { assignee, time: timeQuestion(from, to, assigneeId, moverId) };
}

/** Horas al sacar la tarea de una columna de trabajo, solo para quien la tenía asignada. */
export function timeQuestion(
  from: KanbanColumn,
  to: KanbanColumn,
  assigneeId: string | null,
  moverId: string,
): MovePlan["time"] {
  if (from === to || assigneeId === null || assigneeId !== moverId) return null;
  if (from === "PROGRESO") return "TRABAJO";
  if (from === "REVISION") return "REVISION";
  return null;
}

export function moveNeedsDialog(plan: MovePlan): boolean {
  return plan.assignee !== null || plan.time !== null;
}

/** Atajos del campo de horas, en minutos. */
export const TIME_SHORTCUTS = [30, 60, 120, 240] as const;
