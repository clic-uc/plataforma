"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useIsCoordinacion } from "@/components/providers/CurrentMemberProvider";

/**
 * No hay pre-registro: todo Member nace de un login con GitHub (ver CLAUDE.md),
 * pero solo si coordinación agregó antes su usuario en «Pendientes». Invitar es
 * eso más compartir el enlace de ingreso; la cuenta nace aprobada.
 */
export function InviteMemberModal({ onClose }: { onClose: () => void }) {
  const isCoordinacion = useIsCoordinacion();
  // Solo se monta tras un click, así que window ya existe.
  const [link] = useState(() => `${window.location.origin}/login`);
  const [copied, setCopied] = useState<"ok" | "error" | null>(null);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied("ok");
    } catch {
      setCopied("error");
    }
  }

  return (
    <Modal title="Invitar miembro" onClose={onClose}>
      <p style={{ fontSize: 13, color: "var(--text-2)", margin: "0 0 14px", lineHeight: 1.45 }}>
        {isCoordinacion
          ? "Agrega primero su usuario de GitHub en la pestaña «Pendientes», con el rol que tendrá, y comparte este enlace. Al entrar con GitHub su cuenta queda lista."
          : "Pídele a coordinación que agregue su usuario de GitHub a las invitaciones y comparte este enlace. Sin invitación, GitHub no puede crear la cuenta."}
      </p>

      <div className="form-field">
        <div className="f-label">Enlace de ingreso</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input className="field-input" value={link} readOnly onFocus={(e) => e.target.select()} />
          <button type="button" className="btn-primary" style={{ flexShrink: 0 }} onClick={handleCopy}>
            {copied === "ok" ? "Copiado" : "Copiar"}
          </button>
        </div>
      </div>

      {copied === "error" && (
        <div className="modal-error">No se pudo copiar automáticamente; selecciona el enlace y cópialo a mano.</div>
      )}

      <div className="modal-footer" style={{ padding: 0, border: "none", marginTop: 4 }}>
        <button type="button" className="btn-ghost" onClick={onClose}>Cerrar</button>
      </div>
    </Modal>
  );
}
