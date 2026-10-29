"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { toISODateInput } from "@/lib/api/format";
import { useCreateActa, useProject } from "@/lib/api/projects";

export function CreateActaModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(toISODateInput(new Date()));

  const router = useRouter();
  const { data: project } = useProject(projectId);
  const mutation = useCreateActa(projectId);

  // La respuesta es el proyecto entero: el acta nueva es la que no estaba antes de crear.
  // Se abre directo en el editor, que es lo siguiente que se hace con un acta.
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const before = new Set(project?.actas.map((acta) => acta.id));
    mutation.mutate(
      { title, date },
      {
        onSuccess: (updated) => {
          const created = updated.actas.find((acta) => !before.has(acta.id));
          if (created) router.push(`/proyectos/${projectId}/docs/${created.id}`);
          else onClose();
        },
      },
    );
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
          <button type="submit" className="btn-primary" disabled={mutation.isPending || mutation.isSuccess}>
            {mutation.isPending || mutation.isSuccess ? "Creando…" : "Crear acta"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
