"use client";

import { useState } from "react";
import type { EventKind } from "@/generated/prisma/enums";
import { Modal } from "@/components/ui/Modal";
import { errorMessage } from "@/lib/api/http";
import { useProjects } from "@/lib/api/projects";
import { useCreateEvent, useUpdateEvent, type CalendarEventView, type UpdateEventInput } from "@/lib/api/events";
import { EVENT_KIND_OPTIONS } from "@/lib/api/status";
import {
  MAX_REPEAT_WEEKS,
  addDays,
  addWeeks,
  allDayToISO,
  isoToAllDay,
  isoToLocalDateTime,
  localDateTimeToISO,
  parseDayKey,
  toDayKey,
} from "@/lib/calendar";

const DEFAULT_REPEAT_WEEKS = 4;

interface EventFormValues {
  title: string;
  kind: EventKind;
  allDay: boolean;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  projectId: string;
  location: string;
  description: string;
}

function shiftDayKey(dayKey: string, days: number): string {
  return toDayKey(addDays(parseDayKey(dayKey), days));
}

/** Días entre dos claves "YYYY-MM-DD". */
function dayDiff(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / (24 * 60 * 60 * 1000));
}

/** Instante ISO de una fecha y hora del formulario, o null si alguno de los dos está a medio escribir. */
function toInstant(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  return localDateTimeToISO(date, time);
}

