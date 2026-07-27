"use client";

import { useState } from "react";
import type { ProjectStatus } from "@/generated/prisma/enums";
import { Modal } from "@/components/ui/Modal";
import { PROJECT_STATUS_OPTIONS } from "@/lib/api/status";
import { useUpdateProject, type ProjectDetail } from "@/lib/api/projects";

export function EditProjectModal({ project, onClose }: { project: ProjectDetail; onClose: () => void }) {
  const [name, setName] = useState(project.name);
  const [client, setClient] = useState(project.client);
  const [area, setArea] = useState(project.area);
  const [description, setDescription] = useState(project.description);
  const [status, setStatus] = useState<ProjectStatus>(project.statusValue);
  const [startDate, setStartDate] = useState(project.startDateISO);
  const [archived, setArchived] = useState(project.archived);

  const mutation = useUpdateProject(project.id);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    mutation.mutate(
      { name, client, area, description, status, startDate, archived },
      { onSuccess: onClose },
    );
  }

  return (
    <Modal title="Editar proyecto" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-field">
          <div className="f-label">Nombre</div>
          <input className="field-input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>

        <div className="field-row">
          <div className="form-field">
            <div className="f-label">Cliente</div>
            <input className="field-input" value={client} onChange={(e) => setClient(e.target.value)} required />
          </div>
          <div className="form-field">
            <div className="f-label">Área</div>
            <input className="field-input" value={area} onChange={(e) => setArea(e.target.value)} required />
          </div>
        </div>

        <div className="form-field">
          <div className="f-label">Descripción</div>
          <textarea
            className="field-textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </div>

        <div className="field-row">
          <div className="form-field">
            <div className="f-label">Estado</div>
            <select
              className="field-select"
              value={status}
              onChange={(e) => setStatus(e.target.value as ProjectStatus)}
            >
              {PROJECT_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <div className="f-label">Fecha de inicio</div>
            <input
              type="date"
              className="field-input"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="form-field field-checkbox-row">
          <input
            type="checkbox"
            id="edit-project-archived"
            checked={archived}
            onChange={(e) => setArchived(e.target.checked)}
          />
          <label htmlFor="edit-project-archived">Proyecto archivado</label>
        </div>

        {mutation.isError && <div className="modal-error">No se pudo guardar el proyecto. Intenta de nuevo.</div>}

        <div className="modal-footer" style={{ padding: 0, border: "none", marginTop: 4 }}>
          <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={mutation.isPending}>
            {mutation.isPending ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
