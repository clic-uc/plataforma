import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { assertOk } from "@/lib/api/http";
import type { ActivityReport, ProjectsReport, RangeWeeks, TeamReport, WeekStandups } from "@/lib/analytics";
import type { KanbanReport } from "@/lib/kanban-metrics";

// Analíticas de coordinación (/analiticas). Solo lectura y solo COORDINACION: la
// API responde 403 FORBIDDEN_ROLE a cualquier otro rol. Los tipos y las
// agregaciones viven en src/lib/analytics.ts.

export type { ActivityReport, KanbanReport, ProjectsReport, TeamReport, WeekStandups };

export const analyticsKeys = {
  all: ["analytics"] as const,
  /** `currentWeek` lo fija el servidor en hora de Chile, para que la clave prefetcheada coincida. */
  activity: (currentWeek: string, weeks: RangeWeeks) => [...analyticsKeys.all, "activity", currentWeek, weeks] as const,
  standups: (week: string) => [...analyticsKeys.all, "standups", week] as const,
  projects: () => [...analyticsKeys.all, "projects"] as const,
  team: () => [...analyticsKeys.all, "team"] as const,
  /** `projectId` null = todos los proyectos sin archivar. */
  kanban: (currentWeek: string, weeks: RangeWeeks, projectId: string | null) =>
    [...analyticsKeys.all, "kanban", currentWeek, weeks, projectId] as const,
};

async function getJson<T>(url: string, message: string): Promise<T> {
  const res = await fetch(url);
  await assertOk(res, message);
  return res.json();
}

/** keepPreviousData deja la grilla anterior mientras carga el rango nuevo. */
export function useActivityReport(currentWeek: string, weeks: RangeWeeks) {
  return useQuery({
    queryKey: analyticsKeys.activity(currentWeek, weeks),
    queryFn: () => getJson<ActivityReport>(`/api/analytics/activity?weeks=${weeks}`, "No se pudieron cargar las horas"),
    placeholderData: keepPreviousData,
  });
}

export function useWeekStandups(week: string) {
  return useQuery({
    queryKey: analyticsKeys.standups(week),
    queryFn: () =>
      getJson<WeekStandups>(`/api/analytics/standups?${new URLSearchParams({ week })}`, "No se pudieron cargar los StandUps"),
    placeholderData: keepPreviousData,
  });
}

export function useProjectsReport() {
  return useQuery({
    queryKey: analyticsKeys.projects(),
    queryFn: () => getJson<ProjectsReport>("/api/analytics/projects", "No se pudieron cargar los proyectos"),
  });
}

export function useTeamReport() {
  return useQuery({
    queryKey: analyticsKeys.team(),
    queryFn: () => getJson<TeamReport>("/api/analytics/team", "No se pudo cargar el equipo"),
  });
}

export function useKanbanReport(currentWeek: string, weeks: RangeWeeks, projectId: string | null) {
  return useQuery({
    queryKey: analyticsKeys.kanban(currentWeek, weeks, projectId),
    queryFn: () => {
      const params = new URLSearchParams({ weeks: String(weeks) });
      if (projectId) params.set("project", projectId);
      return getJson<KanbanReport>(`/api/analytics/kanban?${params}`, "No se pudieron cargar las métricas del kanban");
    },
    placeholderData: keepPreviousData,
  });
}
