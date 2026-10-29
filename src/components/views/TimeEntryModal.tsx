"use client";

import { useState } from "react";
import type { TimeEntryKind } from "@/generated/prisma/enums";
import { Modal } from "@/components/ui/Modal";
import { errorMessage } from "@/lib/api/http";
import { useProjects } from "@/lib/api/projects";
import { KANBAN_COLUMN_OPTIONS } from "@/lib/api/status";
import {
  useCreateTimeEntry,
  useDeleteTimeEntry,
  useTimeEntryTaskOptions,
  useUpdateTimeEntry,
  type TimeEntryInput,
  type TimeEntryTaskOption,
  type TimeEntryView,
} from "@/lib/api/tiempo";
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_ENTRY_MINUTES,
  MINUTES_STEP,
  hoursInputToMinutes,
  minutesToHoursInput,
  todayKey,
} from "@/lib/tiempo";

const columnName = new Map(KANBAN_COLUMN_OPTIONS.map((o) => [o.value, o.label]));

type LinkedKind = Exclude<TimeEntryKind, "MANUAL">;

const KIND_OPTIONS: { value: LinkedKind; label: string }[] = [
  { value: "TRABAJO", label: "Trabajo" },
  { value: "REVISION", label: "Revisión" },
];

const byLabel = (a: TimeEntryTaskOption, b: TimeEntryTaskOption) =>
  a.label.localeCompare(b.label, "es", { numeric: true });

/** Las sin terminar primero (donde suelen ir las horas), luego las terminadas; cada grupo por label. */
function groupTaskOptions(options: TimeEntryTaskOption[]) {
  return {
    open: options.filter((t) => t.column !== "LISTO").sort(byLabel),
    done: options.filter((t) => t.column === "LISTO").sort(byLabel),
  };
}

/**
 * Sin `entry` registra horas nuevas; con `entry` lo edita y permite eliminarlo. Las horas se
 * pueden vincular a una tarea del proyecto, como trabajo o revisión (suman a las horas
 * dedicadas de la tarea); sin tarea son manuales.
 */
