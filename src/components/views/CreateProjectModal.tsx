"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProjectStatus } from "@/generated/prisma/enums";
import { Modal } from "@/components/ui/Modal";
import { toISODateInput } from "@/lib/api/format";
import { PROJECT_STATUS_OPTIONS } from "@/lib/api/status";
import { useCreateProject } from "@/lib/api/projects";

export function CreateProjectModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [area, setArea] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("PLANIFICACION");
  const [startDate, setStartDate] = useState(() => toISODateInput(new Date()));

  const mutation = useCreateProject();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    mutation.mutate(
      { name, client, area, description, status, startDate },
      { onSuccess: (created) => router.push(`/proyectos/${created.id}`) },
    );
  }

  return (
    <Modal title="Nuevo proyecto" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-field">
          <div className="f-label">Nombre</div>
          <input className="field-input" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
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

        {mutation.isError && <div className="modal-error">No se pudo crear el proyecto. Intenta de nuevo.</div>}

        <div className="modal-footer" style={{ padding: 0, border: "none", marginTop: 4 }}>
          <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={mutation.isPending}>
            {mutation.isPending ? "Creando…" : "Crear proyecto"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
