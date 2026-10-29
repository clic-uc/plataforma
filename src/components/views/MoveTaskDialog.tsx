"use client";

import { useState } from "react";
import type { KanbanColumn } from "@/generated/prisma/enums";
import { Modal } from "@/components/ui/Modal";
import { AssigneeAvatar } from "@/components/ui/Avatar";
import { useCurrentMember } from "@/components/providers/CurrentMemberProvider";
import { KANBAN_COLUMN_OPTIONS } from "@/lib/api/status";
import {
  taskMoveErrorMessage,
  useMoveTask,
  type ProjectTask,
  type ProjectTeamMember,
} from "@/lib/api/projects";
import { HoursPicker, parseTimeSpent } from "@/components/ui/HoursPicker";
import { planMove, type MovePlan } from "@/lib/task-move";
import { formatEffort } from "@/lib/task-history";

const columnLabel = Object.fromEntries(KANBAN_COLUMN_OPTIONS.map((opt) => [opt.value, opt.label])) as Record<
  KanbanColumn,
  string
>;

/**
 * "¿Cuántas horas le dedicaste?" al sacar una tarea de En progreso o En revisión. Opcional:
 * vacío no registra nada.
 */
export function TimeSpentField({
  kind,
  hours,
  onChange,
}: {
  kind: NonNullable<MovePlan["time"]>;
  hours: string;
  onChange: (hours: string) => void;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 text-sm font-semibold text-text-1">
        {kind === "TRABAJO" ? "¿Cuántas horas le dedicaste?" : "¿Cuántas horas te tomó revisarla?"}
      </legend>
      <p className="mb-2.5 text-xs text-text-3">
        Opcional. Quedan en tus horas de hoy en Tiempo, vinculadas a la tarea.
      </p>
      <HoursPicker hours={hours} onChange={onChange} />
    </fieldset>
  );
}

/**
 * Elegir asignado al mover: obligatorio al entrar a En progreso / En revisión sin nadie, o
 * reasignar a quien revisará al pasar a Por revisar ("Sin asignar" es la opción por defecto).
 */
function AssigneeChoice({
  question,
  to,
  team,
  value,
  onChange,
}: {
  question: NonNullable<MovePlan["assignee"]>;
  to: KanbanColumn;
  team: ProjectTeamMember[];
  value: string;
  onChange: (id: string) => void;
}) {
  const me = useCurrentMember();
  const legend =
    question === "reassign" ? "¿Quién la va a revisar?" : to === "REVISION" ? "¿Quién la revisa?" : "¿Quién la toma?";
  const hint =
    question === "reassign"
      ? "Puedes dejarla sin asignar para que la tome quien la revise."
      : `${columnLabel[to]} necesita a alguien asignado.`;
  const options: { id: string; person: ProjectTeamMember | null }[] = [
    ...(question === "reassign" ? [{ id: "", person: null }] : []),
    ...team.map((m) => ({ id: m.id, person: m })),
  ];

  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 text-sm font-semibold text-text-1">{legend}</legend>
      <p className="mb-2 text-xs text-text-3">{hint}</p>
      {team.length === 0 && question === "required" ? (
        <p className="text-sm text-text-2">
          El proyecto no tiene equipo todavía. Coordinación tiene que armarlo para poder asignar tareas.
        </p>
      ) : (
        <div className="max-h-56 overflow-y-auto rounded-md border border-border">
          {options.map(({ id, person }) => (
            <label
              key={id || "none"}
              className={`flex cursor-pointer items-center gap-2.5 border-b border-border px-3 py-2 text-sm last:border-b-0 ${
                value === id ? "bg-accent-dim text-text-1" : "text-text-2 hover:bg-surface-2"
              }`}
            >
              <input
                type="radio"
                name="move-assignee"
                className="accent-accent"
                checked={value === id}
                onChange={() => onChange(id)}
              />
              <AssigneeAvatar assignee={person} />
              <span className="min-w-0 flex-1 truncate">
                {person ? person.name : "Sin asignar"}
                {person?.id === me.id && <span className="text-text-3"> (tú)</span>}
              </span>
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}

/**
 * Pregunta lo que falta para mover una tarea (ver planMove en lib/task-move.ts) en una sola
 * ventana. Solo se abre si hay algo que preguntar; si no, quien la usa mueve directo.
 */
export function MoveTaskDialog({
  projectId,
  task,
  to,
  team,
  labelsToken,
  onClose,
}: {
  projectId: string;
  /** La tarea tal como estaba al empezar el arrastre. */
  task: ProjectTask;
  to: KanbanColumn;
  team: ProjectTeamMember[];
  /** Fijado al iniciar el arrastre. */
  labelsToken: string;
  onClose: () => void;
}) {
  const me = useCurrentMember();
  const [plan] = useState(() =>
    planMove({ from: task.columnValue, to, assigneeId: task.assignee?.id ?? null, moverId: me.id }),
  );
  // Al tomar una tarea sin asignado, lo más común es tomarla uno mismo.
  const [assigneeId, setAssigneeId] = useState(() =>
    plan.assignee === "required" && team.some((m) => m.id === me.id) ? me.id : "",
  );
  const [hours, setHours] = useState("");
  const move = useMoveTask(projectId);

  const time = parseTimeSpent(hours);
  const missingAssignee = plan.assignee === "required" && !assigneeId;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (missingAssignee || time.invalid) return;
    move.mutate(
      {
        task,
        column: to,
        labelsToken,
        assigneeId: plan.assignee ? assigneeId || null : undefined,
        timeSpent: plan.time && time.minutes ? { minutes: time.minutes } : undefined,
      },
      { onSuccess: onClose },
    );
  }

  const submitLabel = move.isPending
    ? "Moviendo…"
    : time.minutes
      ? `Mover y registrar ${formatEffort(time.minutes)}`
      : `Mover a ${columnLabel[to]}`;

  return (
    <Modal title={`Mover ${task.id} a ${columnLabel[to]}`} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <p className="mb-4 truncate text-sm text-text-2" title={task.name}>
          {task.name}
        </p>

        <div className="flex flex-col gap-5">
          {plan.assignee && (
            <AssigneeChoice question={plan.assignee} to={to} team={team} value={assigneeId} onChange={setAssigneeId} />
          )}
          {plan.time && <TimeSpentField kind={plan.time} hours={hours} onChange={setHours} />}
        </div>

        {move.isError && (
          <div className="modal-error mt-4">{taskMoveErrorMessage(move.error, "No se pudo mover la tarea. Intenta de nuevo.")}</div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={move.isPending || missingAssignee || time.invalid}>
            {submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
