"use client";

import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { Markdown } from "@/components/ui/Markdown";
import { DocCommentsPanel } from "@/components/views/DocCommentsPanel";
import { DocVersionModal } from "@/components/views/DocVersionModal";
import {
  useCreateDocComment,
  useProject,
  useProjectDoc,
  useProjectDocComments,
  useProjectDocVersions,
  useResolveDocComment,
  useUpdateProjectDoc,
  type ProjectDocVersion,
} from "@/lib/api/projects";
import { scrollToQuote, useHighlight, useTextSelection } from "@/lib/comment-dom";
import type { CommentAnchor } from "@/lib/comments";
import { applyFormat, continueList, type MarkdownFormat } from "@/lib/markdown";

const TOOLBAR: { format: MarkdownFormat; label: ReactNode; title: string }[] = [
  { format: "bold", label: <strong>B</strong>, title: "Negrita (Ctrl+B)" },
  { format: "italic", label: <em>I</em>, title: "Cursiva (Ctrl+I)" },
  { format: "h1", label: "H1", title: "Título" },
  { format: "h2", label: "H2", title: "Subtítulo" },
  { format: "list", label: "— Lista", title: "Lista" },
  { format: "table", label: "▦ Tabla", title: "Tabla" },
  { format: "code", label: "{} Código", title: "Código" },
];

const SHORTCUTS: Record<string, MarkdownFormat> = { b: "bold", i: "italic" };

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
  const { data: project } = useProject(projectId);
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

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // La selección que deja un botón de formato solo se puede aplicar después de que
  // React escribió el texto nuevo en el textarea.
  const pendingSelection = useRef<[number, number] | null>(null);

  useLayoutEffect(() => {
    const selection = pendingSelection.current;
    const textarea = textareaRef.current;
    if (!selection || !textarea) return;
    pendingSelection.current = null;
    textarea.focus();
    textarea.setSelectionRange(selection[0], selection[1]);
  });

  if (!project || !doc) return null;

  // Cambiar el valor desde React deja estos cambios fuera del Ctrl+Z nativo del textarea.
  function format(kind: MarkdownFormat) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const next = applyFormat({ value: content, start: textarea.selectionStart, end: textarea.selectionEnd }, kind);
    // Con el mismo texto React no vuelve a renderizar y el efecto no correría.
    if (next.value === content) {
      textarea.setSelectionRange(next.start, next.end);
      return;
    }
    pendingSelection.current = [next.start, next.end];
    setContent(next.value);
  }

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

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && !e.nativeEvent.isComposing) {
      const textarea = e.currentTarget;
      const next = continueList({ value: content, start: textarea.selectionStart, end: textarea.selectionEnd });
      if (!next) return;
      e.preventDefault();
      pendingSelection.current = [next.start, next.end];
      setContent(next.value);
      return;
    }
    if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
    const kind = SHORTCUTS[e.key.toLowerCase()];
    if (!kind) return;
    e.preventDefault();
    format(kind);
  }

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
            {mode === "write" && (
              <div className="doc-e-toolbar">
                {TOOLBAR.map(({ format: kind, label, title }) => (
                  // preventDefault en mousedown evita que el botón le quite el foco al textarea.
                  <button
                    key={kind}
                    type="button"
                    className="toolbar-btn"
                    title={title}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => format(kind)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {mode === "write" ? (
            <textarea
              ref={textareaRef}
              className="doc-e-body"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
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
          <div style={{ fontFamily: "var(--font-space-mono)", fontSize: 9, color: "var(--text-3)", marginTop: 10, textAlign: "right" }}>
            Admite Markdown
          </div>
        </div>
      </div>

      <div>
        <div className="doc-sc">
          <div className="ds-lbl">Metadatos</div>
          <div className="ds-row"><span className="ds-key">Tipo</span><span className="ds-val"><Badge color={doc.badgeColor} style={{ fontSize: 9 }}>{doc.type}</Badge></span></div>
          <div className="ds-row"><span className="ds-key">Proyecto</span><span className="ds-val" style={{ fontSize: 11 }}>{project.name}</span></div>
          {doc.author && <div className="ds-row"><span className="ds-key">Autor</span><span className="ds-val" style={{ fontSize: 11 }}>{doc.author}</span></div>}
          <div className="ds-row"><span className="ds-key">Creado</span><span className="ds-val" style={{ fontSize: 11, fontFamily: "var(--font-space-mono)" }}>{doc.date}</span></div>
        </div>

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
