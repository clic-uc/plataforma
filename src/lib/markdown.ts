// Lógica de la barra de formato del editor de documentos: recibe el texto y la
// selección del textarea y devuelve el texto nuevo con la selección que debe quedar.
// Es pura para poder probarla sin DOM.
//
// No hay botón de lista de tareas (`- [ ]`) a propósito: chocaría con la entidad Task
// del proyecto. Ver "Documents and actas" en CLAUDE.md.

export type TextSelection = { value: string; start: number; end: number };

export type MarkdownFormat = "bold" | "italic" | "h1" | "h2" | "list" | "table" | "code";

export const TABLE_TEMPLATE = "| Columna 1 | Columna 2 |\n| --- | --- |\n|  |  |";

export function applyFormat(selection: TextSelection, format: MarkdownFormat): TextSelection {
  switch (format) {
    case "bold":
      return toggleEmphasis(selection, 2);
    case "italic":
      return toggleEmphasis(selection, 1);
    case "h1":
      return toggleHeading(selection, 1);
    case "h2":
      return toggleHeading(selection, 2);
    case "list":
      return toggleList(selection);
    case "table":
      return insertTable(selection);
    case "code":
      return insertCode(selection);
  }
}

// ─── Énfasis en línea ───

function countRun(text: string, char: string, fromEnd: boolean): number {
  let n = 0;
  while (n < text.length && text[fromEnd ? text.length - 1 - n : n] === char) n++;
  return n;
}

// `**` es negrita, `*` cursiva y `***` ambas, así que el largo de la racha de asteriscos
// pegada a la selección dice qué formato ya está aplicado.
function toggleEmphasis(selection: TextSelection, size: 1 | 2): TextSelection {
  const { value, start, end } = selection;
  const before = value.slice(0, start);
  const after = value.slice(end);
  const run = Math.min(countRun(before, "*", true), countRun(after, "*", false));
  const active = size === 2 ? run >= 2 : run === 1 || run >= 3;

  if (active) {
    return {
      value: before.slice(0, before.length - size) + value.slice(start, end) + after.slice(size),
      start: start - size,
      end: end - size,
    };
  }
  return wrap(selection, "*".repeat(size));
}

// Envuelve la selección con el marcador. Los espacios de los bordes quedan fuera:
// `** hola**` no es negrita en Markdown, y el doble clic en Windows selecciona el espacio
// que sigue a la palabra.
function wrap({ value, start, end }: TextSelection, marker: string): TextSelection {
  const selected = value.slice(start, end);
  const inner = selected.trim();
  if (!inner) {
    return {
      value: value.slice(0, start) + marker + marker + value.slice(start),
      start: start + marker.length,
      end: start + marker.length,
    };
  }
  const lead = selected.length - selected.trimStart().length;
  const innerStart = start + lead;
  const innerEnd = innerStart + inner.length;
  return {
    value: value.slice(0, innerStart) + marker + inner + marker + value.slice(innerEnd),
    start: innerStart + marker.length,
    end: innerEnd + marker.length,
  };
}

// ─── Prefijos de línea ───

function lineRange(value: string, start: number, end: number): [number, number] {
  // lastIndexOf con índice negativo busca igual en la posición 0, de ahí el caso aparte.
  const lineStart = start === 0 ? 0 : value.lastIndexOf("\n", start - 1) + 1;
  // Una selección que termina justo al inicio de una línea no la incluye.
  const effectiveEnd = end > start && value[end - 1] === "\n" ? end - 1 : end;
  const nextBreak = value.indexOf("\n", effectiveEnd);
  return [lineStart, nextBreak === -1 ? value.length : nextBreak];
}

// Reemplaza las líneas que toca la selección. Con el cursor sin selección, lo deja en la
// misma posición relativa al texto de la línea; con selección, selecciona las líneas
// transformadas completas.
function transformLines(selection: TextSelection, transform: (lines: string[]) => string[]): TextSelection {
  const { value, start, end } = selection;
  const [from, to] = lineRange(value, start, end);
  const lines = value.slice(from, to).split("\n");
  const next = transform(lines).join("\n");
  const result = value.slice(0, from) + next + value.slice(to);

  if (start === end) {
    const delta = next.length - (to - from);
    const cursor = Math.max(from, start + delta);
    return { value: result, start: cursor, end: cursor };
  }
  return { value: result, start: from, end: from + next.length };
}

