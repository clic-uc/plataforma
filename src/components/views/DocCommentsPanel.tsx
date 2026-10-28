"use client";

import { useState, type FormEvent } from "react";
import type { ProjectDocComment } from "@/lib/api/projects";
import { MAX_COMMENT_LENGTH, type CommentAnchor } from "@/lib/comments";

function Composer({
  anchor,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  anchor: CommentAnchor;
  pending: boolean;
  error: boolean;
  onSubmit: (body: string) => void;
  onCancel: () => void;
}) {
  const [body, setBody] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (body.trim()) onSubmit(body);
  }

  return (
    <form className="doc-c-composer" onSubmit={handleSubmit}>
      <div className="doc-c-quote">{anchor.quote}</div>
      <textarea
        autoFocus
        className="doc-c-input"
        value={body}
        maxLength={MAX_COMMENT_LENGTH}
        placeholder="Escribe un comentario…"
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
      />
      {error && <div className="modal-error">No se pudo agregar el comentario.</div>}
      <div className="doc-c-actions">
        <button type="button" className="btn-ghost" style={{ fontSize: 12 }} disabled={pending} onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="btn-primary" style={{ fontSize: 12 }} disabled={pending || !body.trim()}>
          {pending ? "Guardando…" : "Comentar"}
        </button>
      </div>
    </form>
  );
}

export function DocCommentsPanel({
  comments,
  composing,
  creating,
  createFailed,
  resolvingId,
  onCreate,
  onCancel,
  onResolve,
  onShow,
}: {
  comments: ProjectDocComment[];
  /** El fragmento sobre el que se está escribiendo un comentario nuevo, si lo hay. */
  composing: CommentAnchor | null;
  creating: boolean;
  createFailed: boolean;
  resolvingId: string | null;
  onCreate: (body: string) => void;
  onCancel: () => void;
  onResolve: (comment: ProjectDocComment) => void;
  /** Lleva el fragmento del comentario a la vista. */
  onShow: (comment: ProjectDocComment) => void;
}) {
  return (
    <div className="doc-sc">
      <div className="ds-lbl">Comentarios{comments.length > 0 && ` (${comments.length})`}</div>

      {composing && (
        // Con otro fragmento seleccionado el formulario arranca de cero.
        <Composer
          key={`${composing.quote}:${composing.occurrence}`}
          anchor={composing}
          pending={creating}
          error={createFailed}
          onSubmit={onCreate}
          onCancel={onCancel}
        />
      )}

      {comments.length === 0 && !composing ? (
        <div className="doc-v-empty">Selecciona texto en la Vista previa para comentarlo.</div>
      ) : (
        <div className="doc-c-list">
          {comments.map((comment) => (
            <div key={comment.id} className="doc-c-item">
              <button type="button" className="doc-c-quote doc-c-quote-btn" title="Ver en el documento" onClick={() => onShow(comment)}>
                {comment.quote}
              </button>
              <div className="doc-c-body">{comment.body}</div>
              <div className="doc-c-foot">
                <span className="doc-v-date">
                  {comment.author || "Autor desconocido"} · {comment.date}
                </span>
                <button
                  type="button"
                  className="doc-c-resolve"
                  disabled={resolvingId === comment.id}
                  onClick={() => onResolve(comment)}
                >
                  {resolvingId === comment.id ? "Resolviendo…" : "Resolver"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
