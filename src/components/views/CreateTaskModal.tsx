"use client";

import { useState } from "react";
import type { KanbanColumn, TaskType } from "@/generated/prisma/enums";
import { Modal } from "@/components/ui/Modal";
import { TASK_TYPE_OPTIONS } from "@/lib/api/status";
import { useCreateTask, type ProjectFeature } from "@/lib/api/projects";

export function CreateTaskModal({
  projectId,
  features,
  column,
  onClose,
}: {
  projectId: string;
  features: ProjectFeature[];
  column: KanbanColumn;
  onClose: () => void;
}) {
  const [featureId, setFeatureId] = useState(features[0]?.id ?? "");
  const [name, setName] = useState("");
  const [type, setType] = useState<TaskType>("FEATURE");

  const mutation = useCreateTask(projectId);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    mutation.mutate({ featureId, name, type, column }, { onSuccess: onClose });
  }

  if (features.length === 0) {
    return (
      <Modal title="Nueva tarea" onClose={onClose}>
        <div className="ph" style={{ height: 72 }}>
          <div className="ph-text">Primero crea una feature — las tareas se agrupan bajo una.</div>
        </div>
        <div className="modal-footer" style={{ padding: 0, border: "none", marginTop: 12 }}>
          <button type="button" className="btn-ghost" onClick={onClose}>Cerrar</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Nueva tarea" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-field">
          <div className="f-label">Feature</div>
          <select className="field-select" value={featureId} onChange={(e) => setFeatureId(e.target.value)}>
            {features.map((f) => (
              <option key={f.id} value={f.id}>{f.id} — {f.name}</option>
            ))}
          </select>
        </div>

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
          <div className="f-label">Tipo</div>
          <select className="field-select" value={type} onChange={(e) => setType(e.target.value as TaskType)}>
            {TASK_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {mutation.isError && <div className="modal-error">No se pudo crear la tarea. Intenta de nuevo.</div>}

        <div className="modal-footer" style={{ padding: 0, border: "none", marginTop: 4 }}>
          <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={mutation.isPending}>
            {mutation.isPending ? "Creando…" : "Crear tarea"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
