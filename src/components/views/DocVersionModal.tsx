"use client";

import { useState } from "react";
import { Markdown } from "@/components/ui/Markdown";
import { Modal } from "@/components/ui/Modal";
import { collapseUnchanged, diffLines } from "@/lib/diff";
import type { ProjectDocVersion } from "@/lib/api/projects";

const SIGN = { same: " ", add: "+", del: "−" } as const;

export function DocVersionModal({
  version,
  previous,
  canRestore,
  onRestore,
  onClose,
}: {
  version: ProjectDocVersion;
  /** La versión anterior, contra la que se calcula el diff; undefined en la primera. */
  previous: ProjectDocVersion | undefined;
  /** false cuando el editor ya tiene exactamente este contenido. */
  canRestore: boolean;
  onRestore: () => void;
  onClose: () => void;
}) {
  const [view, setView] = useState<"changes" | "content">("changes");
  const lines = diffLines(previous?.content ?? "", version.content);
  const changed = lines.some((line) => line.kind !== "same");

  return (
    <Modal title={`Versión del ${version.date}`} onClose={onClose} wide>
      <div className="doc-v-meta">
        Por {version.author || "autor desconocido"}
        {!previous && " · primera versión"}
      </div>

      <div className="tabs" style={{ marginBottom: 12 }}>
        <button type="button" className={`tab-item${view === "changes" ? " active" : ""}`} onClick={() => setView("changes")}>
          Cambios
        </button>
        <button type="button" className={`tab-item${view === "content" ? " active" : ""}`} onClick={() => setView("content")}>
          Contenido
        </button>
      </div>

      {view === "changes" ? (
        changed ? (
          <div className="diff">
            {collapseUnchanged(lines).map((chunk, index) =>
              chunk.kind === "skip" ? (
                <div key={index} className="diff-skip">
                  {chunk.count} líneas sin cambios
                </div>
              ) : (
                <div key={index} className={`diff-line ${chunk.kind}`}>
                  <span className="diff-sign">{SIGN[chunk.kind]}</span>
                  <span className="diff-text">{chunk.text || " "}</span>
                </div>
              ),
            )}
          </div>
        ) : (
          <div className="doc-e-empty">Sin cambios respecto a la versión anterior.</div>
        )
      ) : (
        <div className="doc-e-preview" style={{ minHeight: 0 }}>
          {version.content.trim() ? <Markdown>{version.content}</Markdown> : <div className="doc-e-empty">Versión vacía.</div>}
        </div>
      )}

      <div className="modal-footer" style={{ padding: 0, border: "none", marginTop: 16 }}>
        <button type="button" className="btn-ghost" onClick={onClose}>Cerrar</button>
        <button
          type="button"
          className="btn-primary"
          disabled={!canRestore}
          title={canRestore ? "Lleva este contenido al editor; se aplica al guardar" : "El editor ya tiene este contenido"}
          onClick={onRestore}
        >
          Restaurar esta versión
        </button>
      </div>
    </Modal>
  );
}
