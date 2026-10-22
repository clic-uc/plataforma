"use client";

import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { Markdown } from "@/components/ui/Markdown";
import { PlaceholderBox } from "@/components/ui/PlaceholderBox";
import { useProject, useProjectDoc, useUpdateProjectDoc } from "@/lib/api/projects";
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

// El padre monta este componente con key={docId}, así que el estado local
// se reinicia solo al cambiar de documento (ver docs/[docId]/page.tsx).
export function DocEditorView({ projectId, docId }: { projectId: string; docId: string }) {
  const { data: project } = useProject(projectId);
  const { data: doc } = useProjectDoc(projectId, docId);
  const [content, setContent] = useState(() => doc?.content ?? "");
  // Un documento con contenido se abre para leerlo; uno vacío, directo para escribir.
  const [mode, setMode] = useState<"write" | "preview">(() => (doc?.content?.trim() ? "preview" : "write"));
  const mutation = useUpdateProjectDoc(projectId, docId);

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
            <div className="doc-e-preview">
              {content.trim() ? <Markdown>{content}</Markdown> : <div className="doc-e-empty">Nada que mostrar todavía.</div>}
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

        <div className="doc-sc">
          <div className="ds-lbl">Historial de versiones</div>
          <PlaceholderBox text={<>Lista de versiones<br />con diff y autor</>} style={{ height: 72 }} />
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
    </section>
  );
}
