"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { toISODateInput } from "@/lib/api/format";
import { useCreateActa } from "@/lib/api/projects";

export function CreateActaModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(toISODateInput(new Date()));

  const mutation = useCreateActa(projectId);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    mutation.mutate({ title, date }, { onSuccess: onClose });
  }

  return (
    <Modal title="Nueva acta" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-field">
          <div className="f-label">Título</div>
          <input
            className="field-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            required
          />
        </div>

        <div className="form-field">
          <div className="f-label">Fecha</div>
          <input
            type="date"
            className="field-input"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>

        {mutation.isError && <div className="modal-error">No se pudo crear el acta. Intenta de nuevo.</div>}

        <div className="modal-footer" style={{ padding: 0, border: "none", marginTop: 4 }}>
          <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={mutation.isPending}>
            {mutation.isPending ? "Creando…" : "Crear acta"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
