"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { PlaceholderBox } from "@/components/ui/PlaceholderBox";
import { useProject, useProjectDoc } from "@/lib/api/projects";

// El padre monta este componente con key={docId}, así que el estado local
// se reinicia solo al cambiar de documento (ver docs/[docId]/page.tsx).
export function DocEditorView({ projectId, docId }: { projectId: string; docId: string }) {
  const { data: project } = useProject(projectId);
  const { data: doc } = useProjectDoc(projectId, docId);
  const [title, setTitle] = useState(() => doc?.title ?? "");

  if (!project || !doc) return null;

  return (
    <section className="doc-ew">
      <div>
        <div className="card" style={{ padding: "22px 24px" }}>
          <input className="doc-e-title" value={title} onChange={(e) => setTitle(e.target.value)} />
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
          <div className="doc-body">
            <div className="body-line" style={{ width: "28%", height: 13, background: "var(--border-dash)", marginBottom: 14 }} />
            <div className="body-line" style={{ width: "100%" }} />
            <div className="body-line" style={{ width: "96%" }} />
            <div className="body-line" style={{ width: "88%", marginBottom: 20 }} />
            <div className="body-line" style={{ width: "26%", height: 12, background: "var(--border-dash)", marginBottom: 12 }} />
            <div className="body-line" style={{ width: "100%" }} />
            <div className="body-line" style={{ width: "93%" }} />
            <div className="body-line" style={{ width: "80%", marginBottom: 20 }} />
            <div className="body-line" style={{ width: "26%", height: 12, background: "var(--border-dash)", marginBottom: 12 }} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
              <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 5, height: 48 }} />
              <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 5, height: 48 }} />
            </div>
            <div className="body-line" style={{ width: "100%" }} />
            <div className="body-line" style={{ width: "74%" }} />
          </div>
          <div style={{ fontFamily: "var(--font-space-mono)", fontSize: 9, color: "var(--text-3)", marginTop: 10, textAlign: "right" }}>
            Área editable — texto enriquecido, listas, código, tablas, tareas
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

        <button className="btn-primary" style={{ width: "100%", marginBottom: 8 }}>Guardar cambios</button>
        <button className="btn-ghost" style={{ width: "100%", fontSize: 13 }}>Compartir enlace</button>
      </div>
    </section>
  );
}
