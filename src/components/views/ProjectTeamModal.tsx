"use client";

import { useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/ui/Modal";
import { errorMessage } from "@/lib/api/http";
import { useMembers } from "@/lib/api/members";
import {
  useAddProjectMember,
  useRemoveProjectMember,
  type ProjectDetail,
  type ProjectTeamMember,
} from "@/lib/api/projects";
import { useIsCoordinacion } from "@/components/providers/CurrentMemberProvider";

export function ProjectTeamModal({ project, onClose }: { project: ProjectDetail; onClose: () => void }) {
  const isCoordinacion = useIsCoordinacion();
  const { data: members = [] } = useMembers({ enabled: isCoordinacion });
  const [memberId, setMemberId] = useState("");

  const add = useAddProjectMember(project.id);
  const remove = useRemoveProjectMember(project.id);
  const error = add.error ?? remove.error;

  const candidates = members.filter((m) => !project.team.some((t) => t.id === m.id));

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    add.mutate({ memberId }, { onSuccess: () => setMemberId("") });
  }

  function handleRemove(member: ProjectTeamMember) {
    const assigned = project.tasks.filter((t) => t.assignee?.id === member.id).length;
    const detail = assigned > 0 ? ` Se le desasignarán ${assigned} ${assigned === 1 ? "tarea" : "tareas"}.` : "";
    if (!window.confirm(`¿Quitar a ${member.name} del equipo?${detail}`)) return;
    remove.mutate(member.id);
  }

  return (
    <Modal title={`Equipo — ${project.name}`} onClose={onClose}>
      <div className="form-field">
        <div className="f-label">Miembros</div>
        {project.team.length === 0 ? (
          <p className="empty-line">Este proyecto aún no tiene equipo. Sin equipo no se pueden asignar tareas.</p>
        ) : (
          project.team.map((m) => (
            <TeamRow
              key={m.id}
              member={m}
              editable={isCoordinacion}
              removing={remove.isPending && remove.variables === m.id}
              onRemove={() => handleRemove(m)}
            />
          ))
        )}
      </div>

      {isCoordinacion && (
        <form onSubmit={handleAdd}>
          <div className="form-field">
            <div className="f-label">Agregar persona</div>
            <select className="field-select" value={memberId} onChange={(e) => setMemberId(e.target.value)} required>
              <option value="" disabled>
                {candidates.length === 0 ? "No quedan miembros por agregar" : "Elegir miembro…"}
              </option>
              {candidates.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          {error && <div className="modal-error">{errorMessage(error, "No se pudo actualizar el equipo. Intenta de nuevo.")}</div>}

          <div className="modal-footer" style={{ padding: 0, border: "none", marginTop: 4 }}>
            <button type="button" className="btn-ghost" onClick={onClose}>Cerrar</button>
            <button type="submit" className="btn-primary" disabled={add.isPending || !memberId}>
              {add.isPending ? "Agregando…" : "Agregar al equipo"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function TeamRow({
  member,
  editable,
  removing,
  onRemove,
}: {
  member: ProjectTeamMember;
  editable: boolean;
  removing: boolean;
  onRemove: () => void;
}) {
  return (
    <div className="task-row">
      <div className="task-ava accent-ava">{member.initials}</div>
      <Link href={`/miembros/${member.id}`} className="task-name">{member.name}</Link>
      {editable && (
        <button
          type="button"
          className="text-xs font-medium text-danger hover:underline disabled:opacity-50"
          disabled={removing}
          onClick={onRemove}
        >
          {removing ? "Quitando…" : "Quitar"}
        </button>
      )}
    </div>
  );
}
