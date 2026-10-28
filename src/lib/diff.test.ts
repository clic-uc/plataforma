import { describe, expect, it } from "vitest";
import { collapseUnchanged, diffLines, type DiffChunk, type DiffLine } from "@/lib/diff";

// Cada línea se escribe como en un diff unificado: " " igual, "+" agregada, "-" borrada.
function show(lines: DiffChunk[]): string[] {
  return lines.map((line) =>
    line.kind === "skip" ? `… ${line.count}` : `${{ same: " ", add: "+", del: "-" }[line.kind]}${line.text}`,
  );
}

describe("diffLines", () => {
  it("sin cambios devuelve todo igual", () => {
    expect(show(diffLines("a\nb", "a\nb"))).toEqual([" a", " b"]);
  });

  it("desde un documento vacío todo es agregado, sin una línea vacía borrada", () => {
    expect(show(diffLines("", "a\nb"))).toEqual(["+a", "+b"]);
    expect(show(diffLines("a", ""))).toEqual(["-a"]);
  });

  it("una línea cambiada se lee como borrar y agregar", () => {
    expect(show(diffLines("a\nb\nc", "a\nB\nc"))).toEqual([" a", "-b", "+B", " c"]);
  });

  it("encuentra las líneas comunes en medio de los cambios", () => {
    expect(show(diffLines("a\nx\nb\ny\nc", "a\nb\nz\nc"))).toEqual([" a", "-x", " b", "-y", "+z", " c"]);
  });

  it("agregados al inicio y al final", () => {
    expect(show(diffLines("b", "a\nb\nc"))).toEqual(["+a", " b", "+c"]);
  });
});

describe("collapseUnchanged", () => {
  const same = (text: string): DiffLine => ({ kind: "same", text });

  it("resume lo que queda lejos de los cambios", () => {
    const lines = [...["1", "2", "3", "4", "5"].map(same), { kind: "add" as const, text: "x" }, ...["6", "7", "8", "9"].map(same)];
    expect(show(collapseUnchanged(lines, 2))).toEqual(["… 3", " 4", " 5", "+x", " 6", " 7", "… 2"]);
  });

  it("no resume un hueco de una sola línea", () => {
    const lines = [same("1"), same("2"), { kind: "del" as const, text: "x" }];
    expect(show(collapseUnchanged(lines, 1))).toEqual([" 1", " 2", "-x"]);
  });

  it("sin cambios queda todo en un bloque", () => {
    expect(show(collapseUnchanged(["1", "2", "3"].map(same)))).toEqual(["… 3"]);
  });
});
