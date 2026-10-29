"use client";

import { useState } from "react";
import type { FeatureStatus, Priority } from "@/generated/prisma/enums";
import { Modal } from "@/components/ui/Modal";
import { errorMessage } from "@/lib/api/http";
import { FEATURE_STATUS_OPTIONS, PRIORITY_OPTIONS } from "@/lib/api/status";
import { useDeleteFeature, useUpdateFeature, type ProjectFeature } from "@/lib/api/projects";

export function EditFeatureModal({
  projectId,
  feature,
  labelsToken: openedLabelsToken,
  onClose,
}: {
  projectId: string;
  feature: ProjectFeature;
  labelsToken: string;
  onClose: () => void;
}) {
  // Se fija al abrir el modal: los labels que se editan acá salen de ese snapshot.
  const [labelsToken] = useState(openedLabelsToken);
  const [name, setName] = useState(feature.name);
  const [priority, setPriority] = useState<Priority>(feature.priorityValue);
  const [status, setStatus] = useState<FeatureStatus>(feature.statusValue);

  const mutation = useUpdateFeature(projectId);
  const deleteFeature = useDeleteFeature(projectId);

  // Mismo token fijado al abrir el detalle: si algo se renumeró desde entonces, el servidor responde 412.
  function handleDelete() {
    if (!window.confirm(`¿Eliminar ${feature.id} y sus ${feature.taskCount} tareas?`)) return;
    deleteFeature.mutate({ featureId: feature.id, labelsToken }, { onSuccess: onClose });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    mutation.mutate(
      { featureId: feature.id, input: { name, priority, status, description: feature.description }, labelsToken },
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

        {mutation.isError && (
          <div className="modal-error">{errorMessage(mutation.error, "No se pudo guardar. Intenta de nuevo.")}</div>
        )}
        {deleteFeature.isError && (
          <div className="modal-error">{errorMessage(deleteFeature.error, "No se pudo eliminar. Intenta de nuevo.")}</div>
        )}

        <div className="modal-footer" style={{ padding: 0, border: "none", marginTop: 4 }}>
          <button
            type="button"
            className="btn-text-danger"
            style={{ marginRight: "auto" }}
            disabled={deleteFeature.isPending}
            onClick={handleDelete}
          >
            {deleteFeature.isPending ? "Eliminando…" : "Eliminar feature"}
          </button>
          <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={mutation.isPending}>
            {mutation.isPending ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