function EventForm({
  initial,
  allowRepeat,
  submitLabel,
  pendingLabel,
  isPending,
  serverError,
  onSubmit,
  onCancel,
}: {
  initial: EventFormValues;
  allowRepeat: boolean;
  submitLabel: string;
  pendingLabel: string;
  isPending: boolean;
  serverError: string | null;
  onSubmit: (input: UpdateEventInput, repeatWeeklyUntil: string | null) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial.title);
  const [kind, setKind] = useState<EventKind>(initial.kind);
  const [allDay, setAllDay] = useState(initial.allDay);
  const [startDate, setStartDate] = useState(initial.startDate);
  const [startTime, setStartTime] = useState(initial.startTime);
  const [endDate, setEndDate] = useState(initial.endDate);
  const [endTime, setEndTime] = useState(initial.endTime);
  const [projectId, setProjectId] = useState(initial.projectId);
  const [location, setLocation] = useState(initial.location);
  const [description, setDescription] = useState(initial.description);
  const [repeat, setRepeat] = useState(false);
  const [repeatUntil, setRepeatUntil] = useState(shiftDayKey(initial.startDate, DEFAULT_REPEAT_WEEKS * 7));
  const [formError, setFormError] = useState<string | null>(null);

  const { data: projects = [] } = useProjects();
  const projectOptions = projects
    .filter((p) => !p.archived || p.id === projectId)
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  /** Al mover el inicio, el fin se mueve con él y la duración se mantiene. */
  function changeStart(nextDate: string, nextTime: string) {
    if (allDay) {
      const span = dayDiff(startDate, endDate);
      if (nextDate && span >= 0) setEndDate(shiftDayKey(nextDate, span));
    } else {
      const prevStart = toInstant(startDate, startTime);
      const prevEnd = toInstant(endDate, endTime);
      const nextStart = toInstant(nextDate, nextTime);
      if (prevStart && prevEnd && nextStart) {
        const duration = Date.parse(prevEnd) - Date.parse(prevStart);
        const nextEnd = isoToLocalDateTime(new Date(Date.parse(nextStart) + Math.max(duration, 60 * 60 * 1000)).toISOString());
        setEndDate(nextEnd.date);
        setEndTime(nextEnd.time);
      }
    }
    if (nextDate !== startDate && repeatUntil < nextDate) setRepeatUntil(shiftDayKey(nextDate, DEFAULT_REPEAT_WEEKS * 7));
    setStartDate(nextDate);
    setStartTime(nextTime);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    let startsAt: string | null;
    let endsAt: string | null;
    if (allDay) {
      if (endDate < startDate) return setFormError("El último día no puede ser anterior al primero.");
      ({ startsAt, endsAt } = allDayToISO(startDate, endDate));
    } else {
      startsAt = toInstant(startDate, startTime);
      endsAt = toInstant(endDate, endTime);
      if (!startsAt || !endsAt) return setFormError("Completa la fecha y hora de inicio y fin.");
      if (endsAt <= startsAt) return setFormError("El fin tiene que ser posterior al inicio.");
    }
    setFormError(null);

    onSubmit(
      {
        title,
        kind,
        allDay,
        startsAt,
        endsAt,
        projectId: projectId || null,
        location: location.trim() || null,
        description: description.trim() || null,
      },
      allowRepeat && repeat ? repeatUntil : null,
    );
  }

  const error = formError ?? serverError;

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-field">
        <div className="f-label">Título</div>
        <input className="field-input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} autoFocus required />
      </div>

      <div className="field-row">
        <div className="form-field">
          <div className="f-label">Tipo</div>
          <select className="field-select" value={kind} onChange={(e) => setKind(e.target.value as EventKind)}>
            {EVENT_KIND_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div className="form-field field-checkbox-row" style={{ alignSelf: "end", height: 34 }}>
          <input type="checkbox" id="event-all-day" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
          <label htmlFor="event-all-day">Todo el día</label>
        </div>
      </div>

      <div className="form-field">
        <div className="f-label">{allDay ? "Primer día" : "Inicio"}</div>
        <div className="cal-datetime">
          <input
            type="date"
            className="field-input"
            value={startDate}
            onChange={(e) => changeStart(e.target.value, startTime)}
            required
          />
          {!allDay && (
            <input
              type="time"
              className="field-input"
              value={startTime}
              onChange={(e) => changeStart(startDate, e.target.value)}
              step={300}
              required
            />
          )}
        </div>
      </div>

      <div className="form-field">
        <div className="f-label">{allDay ? "Último día" : "Fin"}</div>
        <div className="cal-datetime">
          <input
            type="date"
            className="field-input"
            value={endDate}
            min={startDate}
            onChange={(e) => setEndDate(e.target.value)}
            required
          />
          {!allDay && (
            <input
              type="time"
              className="field-input"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              step={300}
              required
            />
          )}
        </div>
      </div>

      {allowRepeat && (
        <div className="form-field">
          <div className="field-checkbox-row">
            <input type="checkbox" id="event-repeat" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
            <label htmlFor="event-repeat">Repetir semanalmente</label>
          </div>
          {repeat && (
            <div className="cal-repeat-until">
              <span>hasta el</span>
              <input
                type="date"
                className="field-input"
                value={repeatUntil}
                min={startDate}
                max={toDayKey(addWeeks(parseDayKey(startDate), MAX_REPEAT_WEEKS))}
                onChange={(e) => setRepeatUntil(e.target.value)}
                required
              />
            </div>
          )}
          {repeat && (
            <div className="field-hint">
              Se crea una copia por semana (máximo {MAX_REPEAT_WEEKS}). Después cada una se edita o elimina por separado.
            </div>
          )}
        </div>
      )}

      <div className="form-field">
        <div className="f-label">Proyecto</div>
        <select className="field-select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">Sin proyecto</option>
          {projectOptions.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      <div className="form-field">
        <div className="f-label">Lugar</div>
        <input
          className="field-input"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Sala o link de videollamada"
        />
      </div>

      <div className="form-field">
        <div className="f-label">Descripción</div>
        <textarea className="field-textarea" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      {error && <div className="modal-error">{error}</div>}

      <div className="modal-footer" style={{ padding: 0, border: "none", marginTop: 4 }}>
        <button type="button" className="btn-ghost" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="btn-primary" disabled={isPending}>
          {isPending ? pendingLabel : submitLabel}
        </button>
      </div>
    </form>
  );
}

export function CreateEventModal({
  day,
  minutes,
  onClose,
}: {
  /** Día preseleccionado, "YYYY-MM-DD". */
  day: string;
  /** Hora de inicio en minutos desde medianoche; sin ella, un evento de día completo. */
  minutes?: number;
  onClose: () => void;
}) {
  const mutation = useCreateEvent();

  const allDay = minutes === undefined;
  const startTime = `${String(Math.floor((minutes ?? 9 * 60) / 60)).padStart(2, "0")}:${String((minutes ?? 0) % 60).padStart(2, "0")}`;
  const end = isoToLocalDateTime(new Date(Date.parse(localDateTimeToISO(day, startTime)) + 60 * 60 * 1000).toISOString());

  return (
    <Modal title="Nuevo evento" onClose={onClose}>
      <EventForm
        initial={{
          title: "",
          kind: "REUNION",
          allDay,
          startDate: day,
          startTime,
          endDate: allDay ? day : end.date,
          endTime: end.time,
          projectId: "",
          location: "",
          description: "",
        }}
        allowRepeat
        submitLabel="Crear evento"
        pendingLabel="Creando…"
        isPending={mutation.isPending}
        serverError={mutation.isError ? errorMessage(mutation.error, "No se pudo crear el evento. Intenta de nuevo.") : null}
        onSubmit={(input, repeatWeeklyUntil) => mutation.mutate({ ...input, repeatWeeklyUntil }, { onSuccess: onClose })}
        onCancel={onClose}
      />
    </Modal>
  );
}

export function EditEventModal({ event, onClose }: { event: CalendarEventView; onClose: () => void }) {
  const mutation = useUpdateEvent();

  const start = isoToLocalDateTime(event.startsAt);
  const end = isoToLocalDateTime(event.endsAt);
  const days = event.allDay ? isoToAllDay(event.startsAt, event.endsAt) : null;

  return (
    <Modal title="Editar evento" onClose={onClose}>
      <EventForm
        initial={{
          title: event.title,
          kind: event.kind,
          allDay: event.allDay,
          startDate: days?.first ?? start.date,
          startTime: event.allDay ? "09:00" : start.time,
          endDate: days?.last ?? end.date,
          endTime: event.allDay ? "10:00" : end.time,
          projectId: event.project?.id ?? "",
          location: event.location ?? "",
          description: event.description ?? "",
        }}
        allowRepeat={false}
        submitLabel="Guardar cambios"
        pendingLabel="Guardando…"
        isPending={mutation.isPending}
        serverError={mutation.isError ? errorMessage(mutation.error, "No se pudo guardar. Intenta de nuevo.") : null}
        onSubmit={(input) => mutation.mutate({ id: event.id, input }, { onSuccess: onClose })}
        onCancel={onClose}
      />
    </Modal>
  );
}
