import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { assertOk } from "@/lib/api/http";
import { membersKeys } from "@/lib/api/members";

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
}

export interface TimeEntryInput {
  date: string;
  projectId: string;
  minutes: number;
  description: string;
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

// Las mutaciones invalidan todas las listas: el gráfico de la semana y el
// historial filtrado pueden contener el mismo registro.

export function useCreateTimeEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createTimeEntryRequest,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: timeEntriesKeys.all }),
  });
}

export function useUpdateTimeEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: TimeEntryInput }) => updateTimeEntryRequest(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: timeEntriesKeys.all }),
  });
}

export function useDeleteTimeEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteTimeEntryRequest,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: timeEntriesKeys.all }),
  });
}
