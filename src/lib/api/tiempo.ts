import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { KanbanColumn, TimeEntryKind } from "@/generated/prisma/enums";
import { assertOk } from "@/lib/api/http";
import { membersKeys } from "@/lib/api/members";
import { projectsKeys } from "@/lib/api/projects";
import { dashboardKeys } from "@/lib/api/dashboard";

// StandUp semanal y registro de horas. Ambos son de la persona que los consulta:
// la API no expone los de otros miembros (los standups ajenos se ven en el perfil).

export interface StandupView {
  memberId: string;
  /** Lunes de la semana, "YYYY-MM-DD". */
  weekStart: string;
  text: string;
  learned: string | null;
  /** Instante ISO del último envío. */
  updatedAt: string;
}

export interface SaveStandupInput {
  /** La semana que el formulario mostraba: la actual o, en el cambio de semana, la anterior. */
  weekStart: string;
  text: string;
  learned: string | null;
}

export interface TimeEntryView {
  id: string;
  /** "YYYY-MM-DD" */
  date: string;
  minutes: number;
  description: string;
  project: { id: string; name: string };
  /** MANUAL, o TRABAJO/REVISION si salió de mover una tarea (UpdateTaskInput.timeSpent). */
  kind: TimeEntryKind;
  /**
   * Tarea de la que salen las horas, con su label vigente (los labels se renumeran; el de la
   * descripción es el del momento del registro). null si es manual o la tarea se borró.
   */
  task: { label: string; name: string } | null;
}

export interface TimeEntryInput {
  date: string;
  projectId: string;
  minutes: number;
  description: string;
  /**
   * Tarea del mismo proyecto a la que se vinculan las horas (Task.id, no el label: el id no se
   * renumera). Obligatorio en el body aunque sea null. Con tarea, `kind` es TRABAJO o REVISION;
   * sin tarea, MANUAL. Otra combinación, o una tarea de otro proyecto, es 400/422.
   */
  taskId: string | null;
  kind: TimeEntryKind;
}

/** Tarea elegible para vincular horas en /tiempo (GET /api/tiempo/tasks?projectId=). */
export interface TimeEntryTaskOption {
  /** Task.id */
  id: string;
  label: string;
  name: string;
  column: KanbanColumn;
}

export interface TimeEntryFilter {
  /** Lunes de la semana, o null para todas (las MAX_HISTORY_ENTRIES más recientes, ver lib/tiempo.ts). */
  week: string | null;
  projectId: string | null;
}

export const standupKeys = {
  all: ["standup"] as const,
  week: (weekStart: string) => [...standupKeys.all, weekStart] as const,
};

export const timeEntriesKeys = {
  all: ["time-entries"] as const,
  list: (filter: TimeEntryFilter) => [...timeEntriesKeys.all, filter.week ?? "todas", filter.projectId ?? "todos"] as const,
};

/** Tareas de un proyecto para vincular horas; no se invalida con las horas (no cambian por registrarlas). */
export const timeEntryTasksKeys = {
  all: ["time-entry-tasks"] as const,
  project: (projectId: string) => [...timeEntryTasksKeys.all, projectId] as const,
};

async function fetchStandup(weekStart: string): Promise<StandupView | null> {
  const res = await fetch(`/api/standup?${new URLSearchParams({ week: weekStart })}`);
  await assertOk(res, "No se pudo cargar el StandUp");
  return res.json();
}

async function saveStandupRequest(input: SaveStandupInput): Promise<StandupView> {
  const res = await fetch("/api/standup", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  await assertOk(res, "No se pudo enviar el StandUp");
  return res.json();
}

async function fetchTimeEntries(filter: TimeEntryFilter): Promise<TimeEntryView[]> {
  const params = new URLSearchParams();
  if (filter.week) params.set("week", filter.week);
  if (filter.projectId) params.set("projectId", filter.projectId);
  const res = await fetch(`/api/time-entries?${params}`);
  await assertOk(res, "No se pudieron cargar las horas");
  return res.json();
}

async function fetchTimeEntryTaskOptions(projectId: string): Promise<TimeEntryTaskOption[]> {
  const res = await fetch(`/api/tiempo/tasks?${new URLSearchParams({ projectId })}`);
  await assertOk(res, "No se pudieron cargar las tareas del proyecto");
  return res.json();
}

async function createTimeEntryRequest(input: TimeEntryInput): Promise<TimeEntryView> {
  const res = await fetch("/api/time-entries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  await assertOk(res, "No se pudieron registrar las horas");
  return res.json();
}

async function updateTimeEntryRequest(id: string, input: TimeEntryInput): Promise<TimeEntryView> {
  const res = await fetch(`/api/time-entries/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  await assertOk(res, "No se pudo guardar el registro");
  return res.json();
}

async function deleteTimeEntryRequest(id: string): Promise<void> {
  const res = await fetch(`/api/time-entries/${id}`, { method: "DELETE" });
  await assertOk(res, "No se pudo eliminar el registro");
}

export function useStandup(weekStart: string) {
  return useQuery({ queryKey: standupKeys.week(weekStart), queryFn: () => fetchStandup(weekStart) });
}

export function useSaveStandup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: saveStandupRequest,
    onSuccess: (standup) => {
      queryClient.setQueryData(standupKeys.week(standup.weekStart), standup);
      // El perfil lista los standups recientes.
      return queryClient.invalidateQueries({ queryKey: membersKeys.detail(standup.memberId) });
    },
  });
}

/** keepPreviousData deja la tabla anterior mientras carga la del filtro nuevo. */
export function useTimeEntries(filter: TimeEntryFilter) {
  return useQuery({
    queryKey: timeEntriesKeys.list(filter),
    queryFn: () => fetchTimeEntries(filter),
    placeholderData: keepPreviousData,
  });
}

/** Tareas del proyecto elegido en el formulario de horas; no consulta nada sin proyecto. */
export function useTimeEntryTaskOptions(projectId: string | null) {
  return useQuery({
    queryKey: timeEntryTasksKeys.project(projectId ?? ""),
    queryFn: () => fetchTimeEntryTaskOptions(projectId ?? ""),
    enabled: !!projectId,
  });
}

// Las mutaciones invalidan todas las listas: el gráfico de la semana y el
// historial filtrado pueden contener el mismo registro. También el Dashboard (las
// horas por registrar se resuelven con un registro vinculado a la tarea) y el
// detalle de los proyectos (las horas dedicadas de cada tarea suman las vinculadas).

function invalidateAfterTimeEntryChange(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: timeEntriesKeys.all }),
    queryClient.invalidateQueries({ queryKey: dashboardKeys.all }),
    queryClient.invalidateQueries({ queryKey: [...projectsKeys.all, "detail"] }),
  ]);
}

export function useCreateTimeEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createTimeEntryRequest,
    onSuccess: () => invalidateAfterTimeEntryChange(queryClient),
  });
}

export function useUpdateTimeEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: TimeEntryInput }) => updateTimeEntryRequest(id, input),
    onSuccess: () => invalidateAfterTimeEntryChange(queryClient),
  });
}

export function useDeleteTimeEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteTimeEntryRequest,
    onSuccess: () => invalidateAfterTimeEntryChange(queryClient),
  });
}
