"use client";

import { useState } from "react";
import { MemberAvatar } from "@/components/ui/Avatar";
import { ApproveMemberModal } from "@/components/views/ApproveMemberModal";
import { errorMessage } from "@/lib/api/http";
import { useDeleteMember, type PendingMember } from "@/lib/api/members";

/**
 * Cuentas esperando aprobación: las que se crearon cuando el registro era abierto.
 * Con las invitaciones las cuentas nacen aprobadas, así que no aparecen nuevas.
 * Solo la monta coordinación, y solo si queda alguna.
 */
export function PendingMembersTable({ pending }: { pending: PendingMember[] }) {
  const [approving, setApproving] = useState<PendingMember | null>(null);
  const reject = useDeleteMember();

  function handleReject(member: PendingMember) {
    if (
      !window.confirm(
        `¿Rechazar la solicitud de ${member.name}? Se borra su cuenta; para volver a entrar necesitará una invitación.`,
      )
    ) {
      return;
    }
    reject.mutate(member.id);
  }

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold text-text-1">Cuentas por aprobar</h2>
        <p className="mt-1 text-sm text-text-2">
          Entraron con GitHub antes de que existieran las invitaciones y esperan que coordinación las apruebe.
        </p>
      </div>

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
    </section>
  );
}
