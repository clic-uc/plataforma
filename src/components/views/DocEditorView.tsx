"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { PlaceholderBox } from "@/components/ui/PlaceholderBox";
import { useProject, useProjectDoc, useUpdateProjectDoc } from "@/lib/api/projects";

// El padre monta este componente con key={docId}, así que el estado local
// se reinicia solo al cambiar de documento (ver docs/[docId]/page.tsx).
export function DocEditorView({ projectId, docId }: { projectId: string; docId: string }) {
  const { data: project } = useProject(projectId);
  const { data: doc } = useProjectDoc(projectId, docId);
  const [content, setContent] = useState(() => doc?.content ?? "");
  const mutation = useUpdateProjectDoc(projectId, docId);

  if (!project || !doc) return null;

  return (
    <section className="doc-ew">
      <div>
        <div className="card" style={{ padding: "22px 24px" }}>
          <div className="doc-e-title">{doc.title}</div>
          <div className="doc-e-toolbar">
            <button className="toolbar-btn"><strong>B</strong></button>
            <button className="toolbar-btn"><em>I</em></button>
            <button className="toolbar-btn">H1</button>
            <button className="toolbar-btn">H2</button>
            <button className="toolbar-btn">— Lista</button>
            <button className="toolbar-btn">☑ Tarea</button>
            <button className="toolbar-btn">▦ Tabla</button>
            <button className="toolbar-btn">{"{}"} Código</button>
          </div>
          <textarea
            className="doc-e-body"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Escribe el contenido del documento…"
          />
          <div style={{ fontFamily: "var(--font-space-mono)", fontSize: 9, color: "var(--text-3)", marginTop: 10, textAlign: "right" }}>
            Por ahora solo texto plano — el formato enriquecido queda pendiente
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
