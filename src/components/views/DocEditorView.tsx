"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Markdown } from "@/components/ui/Markdown";
import { MarkdownToolbar, useMarkdownEditor } from "@/components/ui/MarkdownToolbar";
import { DocCommentsPanel } from "@/components/views/DocCommentsPanel";
import { DocVersionModal } from "@/components/views/DocVersionModal";
import {
  useCreateDocComment,
  useProjectDoc,
  useProjectDocComments,
  useProjectDocVersions,
  useResolveDocComment,
  useUpdateProjectDoc,
  type ProjectDocVersion,
} from "@/lib/api/projects";
import { scrollToQuote, useHighlight, useTextSelection } from "@/lib/comment-dom";
import type { CommentAnchor } from "@/lib/comments";

// Los fragmentos comentados se pintan con la CSS Custom Highlight API (src/lib/comment-dom.ts).
// Va aquí y no en globals.css porque el parser de CSS de Turbopack no reconoce `::highlight()`
// y avisa en cada build; un <style> con `precedence` lo sube al <head> una sola vez.
const HIGHLIGHT_CSS = `
::highlight(doc-comment) { background-color: var(--comment-hl); }
::highlight(doc-comment-pending) { background-color: var(--comment-hl); text-decoration: underline; }
`;

// El padre monta este componente con key={docId}, así que el estado local
// se reinicia solo al cambiar de documento (ver docs/[docId]/page.tsx).
export function DocEditorView({ projectId, docId }: { projectId: string; docId: string }) {
  const { data: doc } = useProjectDoc(projectId, docId);
  // Solo se guarda lo que la persona edita; mientras no edite, el contenido es el del documento.
  // Copiar doc.content a un useState al montar dejaba el editor con un valor viejo (o vacío)
  // cuando el caché del navegador aún no se había actualizado con la respuesta del servidor.
  const [draft, setDraft] = useState<string | null>(null);
  const content = draft ?? doc?.content ?? "";
  // Un documento con contenido se abre para leerlo; uno vacío, directo para escribir.
  // Al empezar a editar se fija en "write" para que el primer guardado no cambie de pestaña.
  const [modeChoice, setModeChoice] = useState<"write" | "preview" | null>(null);
  const mode = modeChoice ?? (doc?.content?.trim() ? "preview" : "write");
  const setMode = setModeChoice;
  function setContent(next: string) {
    setDraft(next);
    setModeChoice((current) => current ?? "write");
  }
  const mutation = useUpdateProjectDoc(projectId, docId);
  const { data: versions = [] } = useProjectDocVersions(projectId, docId);
  const [openVersionId, setOpenVersionId] = useState<string | null>(null);

  // Los comentarios se anclan al texto de la vista previa. El elemento va en estado, no en un ref,
  // para que el resaltado y la selección se reenganchen cuando la pestaña lo monta o lo desmonta.
  const { data: comments = [] } = useProjectDocComments(projectId, docId);
  const createComment = useCreateDocComment(projectId, docId);
  const resolveComment = useResolveDocComment(projectId, docId);
  const [previewEl, setPreviewEl] = useState<HTMLDivElement | null>(null);
  const [composing, setComposing] = useState<CommentAnchor | null>(null);
  const selection = useTextSelection(previewEl);
  useHighlight("doc-comment", previewEl, comments, [comments, content]);
  useHighlight("doc-comment-pending", previewEl, composing ? [composing] : [], [composing, content]);

  const { textareaRef, format, onKeyDown } = useMarkdownEditor(content, setContent);

  if (!doc) return null;

  // Restaurar lleva el contenido al editor sin guardarlo: se aplica con "Guardar cambios",
  // que registra una versión nueva en vez de borrar las posteriores.
  function restore(version: ProjectDocVersion) {
    if (content !== doc?.content && !window.confirm("Tienes cambios sin guardar. ¿Reemplazarlos por esta versión?")) return;
    setContent(version.content);
    setMode("write");
    setOpenVersionId(null);
  }

  function showComment(comment: CommentAnchor) {
    if (previewEl) scrollToQuote(previewEl, comment);
    else setMode("preview");
  }

  const openIndex = versions.findIndex((version) => version.id === openVersionId);

  return (
    <section className="doc-ew">
      <style href="doc-comment-highlights" precedence="default">{HIGHLIGHT_CSS}</style>
      <div>
        <div className="card" style={{ padding: "22px 24px" }}>
          <div className="doc-e-title">{doc.title}</div>
          <div className="doc-e-bar">
            <div className="tabs" style={{ margin: 0 }}>
              <button type="button" className={`tab-item${mode === "write" ? " active" : ""}`} onClick={() => setMode("write")}>
                Escribir
              </button>
              <button type="button" className={`tab-item${mode === "preview" ? " active" : ""}`} onClick={() => setMode("preview")}>
                Vista previa
              </button>
            </div>
            {mode === "write" && <MarkdownToolbar onFormat={format} />}
          </div>
          {mode === "write" ? (
            <textarea
              ref={textareaRef}
              className="doc-e-body"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Escribe el contenido del documento…"
            />
          ) : (
            // El botón "Comentar" va fuera de doc-e-preview: su texto contaría como parte del
            // documento al calcular a qué fragmento se ancla un comentario.
            <div className="doc-e-previewwrap">
              <div className="doc-e-preview" ref={setPreviewEl}>
                {content.trim() ? <Markdown>{content}</Markdown> : <div className="doc-e-empty">Nada que mostrar todavía.</div>}
              </div>
              {selection && content.trim() && (
                <button
                  type="button"
                  className="doc-c-fab"
                  style={{ left: selection.x, top: selection.y + 6 }}
                  // Sin esto el clic le quita la selección al texto antes de leerla.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    createComment.reset();
                    setComposing({ quote: selection.quote, occurrence: selection.occurrence });
                  }}
                >
                  + Comentar
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div>
        <DocCommentsPanel
          comments={comments}
          composing={composing}
          creating={createComment.isPending}
          createFailed={createComment.isError}
          resolvingId={resolveComment.isPending ? resolveComment.variables : null}
          onCreate={(body) =>
            composing && createComment.mutate({ ...composing, body }, { onSuccess: () => setComposing(null) })
          }
          onCancel={() => setComposing(null)}
          onResolve={(comment) => resolveComment.mutate(comment.id)}
          onShow={showComment}
        />

        <div className="doc-sc">
          <div className="ds-lbl">Historial de versiones</div>
          {versions.length === 0 ? (
            <div className="doc-v-empty">Sin versiones todavía. Se registra una al guardar.</div>
          ) : (
            <div className="doc-v-list">
              {versions.map((version, index) => (
                <button key={version.id} type="button" className="doc-v-row" onClick={() => setOpenVersionId(version.id)}>
                  <span className="doc-v-author">
                    {version.author || "Autor desconocido"}
                    {index === 0 && <Badge color="blue" style={{ fontSize: 8, marginLeft: 6 }}>Actual</Badge>}
                  </span>
                  <span className="doc-v-date">{version.date}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {mutation.isError && <div className="modal-error">No se pudo guardar. Intenta de nuevo.</div>}

        <button
          className="btn-primary"
          style={{ width: "100%", marginBottom: 8 }}
          disabled={mutation.isPending}
          onClick={() => mutation.mutate(content)}
        >
          {mutation.isPending ? "Guardando…" : content === doc.content ? "Guardado ✓" : "Guardar cambios"}
        </button>
        <button className="btn-ghost" style={{ width: "100%", fontSize: 13 }}>Compartir enlace</button>
      </div>

      {openIndex !== -1 && (
        <DocVersionModal
          version={versions[openIndex]}
          previous={versions[openIndex + 1]}
          canRestore={versions[openIndex].content !== content}
          onRestore={() => restore(versions[openIndex])}
          onClose={() => setOpenVersionId(null)}
        />
      )}
    </section>
  );
}
