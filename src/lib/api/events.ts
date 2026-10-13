import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { EventKind } from "@/generated/prisma/enums";
import { assertOk } from "@/lib/api/http";

export interface CalendarEventView {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  kind: EventKind;
  allDay: boolean;
  /** Instante ISO. En los de día completo, medianoche UTC del primer día (ver lib/calendar.ts). */
  startsAt: string;
  /** Instante ISO, exclusivo. En los de día completo, medianoche UTC del día siguiente al último. */
  endsAt: string;
  /** Las copias de "repetir semanalmente" lo comparten; editar o borrar afecta solo a una. */
  seriesId: string | null;
  project: { id: string; name: string } | null;
  /** null si quien lo creó ya no es miembro. */
  createdBy: { id: string; name: string; initials: string } | null;
  /** Calculado en el servidor solo para esconder acciones; el servidor sigue rechazando con 403. */
  canEdit: boolean;
}

export interface UpdateEventInput {
  title: string;
  description: string | null;
  location: string | null;
  kind: EventKind;
  allDay: boolean;
  startsAt: string;
  endsAt: string;
  projectId: string | null;
}

export interface CreateEventInput extends UpdateEventInput {
  /** "YYYY-MM-DD", inclusive. Crea una copia por semana hasta esa fecha (máx. 26 semanas). */
  repeatWeeklyUntil: string | null;
}

export const eventsKeys = {
  all: ["events"] as const,
  range: (from: string, to: string) => [...eventsKeys.all, "range", from, to] as const,
};

async function fetchEvents(from: string, to: string): Promise<CalendarEventView[]> {
  const params = new URLSearchParams({ from, to });
  const res = await fetch(`/api/events?${params}`);
  await assertOk(res, "No se pudieron cargar los eventos");
  return res.json();
}

async function createEventRequest(input: CreateEventInput): Promise<CalendarEventView[]> {
  const res = await fetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  await assertOk(res, "No se pudo crear el evento");
  return res.json();
}

async function updateEventRequest(id: string, input: UpdateEventInput): Promise<CalendarEventView> {
  const res = await fetch(`/api/events/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  await assertOk(res, "No se pudo guardar el evento");
  return res.json();
}

async function deleteEventRequest(id: string): Promise<void> {
  const res = await fetch(`/api/events/${id}`, { method: "DELETE" });
  await assertOk(res, "No se pudo eliminar el evento");
}

/**
 * Eventos que se solapan con el rango visible (`to` exclusivo, ambos "YYYY-MM-DD").
 * keepPreviousData deja la grilla anterior mientras carga la siguiente, así que
 * navegar entre meses no parpadea.
 */
export function useEvents(from: string, to: string) {
  return useQuery({
    queryKey: eventsKeys.range(from, to),
    queryFn: () => fetchEvents(from, to),
    placeholderData: keepPreviousData,
  });
}

// Las mutaciones invalidan todos los rangos: un evento puede aparecer en varios
// (la vista mes y la semana se solapan) y parchar cada uno no compensa.

export function useCreateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createEventRequest,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: eventsKeys.all }),
  });
}

export function useUpdateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateEventInput }) => updateEventRequest(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: eventsKeys.all }),
  });
}

export function useDeleteEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteEventRequest,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: eventsKeys.all }),
  });
}
