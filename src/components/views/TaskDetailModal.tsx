"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { TaskTypeTag } from "@/components/ui/TaskTypeTag";
import { AssigneeAvatar } from "@/components/ui/Avatar";
import { errorMessage } from "@/lib/api/http";
import { taskToUpdateInput, useUpdateTask, type ProjectTask } from "@/lib/api/projects";

export function TaskDetailModal({
  projectId,
  task,
  labelsToken: openedLabelsToken,
  onClose,
}: {
  projectId: string;
  task: ProjectTask;
  labelsToken: string;
  onClose: () => void;
}) {
  // Se fija al abrir el modal: los labels que se editan acá salen de ese snapshot.
  const [labelsToken] = useState(openedLabelsToken);
  const [description, setDescription] = useState(task.description ?? "");

  const mutation = useUpdateTask(projectId);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    mutation.mutate({
      taskId: task.id,
      input: { ...taskToUpdateInput(task), description: description.trim() || null },
      labelsToken,
    });
  }

  return (
    <Modal title={`${task.id} — ${task.name}`} onClose={onClose}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <TaskTypeTag type={task.type} />
        <AssigneeAvatar assignee={task.assignee} />
        <span style={{ fontSize: 11, color: "var(--text-3)" }}>{task.assignee?.name ?? "Sin asignar"}</span>
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

        {mutation.isError && (
          <div className="modal-error">{errorMessage(mutation.error, "No se pudo guardar. Intenta de nuevo.")}</div>
        )}

        <div className="modal-footer" style={{ padding: 0, border: "none", marginTop: 4 }}>
          <button type="submit" className="btn-primary" disabled={mutation.isPending}>
            {mutation.isPending ? "Guardando…" : "Guardar descripción"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
