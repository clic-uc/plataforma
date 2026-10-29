"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { IssueType } from "@/generated/prisma/enums";
import { Modal } from "@/components/ui/Modal";
import { MarkdownToolbar, useMarkdownEditor } from "@/components/ui/MarkdownToolbar";
import { ISSUE_TYPE_OPTIONS } from "@/lib/api/status";
import { errorMessage } from "@/lib/api/http";
import { MAX_ISSUE_BODY_LENGTH, MAX_ISSUE_TITLE_LENGTH, useCreateIssue } from "@/lib/api/issues";

export function CreateIssueModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [type, setType] = useState<IssueType>("IDEA");
  const [body, setBody] = useState("");
  const { textareaRef, format, onKeyDown } = useMarkdownEditor(body, setBody);

  const mutation = useCreateIssue(projectId);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    mutation.mutate(
      { title, type, body },
      { onSuccess: (created) => router.push(`/proyectos/${projectId}/issues/${created.number}`) },
    );
  }

  return (
    <Modal title="Nuevo issue" onClose={onClose} wide>
      <form onSubmit={handleSubmit}>
        <div className="form-field">
          <div className="f-label">Título</div>
          <input
            className="field-input"
            value={title}
            maxLength={MAX_ISSUE_TITLE_LENGTH}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            required
          />
        </div>

        <div className="form-field">
          <div className="f-label">Tipo</div>
          <select className="field-select" value={type} onChange={(e) => setType(e.target.value as IssueType)}>
            {ISSUE_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div className="form-field">
          <div className="f-label">Descripción</div>
          <div className="md-frame">
            <MarkdownToolbar onFormat={format} />
            <textarea
              ref={textareaRef}
              className="field-textarea issue-body-input"
              value={body}
              maxLength={MAX_ISSUE_BODY_LENGTH}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Contexto, qué se propone o qué falla…"
            />
          </div>
        </div>

        {mutation.isError && (
          <div className="modal-error">{errorMessage(mutation.error, "No se pudo crear el issue. Intenta de nuevo.")}</div>
        )}

        <div className="modal-footer" style={{ padding: 0, border: "none", marginTop: 4 }}>
          <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={mutation.isPending || mutation.isSuccess}>
            {mutation.isPending || mutation.isSuccess ? "Creando…" : "Crear issue"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
