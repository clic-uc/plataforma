"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { TaskTypeTag } from "@/components/ui/TaskTypeTag";
import { AssigneeAvatar } from "@/components/ui/Avatar";
import { DescriptionEditor } from "@/components/views/DescriptionEditor";
import { LinkedIssuesField } from "@/components/views/LinkedIssuesField";
import { useUpdateFeature, type ProjectFeature, type ProjectTask } from "@/lib/api/projects";

export function FeatureDetailModal({
  projectId,
  feature,
  tasks,
  labelsToken: openedLabelsToken,
  onEdit,
  onClose,
}: {
  projectId: string;
  feature: ProjectFeature;
  tasks: ProjectTask[];
  labelsToken: string;
  /** Cierra el detalle y abre la edición (nombre, prioridad, estado, eliminar). */
  onEdit: () => void;
  onClose: () => void;
}) {
  // Se fija al abrir el modal: los labels que se editan acá salen de ese snapshot.
  const [labelsToken] = useState(openedLabelsToken);

  const mutation = useUpdateFeature(projectId);

  function saveDescription(description: string | null, onDone: () => void) {
    mutation.mutate(
      {
        featureId: feature.id,
        input: { name: feature.name, priority: feature.priorityValue, status: feature.statusValue, description },
        labelsToken,
      },
      { onSuccess: onDone },
    );
  }

  return (
    <Modal title={`${feature.id} — ${feature.name}`} onClose={onClose}>
      <div className="modal-meta">
        <Badge color={feature.statusColor}>{feature.status}</Badge>
        <span>Prioridad {feature.priority}</span>
        <span>{feature.taskCount} {feature.taskCount === 1 ? "tarea" : "tareas"}</span>
        <button type="button" className="btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={onEdit}>
          Editar
        </button>
      </div>

      <div className="form-field">
        <div className="f-label">Tareas asociadas</div>
        {tasks.length === 0 ? (
          <div className="empty-line">Ninguna tarea pertenece a esta feature todavía.</div>
        ) : (
          <div>
            {tasks.map((t) => (
              <div key={t.id} className="task-row">
                <div className="task-id">{t.id}</div>
                <div className={`task-name${t.done ? " done" : ""}`}>{t.name}</div>
                <TaskTypeTag type={t.type} />
                <AssigneeAvatar assignee={t.assignee} />
              </div>
            ))}
          </div>
        )}
      </div>

      <LinkedIssuesField projectId={projectId} issues={feature.issues} />

      <DescriptionEditor
        description={feature.description}
        saving={mutation.isPending}
        error={mutation.error}
        onSave={saveDescription}
      />
    </Modal>
  );
}
