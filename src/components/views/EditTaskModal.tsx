"use client";

import { useState } from "react";
import type { KanbanColumn, TaskDifficulty, TaskType } from "@/generated/prisma/enums";
import { Modal } from "@/components/ui/Modal";
import { useCurrentMember } from "@/components/providers/CurrentMemberProvider";
import { TimeSpentField } from "@/components/views/MoveTaskDialog";
import { parseTimeSpent } from "@/components/ui/HoursPicker";
import { KANBAN_COLUMN_OPTIONS, TASK_DIFFICULTY_OPTIONS, TASK_TYPE_OPTIONS } from "@/lib/api/status";
import { errorMessage } from "@/lib/api/http";
import {
  taskMoveErrorMessage,
  useDeleteTask,
  useUpdateTask,
  type ProjectFeature,
  type ProjectTask,
  type ProjectTeamMember,
} from "@/lib/api/projects";
import { assigneeRequired, planMove } from "@/lib/task-move";

export function EditTaskModal({
  projectId,
  task,
  features,
  team,
  labelsToken: openedLabelsToken,
  onClose,
}: {
  projectId: string;
  task: ProjectTask;
  features: ProjectFeature[];
  team: ProjectTeamMember[];
  labelsToken: string;
  onClose: () => void;
}) {
  const me = useCurrentMember();
  // Se fija al abrir el modal: los labels que se editan acá salen de ese snapshot.
  const [labelsToken] = useState(openedLabelsToken);
  const [featureId, setFeatureId] = useState(task.featureId ?? "");
  const [name, setName] = useState(task.name);
  const [type, setType] = useState<TaskType>(task.typeValue);
  const [difficulty, setDifficulty] = useState<TaskDifficulty | "">(task.difficulty ?? "");
  const [column, setColumn] = useState<KanbanColumn>(task.columnValue);
  const [active, setActive] = useState(task.active);
  const [assigneeId, setAssigneeId] = useState(task.assignee?.id ?? "");
  const [hours, setHours] = useState("");

  const mutation = useUpdateTask(projectId);
  const deleteTask = useDeleteTask(projectId);

  // Lo mismo que pregunta el diálogo del kanban (lib/task-move.ts), pero dentro del formulario:
  // el asignado ya tiene su campo, y las horas aparecen solo si corresponden.
  const originalAssignee = task.assignee?.id ?? "";
  const planFor = (to: KanbanColumn) =>
    planMove({ from: task.columnValue, to, assigneeId: task.assignee?.id ?? null, moverId: me.id });
  const plan = planFor(column);
  const needsAssignee = assigneeRequired(task.columnValue, column, task.assignee?.id ?? null);
  const time = parseTimeSpent(hours);

  // De En progreso a Por revisar la tarea queda sin asignar por defecto (la toma quien la
  // revise), salvo que en el formulario ya se haya elegido a otra persona.
  function changeColumn(next: KanbanColumn) {
    const wasReassign = plan.assignee === "reassign";
    const isReassign = planFor(next).assignee === "reassign";
    if (isReassign && !wasReassign && assigneeId === originalAssignee) setAssigneeId("");
    if (wasReassign && !isReassign && assigneeId === "") setAssigneeId(originalAssignee);
    setColumn(next);
  }

  // Mismo token fijado al abrir el detalle: si algo se renumeró desde entonces, el servidor responde 412.
  function handleDelete() {
    if (!window.confirm(`¿Eliminar ${task.id}?`)) return;
    deleteTask.mutate({ taskId: task.id, labelsToken }, { onSuccess: onClose });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if ((needsAssignee && !assigneeId) || (plan.time && time.invalid)) return;
    mutation.mutate(
      {
        taskId: task.id,
        input: {
          featureId: featureId || null,
          assigneeId: assigneeId || null,
          name,
          type,
          column,
          active,
          description: task.description,
          difficulty: difficulty || null,
          ...(plan.time && time.minutes ? { timeSpent: { minutes: time.minutes } } : {}),
        },
        labelsToken,
      },
      { onSuccess: onClose },
    );
  }

  const columnName = KANBAN_COLUMN_OPTIONS.find((opt) => opt.value === column)?.label ?? "";
  const assigneeHint =
    needsAssignee && !assigneeId
      ? `${columnName} necesita a alguien asignado.`
      : plan.assignee === "reassign"
        ? "Elige quién la va a revisar, o déjala sin asignar para que la tome quien la revise."
        : null;

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
            <div className="f-label">Dificultad</div>
            <select
              className="field-select"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as TaskDifficulty | "")}
            >
              <option value="">Sin estimar</option>
              {TASK_DIFFICULTY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="field-row">
          <div className="form-field">
            <div className="f-label">Columna</div>
            <select className="field-select" value={column} onChange={(e) => changeColumn(e.target.value as KanbanColumn)}>
              {KANBAN_COLUMN_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <div className="f-label">Asignada a</div>
            <select
              className="field-select"
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              required={needsAssignee}
              aria-invalid={needsAssignee && !assigneeId}
            >
              <option value="">Sin asignar</option>
              {team.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
        </div>
        {team.length === 0 ? (
          <div className="-mt-2 mb-3.5 text-xs leading-snug text-text-3">Agrega personas al equipo del proyecto para poder asignar tareas.</div>
        ) : (
          assigneeHint && <div className="-mt-2 mb-3.5 text-xs leading-snug text-text-3">{assigneeHint}</div>
        )}

        {plan.time && (
          <div className="mb-4 border-t border-border pt-4">
            <TimeSpentField kind={plan.time} hours={hours} onChange={setHours} />
          </div>
        )}

        <div className="form-field field-checkbox-row">
          <input
            type="checkbox"
            id="edit-task-active"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          <label htmlFor="edit-task-active">Activa</label>
        </div>

        {mutation.isError && (
          <div className="modal-error">{taskMoveErrorMessage(mutation.error, "No se pudo guardar. Intenta de nuevo.")}</div>
        )}
        {deleteTask.isError && (
          <div className="modal-error">{errorMessage(deleteTask.error, "No se pudo eliminar. Intenta de nuevo.")}</div>
        )}

        <div className="modal-footer" style={{ padding: 0, border: "none", marginTop: 4 }}>
          <button
            type="button"
            className="btn-text-danger"
            style={{ marginRight: "auto" }}
            disabled={deleteTask.isPending}
            onClick={handleDelete}
          >
            {deleteTask.isPending ? "Eliminando…" : "Eliminar tarea"}
          </button>
          <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button
            type="submit"
            className="btn-primary"
            disabled={mutation.isPending || (needsAssignee && !assigneeId) || (!!plan.time && time.invalid)}
          >
            {mutation.isPending ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
