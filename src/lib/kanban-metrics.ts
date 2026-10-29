import type { KanbanColumn, TaskDifficulty } from "@/generated/prisma/enums";
import type { AnalyticsMember } from "@/lib/analytics";
import { columnStints, type ColumnStint, type TaskTransitionRow } from "@/lib/task-history";
import { assignProjectSeries, todayKey, weekStartOf, type ChartSeries } from "@/lib/tiempo";

// Métricas del kanban para /analiticas (pestaña Kanban), sin React ni Prisma. Salen del
// historial de columnas (TaskTransition, ver src/lib/task-history.ts) y de las horas
// registradas al sacar una tarea de una columna de trabajo (TimeEntry.kind TRABAJO/REVISION).
//
// Medianas y percentil 85, no promedios: con pocas tareas, una que quedó olvidada un mes
// arrastra el promedio y deja de describir a las demás.
//
// Historia desconocida: la migración que creó TaskTransition le dio a cada tarea existente
// una fila inicial "ahora" con su columna de ese momento (fromColumn y byId null). Esa fila
// no dice cuándo entró la tarea a la columna, así que el tramo que abre no cuenta como
// duración, ni como llegada a Listo, ni como inicio del ciclo. Las filas que escribe la app
// siempre llevan byId (quien hizo el cambio); solo una fila de creación cuyo autor se
// borró después se confunde con una de la migración, y lo único que se pierde es esa tarea
// en las métricas.

/** Columnas de trabajo en curso: lo que se mira para el WIP y su envejecimiento. */
export const WIP_COLUMNS = ["PROGRESO", "REVISAR", "REVISION"] as const satisfies readonly KanbanColumn[];
export type WipColumn = (typeof WIP_COLUMNS)[number];

/** Columnas con tiempo de permanencia (Listo es el final, no una espera). */
export const DWELL_COLUMNS = ["PENDIENTE", "PROGRESO", "REVISAR", "REVISION"] as const satisfies readonly KanbanColumn[];

/** Orden de las filas por dificultad; null = sin estimar, al final. */
export const DIFFICULTY_ORDER: (TaskDifficulty | null)[] = ["BAJA", "MEDIA", "ALTA", null];

/** Bajo este número de muestras el percentil 85 no dice nada y no se calcula. */
export const MIN_P85_SAMPLE = 5;

export interface KanbanTransitionInput extends TaskTransitionRow {
  byId: string | null;
}

export interface KanbanTaskInput {
  id: string;
  label: string;
  name: string;
  projectId: string;
  column: KanbanColumn;
  difficulty: TaskDifficulty | null;
  createdAt: Date;
  assignee: AnalyticsMember | null;
  transitions: KanbanTransitionInput[];
}

export type EffortKind = "TRABAJO" | "REVISION";

/** Minutos registrados desde una tarea, de todas las personas y sin límite de fechas. */
export interface KanbanEffortInput {
  taskId: string;
  kind: EffortKind;
  minutes: number;
}

/** Minutos de TRABAJO/REVISION del rango por proyecto (por fecha del registro). */
export interface KanbanRangeHoursInput {
  projectId: string;
  kind: EffortKind;
  minutes: number;
}

export interface DurationStats {
  count: number;
  medianMs: number | null;
  /** null también con menos de MIN_P85_SAMPLE muestras. */
  p85Ms: number | null;
}

export interface ThroughputSeries extends Omit<ChartSeries, "minutes"> {
  count: number;
}

export interface ThroughputWeek {
  week: string;
  total: number;
  /** En el orden de `series`, solo las que tienen tareas esa semana. */
  segments: { key: string; count: number }[];
}

export interface CycleRow {
  completed: number;
  cycle: DurationStats;
  lead: DurationStats;
  /** Mediana de horas dedicadas por tarea terminada, entre las que tienen horas registradas. */
  effortMedianMinutes: number | null;
  /** Terminadas con al menos un registro de horas. */
  withEffort: number;
}

export interface ProjectCycleRow extends CycleRow {
  id: string;
  name: string;
  /** Horas registradas desde tareas en el rango (por fecha del registro). */
  workedMinutes: number;
  reviewedMinutes: number;
}

export interface DifficultyCycleRow extends CycleRow {
  difficulty: TaskDifficulty | null;
}

export interface WipTask {
  id: string;
  label: string;
  name: string;
  project: { id: string; name: string };
  column: WipColumn;
  difficulty: TaskDifficulty | null;
  assignee: AnalyticsMember | null;
  /** Entrada a la columna actual (ISO). Si `sinceKnown` es false, es el inicio del historial: estaba ahí desde antes. */
  since: string;
  sinceKnown: boolean;
  ageMs: number;
}

