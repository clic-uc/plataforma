import { describe, expect, it } from "vitest";
import { anchorFromRange, findQuote, MAX_QUOTE_LENGTH, occurrenceOf, trimRange } from "@/lib/comments";

describe("occurrenceOf / findQuote", () => {
  const text = "uno dos uno tres uno";

  it("numera las repeticiones desde 0 en orden de aparición", () => {
    expect(occurrenceOf(text, 0, "uno")).toBe(0);
    expect(occurrenceOf(text, 8, "uno")).toBe(1);
    expect(occurrenceOf(text, 17, "uno")).toBe(2);
  });

  it("findQuote deshace lo que occurrenceOf cuenta", () => {
    for (const start of [0, 8, 17]) {
      expect(findQuote(text, "uno", occurrenceOf(text, start, "uno"))).toBe(start);
    }
  });

  it("cuenta las repeticiones que se solapan", () => {
    expect(occurrenceOf("aaa", 1, "aa")).toBe(1);
    expect(findQuote("aaa", "aa", 1)).toBe(1);
  });

  it("si ya no hay tantas repeticiones usa la primera", () => {
    expect(findQuote("uno dos", "uno", 2)).toBe(0);
  });

  it("devuelve -1 cuando el fragmento desapareció o está vacío", () => {
    expect(findQuote("dos tres", "uno", 0)).toBe(-1);
    expect(findQuote("dos tres", "", 0)).toBe(-1);
  });
});

describe("trimRange", () => {
  it("quita los espacios de los bordes", () => {
    expect(trimRange("  hola mundo ", 0, 13)).toEqual({ start: 2, end: 12 });
  });

  it("devuelve null si solo hay espacios o la selección es vacía", () => {
    expect(trimRange("a   b", 1, 4)).toBeNull();
    expect(trimRange("abc", 2, 2)).toBeNull();
  });

  it("recorta una selección demasiado larga", () => {
    const long = "x".repeat(MAX_QUOTE_LENGTH + 100);
    expect(trimRange(long, 0, long.length)).toEqual({ start: 0, end: MAX_QUOTE_LENGTH });
  });

  it("acota los extremos al texto", () => {
    expect(trimRange("abc", -5, 99)).toEqual({ start: 0, end: 3 });
  });
});

describe("anchorFromRange", () => {
  it("arma el fragmento y su número de repetición", () => {
    expect(anchorFromRange("uno dos uno", 8, 11)).toEqual({ quote: "uno", occurrence: 1 });
  });

  it("devuelve null sin texto seleccionable", () => {
    expect(anchorFromRange("uno  dos", 3, 5)).toBeNull();
  });
});