const HEADING = /^#{1,6} /;

// Las líneas vacías dentro de una selección de varias líneas se dejan tal cual (separan
// párrafos). Si todo lo seleccionado está vacío —el cursor en una línea en blanco— el
// prefijo se pone igual, para empezar a escribir el título o la lista ahí.
function targetLines(lines: string[]): string[] {
  const filled = lines.filter((line) => line.trim());
  return filled.length > 0 ? filled : lines;
}

function toggleHeading(selection: TextSelection, level: 1 | 2): TextSelection {
  const prefix = "#".repeat(level) + " ";
  return transformLines(selection, (lines) => {
    const targets = targetLines(lines);
    const allAtLevel = targets.every((line) => line.startsWith(prefix));
    return lines.map((line) => {
      if (!targets.includes(line)) return line;
      const text = line.replace(HEADING, "");
      return allAtLevel ? text : prefix + text;
    });
  });
}

function toggleList(selection: TextSelection): TextSelection {
  return transformLines(selection, (lines) => {
    const targets = targetLines(lines);
    const allListed = targets.every((line) => line.startsWith("- "));
    return lines.map((line) => {
      if (!targets.includes(line)) return line;
      if (allListed) return line.slice(2);
      return line.startsWith("- ") ? line : "- " + line;
    });
  });
}

// Enter dentro de un ítem de lista abre el siguiente ítem; Enter en un ítem vacío termina la
// lista. Devuelve null cuando Enter debe comportarse normal.
export function continueList({ value, start, end }: TextSelection): TextSelection | null {
  if (start !== end) return null;
  const [from, to] = lineRange(value, start, end);
  const line = value.slice(from, to);
  if (!line.startsWith("- ") || start < from + 2) return null;

  if (line.trim() === "-") {
    return { value: value.slice(0, from) + value.slice(to), start: from, end: from };
  }
  const cursor = start + "\n- ".length;
  return { value: value.slice(0, start) + "\n- " + value.slice(start), start: cursor, end: cursor };
}

// ─── Bloques ───

// Lo que hay que agregar para que un bloque quede separado por una línea en blanco del
// texto que lo rodea. Una tabla pegada a un párrafo no se reconoce como tabla.
function blockGap(before: string, after: string): [string, string] {
  const lead = before === "" || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const trail = after === "" || after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n";
  return [lead, trail];
}

// La tabla se inserta después de la selección, sin reemplazarla, y queda seleccionado el
// primer encabezado para escribir encima.
function insertTable({ value, end }: TextSelection): TextSelection {
  const before = value.slice(0, end);
  const after = value.slice(end);
  const [lead, trail] = blockGap(before, after);
  const tableStart = before.length + lead.length;
  const header = "Columna 1";
  const headerStart = tableStart + TABLE_TEMPLATE.indexOf(header);
  return {
    value: before + lead + TABLE_TEMPLATE + trail + after,
    start: headerStart,
    end: headerStart + header.length,
  };
}

// Selección dentro de una línea → código en línea con comillas invertidas. Selección de
// varias líneas, o cursor en una línea vacía → bloque de código.
function insertCode(selection: TextSelection): TextSelection {
  const { value, start, end } = selection;
  const selected = value.slice(start, end);
  const [from, to] = lineRange(value, start, end);
  const onBlankLine = start === end && value.slice(from, to).trim() === "";

  if (!selected.includes("\n") && !onBlankLine) {
    const before = value.slice(0, start);
    const after = value.slice(end);
    const run = Math.min(countRun(before, "`", true), countRun(after, "`", false));
    if (run === 1) {
      return { value: before.slice(0, -1) + selected + after.slice(1), start: start - 1, end: end - 1 };
    }
    return wrap(selection, "`");
  }

  const before = value.slice(0, from);
  const after = value.slice(to);
  const body = value.slice(from, to);
  const [lead, trail] = blockGap(before, after);
  const bodyStart = before.length + lead.length + "```\n".length;
  return {
    value: before + lead + "```\n" + body + "\n```" + trail + after,
    start: bodyStart,
    end: bodyStart + body.length,
  };
}