export function TimeEntryModal({ entry, onClose }: { entry?: TimeEntryView; onClose: () => void }) {
  // Se calcula al abrir, nunca en el render del servidor: el modal solo existe tras un clic.
  const [today] = useState(todayKey);
  const [date, setDate] = useState(entry?.date ?? today);
  const [hours, setHours] = useState(entry ? minutesToHoursInput(entry.minutes) : "");
  const [projectId, setProjectId] = useState(entry?.project.id ?? "");
  const [description, setDescription] = useState(entry?.description ?? "");
  const [hoursError, setHoursError] = useState(false);
  // Tarea y tipo elegidos a mano; undefined mientras no se tocan, y entonces se derivan del
  // registro que se edita (su tarea se reconoce por el label vigente cuando llegan las opciones).
  const [taskChoice, setTaskChoice] = useState<string | undefined>(undefined);
  const [kindChoice, setKindChoice] = useState<LinkedKind | undefined>(undefined);

  const { data: projects = [] } = useProjects();
  // Los archivados no se ofrecen, salvo el que ya tiene el registro que se edita.
  const options = projects
    .filter((p) => !p.archived || p.id === entry?.project.id)
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  const tasksQuery = useTimeEntryTaskOptions(projectId || null);
  const taskOptions = tasksQuery.data ?? [];
  const tasksLoading = !!projectId && tasksQuery.isPending;

  const entryTask = entry?.task && projectId === entry.project.id ? entry.task : null;
  const entryTaskId = entryTask ? (taskOptions.find((t) => t.label === entryTask.label)?.id ?? "") : "";
  const taskId = taskChoice ?? entryTaskId;
  const selectedTask = taskOptions.find((t) => t.id === taskId) ?? null;
  const kind: TimeEntryKind = !taskId
    ? "MANUAL"
    : (kindChoice ??
      (taskChoice === undefined && entry && entry.kind !== "MANUAL"
        ? entry.kind
        : selectedTask?.column === "REVISION"
          ? "REVISION"
          : "TRABAJO"));
  // Mientras no se sabe cuál es la tarea del registro, guardar lo desvincularía.
  const unresolvedEntryTask = !!entryTask && taskChoice === undefined && !tasksQuery.isSuccess;

  const create = useCreateTimeEntry();
  const update = useUpdateTimeEntry();
  const remove = useDeleteTimeEntry();
  const save = entry ? update : create;

  function changeProject(id: string) {
    setProjectId(id);
    // La tarea es del proyecto: al cambiarlo, el registro vuelve a ser manual.
    setTaskChoice("");
    setKindChoice(undefined);
  }

  function changeTask(id: string) {
    setTaskChoice(id);
    setKindChoice(undefined);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const minutes = hoursInputToMinutes(hours);
    setHoursError(minutes === null);
    if (minutes === null || unresolvedEntryTask) return;

    const input: TimeEntryInput = { date, projectId, minutes, description, taskId: taskId || null, kind };
    if (entry) update.mutate({ id: entry.id, input }, { onSuccess: onClose });
    else create.mutate(input, { onSuccess: onClose });
  }

  function handleDelete() {
    if (!entry || !window.confirm(`¿Eliminar el registro de ${entry.project.name}?`)) return;
    remove.mutate(entry.id, { onSuccess: onClose });
  }

  const groups = groupTaskOptions(taskOptions);

  return (
    <Modal title={entry ? "Editar registro" : "Registrar horas"} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="field-row">
          <div className="form-field">
            <div className="f-label">Fecha</div>
            <input
              type="date"
              className="field-input"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          <div className="form-field">
            <div className="f-label">Horas</div>
            <input
              type="number"
              className="field-input"
              value={hours}
              min={MINUTES_STEP / 60}
              max={MAX_ENTRY_MINUTES / 60}
              step={MINUTES_STEP / 60}
              placeholder="2.5"
              onChange={(e) => setHours(e.target.value)}
              autoFocus={!entry}
              required
            />
          </div>
        </div>
        {hoursError && <div className="field-hint" style={{ marginTop: -6, marginBottom: 10 }}>Las horas van en tramos de 15 minutos (0.25), hasta 24.</div>}

        <div className="form-field">
          <label className="f-label block" htmlFor="time-entry-project">Proyecto</label>
          <select
            id="time-entry-project"
            className="field-select"
            value={projectId}
            onChange={(e) => changeProject(e.target.value)}
            required
          >
            <option value="" disabled>Selecciona un proyecto</option>
            {options.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {projectId && (
          <div className="form-field">
            <label className="f-label block" htmlFor="time-entry-task">
              Tarea <span className="font-normal text-text-3">(opcional)</span>
            </label>
            {tasksQuery.isError ? (
              <p className="text-sm text-text-2">
                No se pudieron cargar las tareas.{" "}
                <button type="button" className="font-medium text-accent hover:underline" onClick={() => tasksQuery.refetch()}>
                  Reintentar
                </button>
              </p>
            ) : !tasksLoading && taskOptions.length === 0 ? (
              <p className="text-sm text-text-3">Este proyecto no tiene tareas. Las horas quedan sin vincular.</p>
            ) : (
              <select
                id="time-entry-task"
                className="field-select"
                value={tasksLoading ? "" : taskId}
                onChange={(e) => changeTask(e.target.value)}
                disabled={tasksLoading}
              >
                <option value="">{tasksLoading ? "Cargando tareas…" : "Sin tarea"}</option>
                {groups.open.length > 0 && (
                  <optgroup label="Sin terminar">
                    {groups.open.map((t) => (
                      <option key={t.id} value={t.id}>
                        {`${t.label} · ${t.name}${t.column === "PENDIENTE" ? "" : ` (${columnName.get(t.column)})`}`}
                      </option>
                    ))}
                  </optgroup>
                )}
                {groups.done.length > 0 && (
                  <optgroup label="Terminadas">
                    {groups.done.map((t) => (
                      <option key={t.id} value={t.id}>{`${t.label} · ${t.name}`}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            )}
          </div>
        )}

        {taskId && kind !== "MANUAL" && (
          <fieldset className="form-field min-w-0">
            <legend className="f-label">Tipo de horas</legend>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <div className="inline-flex rounded-md border border-border-dash bg-surface p-0.5">
                {KIND_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className="cursor-pointer rounded-sm px-3 py-1 text-sm text-text-2 transition-colors duration-100 hover:text-text-1 has-checked:bg-accent-dim has-checked:font-semibold has-checked:text-accent-ink has-focus-visible:outline-2 has-focus-visible:outline-accent"
                  >
                    <input
                      type="radio"
                      name="time-entry-kind"
                      className="sr-only"
                      checked={kind === opt.value}
                      onChange={() => setKindChoice(opt.value)}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
              <span className="text-xs text-text-3">Suman a las horas dedicadas de la tarea.</span>
            </div>
          </fieldset>
        )}

        <div className="form-field">
          <label className="f-label block" htmlFor="time-entry-description">Descripción</label>
          <textarea
            id="time-entry-description"
            className="field-textarea"
            value={description}
            maxLength={MAX_DESCRIPTION_LENGTH}
            placeholder="¿En qué trabajaste?"
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </div>

        {save.isError && <div className="modal-error">{errorMessage(save.error, "No se pudo guardar. Intenta de nuevo.")}</div>}
        {remove.isError && <div className="modal-error">{errorMessage(remove.error, "No se pudo eliminar. Intenta de nuevo.")}</div>}

        <div className="modal-footer" style={{ padding: 0, border: "none", marginTop: 4 }}>
          {entry && (
            <button
              type="button"
              className="btn-danger"
              style={{ marginRight: "auto" }}
              onClick={handleDelete}
              disabled={remove.isPending}
            >
              {remove.isPending ? "Eliminando…" : "Eliminar"}
            </button>
          )}
          <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={save.isPending || unresolvedEntryTask}>
            {save.isPending ? "Guardando…" : entry ? "Guardar" : "Registrar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
