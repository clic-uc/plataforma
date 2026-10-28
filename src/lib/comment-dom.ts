// Lado DOM del anclaje de comentarios (la lógica pura está en src/lib/comments.ts): leer la
// selección de la vista previa y resaltar los fragmentos comentados. Solo corre en el navegador.
import { useEffect, useState } from "react";
import { anchorFromRange, findQuote, type CommentAnchor } from "@/lib/comments";

export interface SelectionAnchor extends CommentAnchor {
  /** Esquina inferior derecha de la selección, relativa al contenedor, para ubicar el botón "Comentar". */
  x: number;
  y: number;
}

// Offsets sobre container.textContent, que es lo que Range.toString() recorre también.
function textOffset(container: HTMLElement, node: Node, offset: number): number {
  const range = document.createRange();
  range.selectNodeContents(container);
  range.setEnd(node, offset);
  return range.toString().length;
}

function selectionAnchor(container: HTMLElement): SelectionAnchor | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;

  const text = container.textContent ?? "";
  const anchor = anchorFromRange(
    text,
    textOffset(container, range.startContainer, range.startOffset),
    textOffset(container, range.endContainer, range.endOffset),
  );
  if (!anchor) return null;

  const rects = range.getClientRects();
  const last = rects[rects.length - 1] ?? range.getBoundingClientRect();
  const box = container.getBoundingClientRect();
  return { ...anchor, x: last.right - box.left, y: last.bottom - box.top };
}

/** El fragmento que la persona tiene seleccionado dentro de `container`, o null. */
export function useTextSelection(container: HTMLElement | null): SelectionAnchor | null {
  const [anchor, setAnchor] = useState<SelectionAnchor | null>(null);

  useEffect(() => {
    if (!container) return;
    function update() {
      setAnchor(container ? selectionAnchor(container) : null);
    }
    document.addEventListener("selectionchange", update);
    return () => {
      document.removeEventListener("selectionchange", update);
      setAnchor(null);
    };
  }, [container]);

  return container ? anchor : null;
}

function rangeFor(container: HTMLElement, start: number, end: number): Range | null {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let position = 0;
  let started = false;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.textContent?.length ?? 0;
    if (!started && start < position + length) {
      range.setStart(node, start - position);
      started = true;
    }
    if (started && end <= position + length) {
      range.setEnd(node, end - position);
      return range;
    }
    position += length;
  }
  return null;
}

/** Pinta `anchors` con la CSS Custom Highlight API, sin tocar el DOM que renderiza React. */
export function useHighlight(name: string, container: HTMLElement | null, anchors: CommentAnchor[], deps: unknown[]) {
  useEffect(() => {
    if (!container || typeof CSS === "undefined" || !("highlights" in CSS)) return;

    const text = container.textContent ?? "";
    const ranges: Range[] = [];
    for (const { quote, occurrence } of anchors) {
      const start = findQuote(text, quote, occurrence);
      if (start === -1) continue;
      const range = rangeFor(container, start, start + quote.length);
      if (range) ranges.push(range);
    }
    CSS.highlights.set(name, new Highlight(...ranges));
    return () => {
      CSS.highlights.delete(name);
    };
    // anchors llega como array nuevo en cada render; lo que cambia de verdad va en deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, container, ...deps]);
}

/** Lleva el fragmento comentado a la vista; false si ya no está en el texto. */
export function scrollToQuote(container: HTMLElement, { quote, occurrence }: CommentAnchor): boolean {
  const text = container.textContent ?? "";
  const start = findQuote(text, quote, occurrence);
  if (start === -1) return false;
  const range = rangeFor(container, start, start + quote.length);
  if (!range) return false;
  range.startContainer.parentElement?.scrollIntoView({ block: "center", behavior: "smooth" });
  return true;
}
