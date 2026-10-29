import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { KanbanColumn } from "@/generated/prisma/enums";
import type { BadgeColor } from "@/lib/api/status";
import { assertOk } from "@/lib/api/http";
import type { ActivityItem, StandupStreak } from "@/lib/dashboard";

// Resumen del Dashboard de la persona que lo mira. Las horas y los eventos de
// "Tu semana" no van acá: se leen con las queries de tiempo y de eventos, así
// las mutaciones de esos módulos ya lo refrescan.

export type { ActivityItem } from "@/lib/dashboard";

export interface DashboardTask {
  /** Label, "T-03". */
  label: string;
  name: string;
  column: KanbanColumn;
}

/** Issues abiertos y cuántos de ellos no he revisado desde su última actividad. */
export interface DashboardIssueCount {
  open: number;
  unreviewed: number;
}

export interface DashboardProject {
  id: string;
  name: string;
  status: string;
  statusColor: BadgeColor;
  /** Mis tareas abiertas (no LISTO) en el proyecto, por label. */
  tasks: DashboardTask[];
  issues: DashboardIssueCount;
}

export interface NextMeeting {
  id: string;
  title: string;
  allDay: boolean;
  /** Instantes ISO, como en CalendarEventView. */
  startsAt: string;
  endsAt: string;
  /** Día ("YYYY-MM-DD") y hora ("18:00") de inicio en Chile; time es null si es de día completo. */
  day: string;
  time: string | null;
  project: { id: string; name: string } | null;
}

export interface DashboardSummary {
  /** Mis tareas sin terminar en proyectos no archivados. */
  tasks: { open: number; inReview: number };
  /** Suma de los issues de "Mis proyectos". */
  issues: DashboardIssueCount;
  streak: StandupStreak;
  nextMeeting: NextMeeting | null;
  /** Proyectos no archivados donde estoy en el equipo o tengo tareas abiertas. */
  projects: DashboardProject[];
  activity: ActivityItem[];
  /** Períodos míos en En progreso / En revisión ya terminados, sin horas registradas ni descartados. */
  pendingHours: PendingHours[];
}

/**
 * Un período en que fui el asignado de una tarea en una columna de trabajo, que ya terminó
 * (la tarea salió de la columna o se reasignó) en los últimos PENDING_HOURS_WINDOW_DAYS, sin
 * un TimeEntry mío vinculado (mismo taskId y kind, creado desde el inicio del período) y sin
 * descartar. Se resuelve registrando horas (POST de TimeEntry con taskId/kind, fecha =
 * `suggestedDate`) o descartando (POST /api/dashboard/pending-hours/[transitionId]/dismiss).
 */
export interface PendingHours {
  /** Fila de TaskTransition que abrió el período. */
  transitionId: string;
  /** Task.id */
  taskId: string;
  label: string;
  name: string;
  project: { id: string; name: string };
  kind: "TRABAJO" | "REVISION";
  /** Inicio y fin del período (ISO). */
  from: string;
  to: string;
  /** Día en Chile ("YYYY-MM-DD") en que terminó el período: fecha propuesta para las horas. */
  suggestedDate: string;
}

export const dashboardKeys = {
  all: ["dashboard"] as const,
  /** La semana va en la clave porque la racha y el StandUp dependen de ella. */
  summary: (weekStart: string) => [...dashboardKeys.all, weekStart] as const,
};

async function fetchDashboard(): Promise<DashboardSummary> {
  const res = await fetch("/api/dashboard");
  await assertOk(res, "No se pudo cargar el Dashboard");
  return res.json();
}

export function useDashboard(weekStart: string) {
  return useQuery({ queryKey: dashboardKeys.summary(weekStart), queryFn: fetchDashboard });
}

async function dismissPendingHoursRequest(transitionId: string): Promise<void> {
  const res = await fetch(`/api/dashboard/pending-hours/${transitionId}/dismiss`, { method: "POST" });
  await assertOk(res, "No se pudo descartar");
}

/** Quita un período de las horas por registrar en todas las semanas cacheadas del Dashboard. */
function dropPendingHours(queryClient: ReturnType<typeof useQueryClient>, transitionId: string) {
  queryClient.setQueriesData<DashboardSummary>({ queryKey: dashboardKeys.all }, (summary) =>
    summary && { ...summary, pendingHours: summary.pendingHours.filter((p) => p.transitionId !== transitionId) },
  );
}

/** Descartar un período: deja de aparecer sin registrar horas. */
export function useDismissPendingHours() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: dismissPendingHoursRequest,
    onSuccess: (_, transitionId) => {
      dropPendingHours(queryClient, transitionId);
      return queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
    },
  });
}