export interface KanbanReport {
  weeks: string[];
  currentWeek: string;
  /** Proyecto filtrado, o null para todos. */
  projectId: string | null;
  /** Proyectos sin archivar, para el filtro (no dependen del filtro). */
  projects: { id: string; name: string }[];
  /** Desde cuándo hay historial (ISO): la fila más antigua que puso la migración. null si no hay. */
  historySince: string | null;
  throughput: { series: ThroughputSeries[]; weeks: ThroughputWeek[]; total: number };
  overall: CycleRow;
  /** Proyectos del filtro, por nombre; incluye los que no terminaron nada. */
  byProject: ProjectCycleRow[];
  byDifficulty: DifficultyCycleRow[];
  /** Cada paso por una columna que terminó (la tarea salió) dentro del rango, con entrada conocida. */
  columns: { column: (typeof DWELL_COLUMNS)[number]; stats: DurationStats }[];
  /** Tareas hoy en curso, las que llevan más tiempo en su columna primero. */
  wip: WipTask[];
  wipByColumn: Record<WipColumn, number>;
  workedMinutes: number;
  reviewedMinutes: number;
}

// ─── Estadística ───

/** Percentil con interpolación lineal entre rangos (el "tipo 7" de R y de las planillas). */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

export function durationStats(values: number[]): DurationStats {
  return {
    count: values.length,
    medianMs: percentile(values, 0.5),
    p85Ms: values.length >= MIN_P85_SAMPLE ? percentile(values, 0.85) : null,
  };
}

// ─── Historia de una tarea ───

/** Fila puesta por la migración: no se sabe cuándo entró la tarea a esa columna. */
export function isBackfillRow(row: KanbanTransitionInput): boolean {
  return row.fromColumn === null && row.byId === null;
}

export interface TaskFlow {
  stints: ColumnStint<KanbanTransitionInput>[];
  /** Llegada a Listo, si está en Listo y se sabe cuándo llegó. */
  completedAt: Date | null;
  /** Primera entrada conocida a En progreso. null si no pasó por ahí o si ya estaba al empezar el historial. */
  startedAt: Date | null;
  cycleMs: number | null;
  /** null si la tarea es anterior al historial (su createdAt es el de la migración). */
  leadMs: number | null;
}

export function taskFlow(task: Pick<KanbanTaskInput, "createdAt" | "transitions">, now: Date): TaskFlow {
  const stints = columnStints(task.transitions, now);
  const known = (s: ColumnStint<KanbanTransitionInput>) => !isBackfillRow(s.row);

  const last = stints.at(-1);
  const completedAt = last?.column === "LISTO" && known(last) ? last.from : null;

  const firstProgress = stints.find((s) => s.column === "PROGRESO");
  const startedAt = firstProgress && known(firstProgress) ? firstProgress.from : null;

  const createdKnown = stints.length > 0 && known(stints[0]);

  return {
    stints,
    completedAt,
    startedAt,
    cycleMs: completedAt && startedAt ? completedAt.getTime() - startedAt.getTime() : null,
    leadMs: completedAt && createdKnown ? completedAt.getTime() - task.createdAt.getTime() : null,
  };
}

/** Lunes (en Chile) de la semana de un instante. */
export function weekOfInstant(instant: Date): string {
  return weekStartOf(todayKey(instant));
}

// ─── Reporte ───

function cycleRow(flows: { flow: TaskFlow; effort: number }[]): CycleRow {
  const cycles = flows.flatMap(({ flow }) => (flow.cycleMs === null ? [] : [flow.cycleMs]));
  const leads = flows.flatMap(({ flow }) => (flow.leadMs === null ? [] : [flow.leadMs]));
  // Registrar horas al mover es opcional: una tarea sin horas no costó cero, simplemente no se anotó.
  const efforts = flows.flatMap(({ effort }) => (effort > 0 ? [effort] : []));
  return {
    completed: flows.length,
    cycle: durationStats(cycles),
    lead: durationStats(leads),
    effortMedianMinutes: percentile(efforts, 0.5),
    withEffort: efforts.length,
  };
}

/**
 * Arma la pestaña Kanban. `tasks` son las del filtro (proyectos sin archivar y, si hay,
 * el proyecto elegido) que siguen abiertas o llegaron a Listo dentro del rango; las que
 * terminaron antes no aportan nada. `weeks` va de la más antigua a la actual.
 */
