"use client";

import { Fragment, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { applyFormat, continueList, type MarkdownFormat } from "@/lib/markdown";

// `group` separa visualmente los botones: formato de texto, títulos y bloques.
const TOOLBAR: { format: MarkdownFormat; label: ReactNode; title: string; group: number }[] = [
  { format: "bold", label: <strong>B</strong>, title: "Negrita (Ctrl+B)", group: 0 },
  { format: "italic", label: <em>I</em>, title: "Cursiva (Ctrl+I)", group: 0 },
  { format: "h1", label: "H1", title: "Título", group: 1 },
  { format: "h2", label: "H2", title: "Subtítulo", group: 1 },
  { format: "list", label: "Lista", title: "Lista", group: 2 },
  { format: "table", label: "Tabla", title: "Tabla", group: 2 },
  { format: "code", label: "Código", title: "Código", group: 2 },
];

const SHORTCUTS: Record<string, MarkdownFormat> = { b: "bold", i: "italic" };

/**
 * Edición de Markdown sobre un textarea controlado: los botones de formato, Ctrl+B / Ctrl+I
 * y Enter que continúa una lista. La lógica de texto es pura y vive en src/lib/markdown.ts.
 *
 * Cambiar el valor desde React deja estos cambios fuera del Ctrl+Z nativo del textarea.
 */
export function useMarkdownEditor(value: string, onChange: (next: string) => void) {
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

  function format(kind: MarkdownFormat) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const next = applyFormat({ value, start: textarea.selectionStart, end: textarea.selectionEnd }, kind);
    // Con el mismo texto React no vuelve a renderizar y el efecto no correría.
    if (next.value === value) {
      textarea.setSelectionRange(next.start, next.end);
      return;
    }
    pendingSelection.current = [next.start, next.end];
    onChange(next.value);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && !e.nativeEvent.isComposing) {
      const textarea = e.currentTarget;
      const next = continueList({ value, start: textarea.selectionStart, end: textarea.selectionEnd });
      if (!next) return;
      e.preventDefault();
      pendingSelection.current = [next.start, next.end];
      onChange(next.value);
      return;
    }
    if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
    const kind = SHORTCUTS[e.key.toLowerCase()];
    if (!kind) return;
    e.preventDefault();
    format(kind);
  }

  return { textareaRef, format, onKeyDown };
}

export function MarkdownToolbar({ onFormat }: { onFormat: (kind: MarkdownFormat) => void }) {
  return (
    <div className="doc-e-toolbar" role="toolbar" aria-label="Formato Markdown">
      {TOOLBAR.map(({ format: kind, label, title, group }, index) => (
        <Fragment key={kind}>
          {index > 0 && TOOLBAR[index - 1].group !== group && <span className="toolbar-sep" aria-hidden />}
          {/* preventDefault en mousedown evita que el botón le quite el foco al textarea. */}
          <button
            type="button"
            className="toolbar-btn"
            title={title}
            aria-label={title}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onFormat(kind)}
          >
            {label}
          </button>
        </Fragment>
      ))}
    </div>
  );
}
