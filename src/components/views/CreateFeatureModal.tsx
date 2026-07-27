"use client";

import { useState } from "react";
import type { Priority } from "@/generated/prisma/enums";
import { Modal } from "@/components/ui/Modal";
import { PRIORITY_OPTIONS } from "@/lib/api/status";
import { useCreateFeature } from "@/lib/api/projects";

export function CreateFeatureModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [name, setName] = useState("");
  const [priority, setPriority] = useState<Priority>("MEDIA");

  const mutation = useCreateFeature(projectId);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    mutation.mutate({ name, priority }, { onSuccess: onClose });
  }

  return (
    <Modal title="Nueva feature" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-field">
          <div className="f-label">Nombre</div>
          <input
            className="field-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            required
          />
        </div>

        <div className="form-field">
          <div className="f-label">Prioridad</div>
          <select
            className="field-select"
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
          >
            {PRIORITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {mutation.isError && <div className="modal-error">No se pudo crear la feature. Intenta de nuevo.</div>}

        <div className="modal-footer" style={{ padding: 0, border: "none", marginTop: 4 }}>
          <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={mutation.isPending}>
            {mutation.isPending ? "Creando…" : "Crear feature"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