export function buildKanbanReport(input: {
  weeks: string[];
  now: Date;
  projectId: string | null;
  projects: { id: string; name: string }[];
  tasks: KanbanTaskInput[];
  effort: KanbanEffortInput[];
  rangeHours: KanbanRangeHoursInput[];
}): KanbanReport {
  const { weeks, now } = input;
  const weekIndex = new Map(weeks.map((w, i) => [w, i]));
  const inRange = (d: Date) => weekIndex.has(weekOfInstant(d));
  const projectName = new Map(input.projects.map((p) => [p.id, p.name]));
  const visibleProjects = input.projects
    .filter((p) => input.projectId === null || p.id === input.projectId)
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  const effortByTask = new Map<string, number>();
  for (const e of input.effort) effortByTask.set(e.taskId, (effortByTask.get(e.taskId) ?? 0) + e.minutes);

  const flows = input.tasks.map((task) => ({ task, flow: taskFlow(task, now), effort: effortByTask.get(task.id) ?? 0 }));
  const completed = flows.filter(({ flow }) => flow.completedAt && inRange(flow.completedAt));

  // Throughput por semana, apilado por proyecto con los colores de src/lib/tiempo.ts.
  // assignProjectSeries suma "minutos": acá cada tarea pesa 1.
  const { series, seriesKey } = assignProjectSeries(
    completed.map(({ task }) => ({ minutes: 1, project: { id: task.projectId, name: projectName.get(task.projectId) ?? "Proyecto" } })),
  );
  const perWeek = weeks.map(() => new Map<string, number>());
  for (const { task, flow } of completed) {
    const counts = perWeek[weekIndex.get(weekOfInstant(flow.completedAt!))!];
    const key = seriesKey(task.projectId);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  // Pasos por una columna que terminaron dentro del rango, con entrada conocida.
  const dwell = new Map<KanbanColumn, number[]>(DWELL_COLUMNS.map((c) => [c, []]));
  for (const { flow } of flows) {
    for (const s of flow.stints) {
      if (s.open || isBackfillRow(s.row) || !inRange(s.to)) continue;
      dwell.get(s.column)?.push(s.to.getTime() - s.from.getTime());
    }
  }

  const wip: WipTask[] = flows
    .filter(({ task }) => (WIP_COLUMNS as readonly KanbanColumn[]).includes(task.column))
    .map(({ task, flow }) => {
      const current = flow.stints.at(-1);
      // Si el historial no coincide con la columna (no debería pasar), se cuenta desde la creación.
      const stint = current?.column === task.column ? current : null;
      const since = stint?.from ?? task.createdAt;
      return {
        id: task.id,
        label: task.label,
        name: task.name,
        project: { id: task.projectId, name: projectName.get(task.projectId) ?? "Proyecto" },
        column: task.column as WipColumn,
        difficulty: task.difficulty,
        assignee: task.assignee,
        since: since.toISOString(),
        sinceKnown: stint !== null && !isBackfillRow(stint.row),
        ageMs: Math.max(0, now.getTime() - since.getTime()),
      };
    })
    .sort((a, b) => b.ageMs - a.ageMs || a.label.localeCompare(b.label, "es"));

  const hoursOf = (projectId: string, kind: EffortKind) =>
    input.rangeHours.filter((h) => h.projectId === projectId && h.kind === kind).reduce((sum, h) => sum + h.minutes, 0);

  const byProject = visibleProjects.map(
    (p): ProjectCycleRow => ({
      id: p.id,
      name: p.name,
      ...cycleRow(completed.filter(({ task }) => task.projectId === p.id)),
      workedMinutes: hoursOf(p.id, "TRABAJO"),
      reviewedMinutes: hoursOf(p.id, "REVISION"),
    }),
  );

  const backfill = input.tasks.flatMap((t) => t.transitions.filter(isBackfillRow).map((r) => r.at.getTime()));

  return {
    weeks,
    currentWeek: weeks[weeks.length - 1],
    projectId: input.projectId,
    projects: [...input.projects].sort((a, b) => a.name.localeCompare(b.name, "es")),
    historySince: backfill.length > 0 ? new Date(Math.min(...backfill)).toISOString() : null,
    throughput: {
      series: series.map(({ minutes, ...s }) => ({ ...s, count: minutes })),
      weeks: weeks.map((week, i) => {
        const segments = series.filter((s) => perWeek[i].has(s.key)).map((s) => ({ key: s.key, count: perWeek[i].get(s.key)! }));
        return { week, total: segments.reduce((sum, s) => sum + s.count, 0), segments };
      }),
      total: completed.length,
    },
    overall: cycleRow(completed),
    byProject,
    byDifficulty: DIFFICULTY_ORDER.map((difficulty) => ({
      difficulty,
      ...cycleRow(completed.filter(({ task }) => task.difficulty === difficulty)),
    })),
    columns: DWELL_COLUMNS.map((column) => ({ column, stats: durationStats(dwell.get(column)!) })),
    wip,
    wipByColumn: {
      PROGRESO: wip.filter((t) => t.column === "PROGRESO").length,
      REVISAR: wip.filter((t) => t.column === "REVISAR").length,
      REVISION: wip.filter((t) => t.column === "REVISION").length,
    },
    workedMinutes: byProject.reduce((sum, p) => sum + p.workedMinutes, 0),
    reviewedMinutes: byProject.reduce((sum, p) => sum + p.reviewedMinutes, 0),
  };
}
