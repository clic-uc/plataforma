"use client";

import { useState } from "react";
import type { TaskType } from "@/generated/prisma/enums";
import { Modal } from "@/components/ui/Modal";
import { TASK_TYPE_OPTIONS } from "@/lib/api/status";
import { errorMessage } from "@/lib/api/http";
import { useCreateTask, type ProjectFeature, type ProjectTeamMember } from "@/lib/api/projects";

export function CreateTaskModal({
  projectId,
  features,
  team,
  labelsToken: openedLabelsToken,
  onClose,
}: {
  projectId: string;
  features: ProjectFeature[];
  team: ProjectTeamMember[];
  labelsToken: string;
  onClose: () => void;
}) {
  // Se fija al abrir el modal: los labels que se editan acá salen de ese snapshot.
  const [labelsToken] = useState(openedLabelsToken);
  const [featureId, setFeatureId] = useState(features[0]?.id ?? "");
  const [name, setName] = useState("");
  const [type, setType] = useState<TaskType>("FEATURE");
  const [assigneeId, setAssigneeId] = useState("");

  const mutation = useCreateTask(projectId);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    mutation.mutate(
      {
        input: { featureId: featureId || null, assigneeId: assigneeId || null, name, type, column: "PENDIENTE" },
        labelsToken,
      },
      { onSuccess: onClose },
    );
  }

  return (
    <Modal title="Nueva tarea" onClose={onClose}>
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

        <div className="form-field">
          <div className="f-label">Tipo</div>
          <select className="field-select" value={type} onChange={(e) => setType(e.target.value as TaskType)}>
            {TASK_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div className="form-field">
          <div className="f-label">Asignada a</div>
          <select className="field-select" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">Sin asignar</option>
            {team.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          {team.length === 0 && (
            <div className="field-hint">Agrega personas al equipo del proyecto para poder asignar tareas.</div>
          )}
        </div>

        {mutation.isError && (
          <div className="modal-error">{errorMessage(mutation.error, "No se pudo crear la tarea. Intenta de nuevo.")}</div>
        )}

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
