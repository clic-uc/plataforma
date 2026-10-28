"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { errorMessage } from "@/lib/api/http";
import { useProjects } from "@/lib/api/projects";
import {
  useCreateTimeEntry,
  useDeleteTimeEntry,
  useUpdateTimeEntry,
  type TimeEntryInput,
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

/** Sin `entry` registra horas nuevas; con `entry` lo edita y permite eliminarlo. */
export function TimeEntryModal({ entry, onClose }: { entry?: TimeEntryView; onClose: () => void }) {
  // Se calcula al abrir, nunca en el render del servidor: el modal solo existe tras un clic.
  const [today] = useState(todayKey);
  const [date, setDate] = useState(entry?.date ?? today);
  const [hours, setHours] = useState(entry ? minutesToHoursInput(entry.minutes) : "");
  const [projectId, setProjectId] = useState(entry?.project.id ?? "");
  const [description, setDescription] = useState(entry?.description ?? "");
  const [hoursError, setHoursError] = useState(false);

  const { data: projects = [] } = useProjects();
  // Los archivados no se ofrecen, salvo el que ya tiene el registro que se edita.
  const options = projects
    .filter((p) => !p.archived || p.id === entry?.project.id)
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  const create = useCreateTimeEntry();
  const update = useUpdateTimeEntry();
  const remove = useDeleteTimeEntry();
  const save = entry ? update : create;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const minutes = hoursInputToMinutes(hours);
    setHoursError(minutes === null);
    if (minutes === null) return;

    const input: TimeEntryInput = { date, projectId, minutes, description };
    if (entry) update.mutate({ id: entry.id, input }, { onSuccess: onClose });
    else create.mutate(input, { onSuccess: onClose });
  }

  function handleDelete() {
    if (!entry || !window.confirm(`¿Eliminar el registro de ${entry.project.name}?`)) return;
    remove.mutate(entry.id, { onSuccess: onClose });
  }

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
          <div className="f-label">Proyecto</div>
          <select className="field-select" value={projectId} onChange={(e) => setProjectId(e.target.value)} required>
            <option value="" disabled>Selecciona un proyecto</option>
            {options.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div className="form-field">
          <div className="f-label">Descripción</div>
          <textarea
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
          <button type="submit" className="btn-primary" disabled={save.isPending}>
            {save.isPending ? "Guardando…" : entry ? "Guardar" : "Registrar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
