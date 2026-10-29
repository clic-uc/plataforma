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

  const dirty = content !== doc.content;

  return (
    <section className="doc-ew">
      <style href="doc-comment-highlights" precedence="default">{HIGHLIGHT_CSS}</style>
      <div>
        <div className="doc-e-head">
          <h2 className="doc-e-title">{doc.title}</h2>
          <div className="doc-e-save">
            {mutation.isError ? (
              <span className="doc-e-status dirty" role="alert">No se pudo guardar. Intenta de nuevo.</span>
            ) : (
              <span className={`doc-e-status${dirty ? " dirty" : ""}`}>{dirty ? "Cambios sin guardar" : "Guardado"}</span>
            )}
            <button
              type="button"
              className="btn-primary"
              disabled={mutation.isPending || !dirty}
              onClick={() => mutation.mutate(content)}
            >
              {mutation.isPending ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </div>

        <div className="doc-frame">
          <div className="doc-frame-bar">
            <div className="doc-ftabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={mode === "write"}
                className={`doc-ftab${mode === "write" ? " active" : ""}`}
                onClick={() => setMode("write")}
              >
                Escribir
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "preview"}
                className={`doc-ftab${mode === "preview" ? " active" : ""}`}
                onClick={() => setMode("preview")}
              >
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
              placeholder="Escribe el contenido del documento en Markdown…"
            />
          ) : (
            // El botón "Comentar" va fuera de doc-e-preview: su texto contaría como parte del
            // documento al calcular a qué fragmento se ancla un comentario.
            <div className="doc-e-previewwrap">
              <div className="doc-e-preview" ref={setPreviewEl}>
                {content.trim() ? (
                  <Markdown>{content}</Markdown>
                ) : (
                  <div className="doc-e-empty">El documento está vacío. Pasa a «Escribir» para agregar contenido.</div>
                )}
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

      <aside className="side-panel">
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

        <div className="side-sec">
          <div className="ds-lbl">
            Historial de versiones{versions.length > 0 && <span className="label-count">{versions.length}</span>}
          </div>
          {versions.length === 0 ? (
            <div className="doc-v-empty">Sin versiones todavía. Se registra una al guardar.</div>
          ) : (
            <div className="doc-v-list">
              {versions.map((version, index) => (
                <button key={version.id} type="button" className="doc-v-row" onClick={() => setOpenVersionId(version.id)}>
                  <span className="doc-v-author">
                    {version.author || "Autor desconocido"}
                    {index === 0 && <Badge color="blue">Actual</Badge>}
                  </span>
                  <span className="doc-v-date">{version.date}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

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
