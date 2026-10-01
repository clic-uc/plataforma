"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { TaskTypeTag } from "@/components/ui/TaskTypeTag";
import { useUpdateFeature, type ProjectFeature, type ProjectTask } from "@/lib/api/projects";

export function FeatureDetailModal({
  projectId,
  feature,
  tasks,
  onClose,
}: {
  projectId: string;
  feature: ProjectFeature;
  tasks: ProjectTask[];
  onClose: () => void;
}) {
  const [description, setDescription] = useState(feature.description ?? "");

  const mutation = useUpdateFeature(projectId);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    mutation.mutate({
      featureId: feature.id,
      input: {
        name: feature.name,
        priority: feature.priorityValue,
        status: feature.statusValue,
        description: description.trim() || null,
      },
    });
  }

  return (
    <Modal title={`${feature.id} — ${feature.name}`} onClose={onClose}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <Badge color={feature.statusColor}>{feature.status}</Badge>
        <span style={{ fontSize: 11, color: "var(--text-3)" }}>{feature.taskCount} tareas</span>
      </div>

      <div className="form-field">
        <div className="f-label">Tareas asociadas</div>
        {tasks.length === 0 ? (
          <div className="ph" style={{ height: 56 }}>
            <div className="ph-text">Sin tareas asociadas</div>
          </div>
        ) : (
          <div>
            {tasks.map((t) => (
              <div key={t.id} className="task-row">
                <div className="task-id">{t.id}</div>
                <div className={`task-name${t.done ? " done" : ""}`}>{t.name}</div>
                <TaskTypeTag type={t.type} />
              </div>
            ))}
          </div>
        )}
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
