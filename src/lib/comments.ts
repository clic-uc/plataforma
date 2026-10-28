// Anclaje de comentarios a un fragmento de texto. Un comentario guarda el texto seleccionado
// (quote) y cuál de sus repeticiones es (occurrence, 0 = la primera), en vez de posiciones:
// las posiciones se desfasan con cualquier edición anterior, el texto no. El texto es el de la
// vista previa ya renderizada, es decir sin la sintaxis Markdown.

/** Largo máximo de un fragmento citado; una selección más larga se recorta. */
export const MAX_QUOTE_LENGTH = 500;
export const MAX_COMMENT_LENGTH = 2000;

function occurrences(text: string, quote: string): number[] {
  const found: number[] = [];
  if (!quote) return found;
  // Se avanza de a uno y no de a `quote.length` para que "aa" cuente dos veces en "aaa";
  // así occurrenceOf y findQuote coinciden siempre en qué número le toca a cada repetición.
  for (let i = text.indexOf(quote); i !== -1; i = text.indexOf(quote, i + 1)) found.push(i);
  return found;
}

/** Cuántas repeticiones de `quote` empiezan antes de `start`: el `occurrence` de la que empieza en `start`. */
export function occurrenceOf(text: string, start: number, quote: string): number {
  return occurrences(text, quote).filter((index) => index < start).length;
}

/**
 * Posición de la repetición `occurrence` de `quote` en `text`. Si el texto cambió y ya no hay
 * tantas repeticiones se usa la primera; -1 solo si el fragmento desapareció.
 */
export function findQuote(text: string, quote: string, occurrence: number): number {
  const found = occurrences(text, quote);
  return found[occurrence] ?? found[0] ?? -1;
}

/**
 * Recorta los espacios de los bordes de una selección y el largo a MAX_QUOTE_LENGTH.
 * Devuelve null si no queda texto.
 */
export function trimRange(text: string, start: number, end: number): { start: number; end: number } | null {
  let s = Math.max(0, start);
  let e = Math.min(text.length, end);
  while (s < e && /\s/.test(text[s])) s++;
  while (e > s && /\s/.test(text[e - 1])) e--;
  if (e - s > MAX_QUOTE_LENGTH) e = s + MAX_QUOTE_LENGTH;
  return e > s ? { start: s, end: e } : null;
}

export interface CommentAnchor {
  quote: string;
  occurrence: number;
}

/** Ancla para la selección [start, end) de `text`, o null si no hay texto seleccionable. */
export function anchorFromRange(text: string, start: number, end: number): CommentAnchor | null {
  const range = trimRange(text, start, end);
  if (!range) return null;
  const quote = text.slice(range.start, range.end);
  return { quote, occurrence: occurrenceOf(text, range.start, quote) };
}
