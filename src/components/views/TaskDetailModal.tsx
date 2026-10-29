"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { TaskTypeTag } from "@/components/ui/TaskTypeTag";
import { AssigneeAvatar } from "@/components/ui/Avatar";
import { DifficultyMeter } from "@/components/ui/DifficultyMeter";
import { DescriptionEditor } from "@/components/views/DescriptionEditor";
import { LinkedIssuesField } from "@/components/views/LinkedIssuesField";
import { TaskHistory } from "@/components/views/TaskHistory";
import { taskToUpdateInput, useUpdateTask, type ProjectTask } from "@/lib/api/projects";
import { KANBAN_COLUMN_OPTIONS } from "@/lib/api/status";

const columnLabel = Object.fromEntries(KANBAN_COLUMN_OPTIONS.map((opt) => [opt.value, opt.label]));

export function TaskDetailModal({
  projectId,
  task,
  labelsToken: openedLabelsToken,
  onEdit,
  onClose,
}: {
  projectId: string;
  task: ProjectTask;
  labelsToken: string;
  /** Cierra el detalle y abre la edición (campos, columna, eliminar). */
  onEdit: () => void;
  onClose: () => void;
}) {
  // Se fija al abrir el modal: los labels que se editan acá salen de ese snapshot.
  const [labelsToken] = useState(openedLabelsToken);

  const mutation = useUpdateTask(projectId);

  function saveDescription(description: string | null, onDone: () => void) {
    mutation.mutate(
      { taskId: task.id, input: { ...taskToUpdateInput(task), description }, labelsToken },
      { onSuccess: onDone },
    );
  }

  return (
    <Modal title={`${task.id} — ${task.name}`} onClose={onClose}>
      <div className="modal-meta">
        <TaskTypeTag type={task.type} />
        <span>{columnLabel[task.columnValue]}</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <AssigneeAvatar assignee={task.assignee} />
          {task.assignee?.name ?? "Sin asignar"}
        </span>
        <DifficultyMeter difficulty={task.difficulty} withLabel />
        <button type="button" className="btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={onEdit}>
          Editar
        </button>
      </div>

      <LinkedIssuesField projectId={projectId} issues={task.issues} />

      <DescriptionEditor
        description={task.description}
        saving={mutation.isPending}
        error={mutation.error}
        onSave={saveDescription}
      />

      <TaskHistory task={task} />
    </Modal>
  );
}
