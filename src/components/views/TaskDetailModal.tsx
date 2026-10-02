"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { TaskTypeTag } from "@/components/ui/TaskTypeTag";
import { useUpdateTask, type ProjectTask } from "@/lib/api/projects";

export function TaskDetailModal({
  projectId,
  task,
  onClose,
}: {
  projectId: string;
  task: ProjectTask;
  onClose: () => void;
}) {
  const [description, setDescription] = useState(task.description ?? "");

  const mutation = useUpdateTask(projectId);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    mutation.mutate({
      taskId: task.id,
      input: {
        featureId: task.featureId,
        name: task.name,
        type: task.typeValue,
        column: task.columnValue,
        active: task.active,
        description: description.trim() || null,
      },
    });
  }

  return (
    <Modal title={`${task.id} — ${task.name}`} onClose={onClose}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <TaskTypeTag type={task.type} />
      </div>

      <form onSubmit={handleSubmit}>
        <div className="form-field">
          <div className="f-label">Descripción</div>
          <textarea
            className="field-textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Sin descripción"
          />
        </div>

        {mutation.isError && <div className="modal-error">No se pudo guardar. Intenta de nuevo.</div>}

        <div className="modal-footer" style={{ padding: 0, border: "none", marginTop: 4 }}>
          <button type="submit" className="btn-primary" disabled={mutation.isPending}>
            {mutation.isPending ? "Guardando…" : "Guardar descripción"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
