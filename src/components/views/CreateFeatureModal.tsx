"use client";

import { useState } from "react";
import type { Priority } from "@/generated/prisma/enums";
import { Modal } from "@/components/ui/Modal";
import { MarkdownToolbar, useMarkdownEditor } from "@/components/ui/MarkdownToolbar";
import { PRIORITY_OPTIONS } from "@/lib/api/status";
import { errorMessage } from "@/lib/api/http";
import { useCreateFeature } from "@/lib/api/projects";

export function CreateFeatureModal({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [priority, setPriority] = useState<Priority>("MEDIA");
  const [description, setDescription] = useState("");
  const { textareaRef, format, onKeyDown } = useMarkdownEditor(description, setDescription);

  const mutation = useCreateFeature(projectId);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    mutation.mutate(
      { name, priority, description: description.trim() || null },
      { onSuccess: onClose },
    );
  }

  return (
    <Modal title="Nueva feature" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-field">
          <div className="f-label">Nombre</div>
          <input
            className="field-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            required
          />
        </div>

        <div className="form-field">
          <div className="f-label">Prioridad</div>
          <select
            className="field-select"
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
          >
            {PRIORITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div className="form-field">
          <div className="f-label">Descripción</div>
          <div className="md-toolbar-row">
            <MarkdownToolbar onFormat={format} />
          </div>
          <textarea
            ref={textareaRef}
            className="field-textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Opcional"
          />
        </div>

        {mutation.isError && (
          <div className="modal-error">{errorMessage(mutation.error, "No se pudo crear la feature. Intenta de nuevo.")}</div>
        )}

        <div className="modal-footer" style={{ padding: 0, border: "none", marginTop: 4 }}>
          <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={mutation.isPending}>
            {mutation.isPending ? "Creando…" : "Crear feature"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
