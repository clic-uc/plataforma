"use client";

import { useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/ui/Modal";
import { errorMessage } from "@/lib/api/http";
import { useMembers } from "@/lib/api/members";
import {
  useAddProjectMember,
  useRemoveProjectMember,
  useUpdateProjectMember,
  type ProjectDetail,
  type ProjectTeamMember,
} from "@/lib/api/projects";
import { useIsCoordinacion } from "@/components/providers/CurrentMemberProvider";

export function ProjectTeamModal({ project, onClose }: { project: ProjectDetail; onClose: () => void }) {
  const isCoordinacion = useIsCoordinacion();
  const { data: members = [] } = useMembers({ enabled: isCoordinacion });
  const [memberId, setMemberId] = useState("");
  const [role, setRole] = useState("");

  const add = useAddProjectMember(project.id);
  const update = useUpdateProjectMember(project.id);
  const remove = useRemoveProjectMember(project.id);
  const error = add.error ?? update.error ?? remove.error;

  const candidates = members.filter((m) => !project.team.some((t) => t.id === m.id));

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    add.mutate(
      { memberId, role },
      {
        onSuccess: () => {
          setMemberId("");
          setRole("");
        },
      },
    );
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
          <div className="ph" style={{ height: 56 }}>
            <div className="ph-text">Este proyecto aún no tiene equipo</div>
          </div>
        ) : (
          project.team.map((m) => (
            <TeamRow
              key={m.id}
              member={m}
              editable={isCoordinacion}
              saving={update.isPending && update.variables?.memberId === m.id}
              removing={remove.isPending && remove.variables === m.id}
              onSaveRole={(newRole) => update.mutate({ memberId: m.id, role: newRole })}
              onRemove={() => handleRemove(m)}
            />
          ))
        )}
      </div>

      {isCoordinacion && (
        <form onSubmit={handleAdd}>
          <div className="field-row">
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
            <div className="form-field">
              <div className="f-label">Rol en el proyecto</div>
              <input
                className="field-input"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="Ej: Desarrollo, Líder técnico"
                maxLength={60}
                required
              />
            </div>
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
  saving,
  removing,
  onSaveRole,
  onRemove,
}: {
  member: ProjectTeamMember;
  editable: boolean;
  saving: boolean;
  removing: boolean;
  onSaveRole: (role: string) => void;
  onRemove: () => void;
}) {
  const [role, setRole] = useState(member.role);
  const dirty = role.trim() !== "" && role.trim() !== member.role;

  return (
    <div className="task-row">
      <div className="task-ava accent-ava">{member.initials}</div>
      <Link href={`/miembros/${member.id}`} className="task-name">{member.name}</Link>
      {editable ? (
        <>
          <input
            className="field-input"
            style={{ maxWidth: 170, padding: "4px 7px", fontSize: 12 }}
            value={role}
            onChange={(e) => setRole(e.target.value)}
            maxLength={60}
            aria-label={`Rol de ${member.name}`}
          />
          {dirty && (
            <button type="button" className="btn-xs btn-xs-p" disabled={saving} onClick={() => onSaveRole(role)}>
              {saving ? "…" : "Guardar"}
            </button>
          )}
          <button
            type="button"
            className="btn-xs btn-xs-g"
            style={{ background: "transparent", color: "#c0392b", borderColor: "#c0392b" }}
            disabled={removing}
            onClick={onRemove}
          >
            {removing ? "Quitando…" : "Quitar"}
          </button>
        </>
      ) : (
        <span style={{ fontSize: 11, color: "var(--text-3)" }}>{member.role}</span>
      )}
    </div>
  );
}
