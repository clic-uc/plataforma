"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { TaskTypeTag } from "@/components/ui/TaskTypeTag";
import { AssigneeAvatar } from "@/components/ui/Avatar";
import { DescriptionEditor } from "@/components/views/DescriptionEditor";
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

  const mutation = useUpdateTask(projectId);

  function saveDescription(description: string | null, onDone: () => void) {
    mutation.mutate(
      { taskId: task.id, input: { ...taskToUpdateInput(task), description }, labelsToken },
      { onSuccess: onDone },
    );
  }

  return (
    <Modal title={`${task.id} — ${task.name}`} onClose={onClose}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <TaskTypeTag type={task.type} />
        <AssigneeAvatar assignee={task.assignee} />
        <span style={{ fontSize: 11, color: "var(--text-3)" }}>{task.assignee?.name ?? "Sin asignar"}</span>
      </div>

      <DescriptionEditor
        description={task.description}
        saving={mutation.isPending}
        error={mutation.error}
        onSave={saveDescription}
      />
    </Modal>
  );
}
