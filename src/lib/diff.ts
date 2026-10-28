// Diff por líneas para el historial de versiones de documentos. Es pura para poder
// probarla sin DOM y usarla igual en servidor o cliente.

export type DiffLine = { kind: "same" | "add" | "del"; text: string };

export type DiffChunk = DiffLine | { kind: "skip"; count: number };

// Tope de celdas de la tabla de LCS. Un documento de ~2000 líneas que cambia entero
// sigue entrando; más allá se muestra como reemplazo completo en vez de colgar la pestaña.
const MAX_CELLS = 4_000_000;

function splitLines(text: string): string[] {
  return text === "" ? [] : text.split("\n");
}

export function diffLines(before: string, after: string): DiffLine[] {
  const a = splitLines(before);
  const b = splitLines(after);

  // Lo común al inicio y al final no necesita LCS, y casi siempre es la mayor parte.
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  ) {
    suffix++;
  }

  const head: DiffLine[] = a.slice(0, prefix).map((text) => ({ kind: "same", text }));
  const tail: DiffLine[] = a.slice(a.length - suffix).map((text) => ({ kind: "same", text }));
  const midA = a.slice(prefix, a.length - suffix);
  const midB = b.slice(prefix, b.length - suffix);

  return [...head, ...diffMiddle(midA, midB), ...tail];
}

function diffMiddle(a: string[], b: string[]): DiffLine[] {
  const n = a.length;
  const m = b.length;
  if ((n + 1) * (m + 1) > MAX_CELLS) {
    return [...a.map((text) => ({ kind: "del" as const, text })), ...b.map((text) => ({ kind: "add" as const, text }))];
  }

  // lcs[i * (m + 1) + j] = largo de la subsecuencia común más larga de a[i..] y b[j..].
  const width = m + 1;
  const lcs = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * width + j] =
        a[i] === b[j] ? lcs[(i + 1) * width + j + 1] + 1 : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
    }
  }

  // Ante un empate se elige borrar primero, así cada cambio se lee como "antes" y "después".
  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      result.push({ kind: "same", text: a[i] });
      i++;
      j++;
    } else if (lcs[(i + 1) * width + j] >= lcs[i * width + j + 1]) {
      result.push({ kind: "del", text: a[i++] });
    } else {
      result.push({ kind: "add", text: b[j++] });
    }
  }
  while (i < n) result.push({ kind: "del", text: a[i++] });
  while (j < m) result.push({ kind: "add", text: b[j++] });
  return result;
}

// Deja `context` líneas sin cambios alrededor de cada cambio y resume el resto en un
// bloque "skip". Un hueco de una sola línea se muestra igual: resumirlo no ahorra nada.
export function collapseUnchanged(lines: DiffLine[], context = 3): DiffChunk[] {
  const keep = lines.map(() => false);
  lines.forEach((line, index) => {
    if (line.kind === "same") return;
    for (let k = Math.max(0, index - context); k <= Math.min(lines.length - 1, index + context); k++) keep[k] = true;
  });

  const chunks: DiffChunk[] = [];
  let index = 0;
  while (index < lines.length) {
    if (keep[index]) {
      chunks.push(lines[index++]);
      continue;
    }
    let end = index;
    while (end < lines.length && !keep[end]) end++;
    if (end - index === 1) chunks.push(lines[index]);
    else chunks.push({ kind: "skip", count: end - index });
    index = end;
  }
  return chunks;
}
