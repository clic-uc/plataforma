"use client";

import { useState } from "react";
import type { FeatureStatus, Priority } from "@/generated/prisma/enums";
import { Modal } from "@/components/ui/Modal";
import { FEATURE_STATUS_OPTIONS, PRIORITY_OPTIONS } from "@/lib/api/status";
import { useUpdateFeature, type ProjectFeature } from "@/lib/api/projects";

export function EditFeatureModal({
  projectId,
  feature,
  onClose,
}: {
  projectId: string;
  feature: ProjectFeature;
  onClose: () => void;
}) {
  const [name, setName] = useState(feature.name);
  const [priority, setPriority] = useState<Priority>(feature.priorityValue);
  const [status, setStatus] = useState<FeatureStatus>(feature.statusValue);

  const mutation = useUpdateFeature(projectId);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    mutation.mutate(
      { featureId: feature.id, input: { name, priority, status } },
      { onSuccess: onClose },
    );
  }

  return (
    <Modal title={`Editar ${feature.id}`} onClose={onClose}>
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

        <div className="field-row">
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
          <div className="form-field">
            <div className="f-label">Estado</div>
            <select
              className="field-select"
              value={status}
              onChange={(e) => setStatus(e.target.value as FeatureStatus)}
            >
              {FEATURE_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        {mutation.isError && <div className="modal-error">No se pudo guardar. Intenta de nuevo.</div>}

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
