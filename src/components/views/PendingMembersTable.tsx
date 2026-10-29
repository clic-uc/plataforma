"use client";

import { useState } from "react";
import { MemberAvatar } from "@/components/ui/Avatar";
import { ApproveMemberModal } from "@/components/views/ApproveMemberModal";
import { errorMessage } from "@/lib/api/http";
import { useDeleteMember, type PendingMember } from "@/lib/api/members";

/** Cola de cuentas esperando aprobación. Solo la monta coordinación. */
export function PendingMembersTable({ pending }: { pending: PendingMember[] }) {
  const [approving, setApproving] = useState<PendingMember | null>(null);
  const reject = useDeleteMember();

  function handleReject(member: PendingMember) {
    if (
      !window.confirm(
        `¿Rechazar la solicitud de ${member.name}? Se borra su cuenta; si vuelve a entrar con GitHub aparecerá de nuevo como pendiente.`,
      )
    ) {
      return;
    }
    reject.mutate(member.id);
  }

  if (pending.length === 0) {
    return (
      <div className="ph">
        <div className="ph-text">No hay solicitudes pendientes. Cuando alguien entre con GitHub por primera vez, aparecerá aquí.</div>
      </div>
    );
  }

  return (
    <>
      {reject.isError && (
        <div className="modal-error">{errorMessage(reject.error, "No se pudo rechazar la solicitud. Intenta de nuevo.")}</div>
      )}

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="dir-table">
          <thead>
            <tr>
              <th>Cuenta</th>
              <th>Solicitó acceso</th>
              <th><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {pending.map((m) => (
              <tr key={m.id} style={{ cursor: "default" }}>
                <td>
                  <div className="dir-name-cell">
                    <MemberAvatar member={m} className="dir-avatar" />
                    <div>
                      <div className="dir-fullname">{m.name}</div>
                      <div className="dir-email">{m.email}</div>
                    </div>
                  </div>
                </td>
                <td style={{ fontVariantNumeric: "tabular-nums" }}>{m.requestedAt}</td>
                <td>
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      disabled={reject.isPending && reject.variables === m.id}
                      onClick={() => handleReject(m)}
                    >
                      {reject.isPending && reject.variables === m.id ? "Rechazando…" : "Rechazar"}
                    </button>
                    <button
                      type="button"
                      className="btn-primary btn-sm"
                      onClick={() => setApproving(m)}
                    >
                      Aprobar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {approving && <ApproveMemberModal member={approving} onClose={() => setApproving(null)} />}
    </>
  );
}
