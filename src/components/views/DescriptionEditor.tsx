"use client";

import { useState, type FormEvent } from "react";
import { Markdown } from "@/components/ui/Markdown";
import { MarkdownToolbar, useMarkdownEditor } from "@/components/ui/MarkdownToolbar";
import { errorMessage } from "@/lib/api/http";

/**
 * Descripción en Markdown de una feature o tarea: se lee renderizada y "Editar" abre la
 * barra de formato con el textarea. Sin descripción abre directo para escribir.
 */
export function DescriptionEditor({
  description,
  saving,
  error,
  onSave,
}: {
  description: string | null;
  saving: boolean;
  error: Error | null;
  /** onDone vuelve a la lectura; quien llama lo invoca cuando el guardado terminó bien. */
  onSave: (description: string | null, onDone: () => void) => void;
}) {
  // null = leyendo. El borrador nace al pulsar "Editar", así nunca arrastra un texto viejo.
  const [draft, setDraft] = useState<string | null>(description ? null : "");
  const { textareaRef, format, onKeyDown } = useMarkdownEditor(draft ?? "", setDraft);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSave(draft?.trim() || null, () => setDraft(null));
  }

  if (draft === null) {
    return (
      <div className="form-field">
        <div className="desc-head">
          <div className="f-label">Descripción</div>
          <button type="button" className="doc-c-resolve" onClick={() => setDraft(description ?? "")}>
            Editar
          </button>
        </div>
        {description ? <Markdown>{description}</Markdown> : <div className="doc-e-empty">Sin descripción.</div>}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-field">
        <div className="f-label">Descripción</div>
        <div className="md-frame">
          <MarkdownToolbar onFormat={format} />
          <textarea
            ref={textareaRef}
            className="field-textarea desc-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Sin descripción"
          />
        </div>
      </div>

      {error && <div className="modal-error">{errorMessage(error, "No se pudo guardar. Intenta de nuevo.")}</div>}

      <div className="modal-footer" style={{ padding: 0, border: "none", marginTop: 4 }}>
        {description && (
          <button type="button" className="btn-ghost" disabled={saving} onClick={() => setDraft(null)}>
            Cancelar
          </button>
        )}
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? "Guardando…" : "Guardar descripción"}
        </button>
      </div>
    </form>
  );
}
