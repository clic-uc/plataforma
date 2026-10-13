"use client";

import { useState } from "react";
import type { MemberRole } from "@/generated/prisma/enums";
import { Modal } from "@/components/ui/Modal";
import { errorMessage } from "@/lib/api/http";
import { MEMBER_ROLE_OPTIONS } from "@/lib/api/status";
import { MAX_AREA_LENGTH } from "@/lib/api/member-fields";
import { useApproveMember, type PendingMember } from "@/lib/api/members";

export function ApproveMemberModal({ member, onClose }: { member: PendingMember; onClose: () => void }) {
  const [role, setRole] = useState<MemberRole>("ROOKIE");
  const [area, setArea] = useState(member.area);
  const mutation = useApproveMember();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    mutation.mutate({ id: member.id, input: { role, area } }, { onSuccess: onClose });
  }

  return (
    <Modal title={`Aprobar a ${member.name}`} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <p style={{ fontSize: 13, color: "var(--text-2)", margin: "0 0 14px", lineHeight: 1.45 }}>
          Entró con <strong>{member.email}</strong> el {member.requestedAt}. Al aprobarla podrá usar la plataforma con
          el rol que elijas; lo demás del perfil se puede completar después.
        </p>

        <div className="field-row">
          <div className="form-field">
            <div className="f-label">Rol</div>
            <select className="field-select" value={role} onChange={(e) => setRole(e.target.value as MemberRole)}>
              {MEMBER_ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <div className="f-label">Área</div>
            <input
              className="field-input"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              maxLength={MAX_AREA_LENGTH}
              required
            />
          </div>
        </div>

        {role === "COORDINACION" && (
          <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 12 }}>
            Coordinación puede aprobar cuentas, cambiar roles y eliminar miembros.
          </div>
        )}
        {mutation.isError && (
          <div className="modal-error">{errorMessage(mutation.error, "No se pudo aprobar la cuenta. Intenta de nuevo.")}</div>
        )}

        <div className="modal-footer" style={{ padding: 0, border: "none", marginTop: 4 }}>
          <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={mutation.isPending}>
            {mutation.isPending ? "Aprobando…" : "Aprobar acceso"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
