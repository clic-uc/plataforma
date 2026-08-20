"use client";

import { useState } from "react";
import type { KanbanColumn, TaskType } from "@/generated/prisma/enums";
import { Modal } from "@/components/ui/Modal";
import { KANBAN_COLUMN_OPTIONS, TASK_TYPE_OPTIONS } from "@/lib/api/status";
import { useUpdateTask, type ProjectFeature, type ProjectTask } from "@/lib/api/projects";

export function EditTaskModal({
  projectId,
  task,
  features,
  onClose,
}: {
  projectId: string;
  task: ProjectTask;
  features: ProjectFeature[];
  onClose: () => void;
}) {
  const [featureId, setFeatureId] = useState(task.featureId ?? "");
  const [name, setName] = useState(task.name);
  const [type, setType] = useState<TaskType>(task.typeValue);
  const [column, setColumn] = useState<KanbanColumn>(task.columnValue);
  const [active, setActive] = useState(task.active);

  const mutation = useUpdateTask(projectId);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    mutation.mutate(
      {
        taskId: task.id,
        input: { featureId: featureId || null, name, type, column, active, description: task.description },
      },
      { onSuccess: onClose },
    );
  }

  return (
    <Modal title={`Editar ${task.id}`} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-field">
          <div className="f-label">Feature</div>
          <select className="field-select" value={featureId} onChange={(e) => setFeatureId(e.target.value)}>
            <option value="">Sin feature</option>
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

        <div className="field-row">
          <div className="form-field">
            <div className="f-label">Tipo</div>
            <select className="field-select" value={type} onChange={(e) => setType(e.target.value as TaskType)}>
              {TASK_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <div className="f-label">Columna</div>
            <select className="field-select" value={column} onChange={(e) => setColumn(e.target.value as KanbanColumn)}>
              {KANBAN_COLUMN_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-field field-checkbox-row">
          <input
            type="checkbox"
            id="edit-task-active"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          <label htmlFor="edit-task-active">Activa</label>
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
