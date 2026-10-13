"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useIsCoordinacion } from "@/components/providers/CurrentMemberProvider";

/**
 * No hay pre-registro: todo Member nace de un login con GitHub (ver CLAUDE.md).
 * Invitar es compartir el enlace de ingreso; la cuenta queda pendiente hasta que
 * coordinación la apruebe.
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
        Comparte este enlace. La persona entra con su cuenta de GitHub y su solicitud queda pendiente hasta que{" "}
        {isCoordinacion ? "la apruebes en la pestaña «Pendientes»" : "coordinación la apruebe"}.
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
