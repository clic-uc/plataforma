import { describe, expect, it } from "vitest";
import { formatLabel, labelNumber, labelsToken, matchesLabelsToken, nextLabel, type LabelledRow } from "@/lib/api/labels";

const rows = (prefix: "F" | "T", ids: string[]): LabelledRow[] =>
  ids.map((id, i) => ({ id, label: formatLabel(prefix, i + 1) }));

describe("labelNumber / nextLabel", () => {
  it("lee el número solo con el prefijo correcto", () => {
    expect(labelNumber("T", "T-07")).toBe(7);
    expect(labelNumber("T", "T-120")).toBe(120);
    expect(labelNumber("F", "T-07")).toBe(0);
    expect(labelNumber("T", "tarea")).toBe(0);
  });

  it("sigue al label más alto, sin reutilizar huecos", () => {
    expect(nextLabel("T", [])).toBe("T-01");
    expect(nextLabel("T", ["T-01", "T-04"])).toBe("T-05");
    expect(nextLabel("F", ["F-09"])).toBe("F-10");
  });
});

describe("labelsToken", () => {
  const features = rows("F", ["fa", "fb", "fc"]);
  const tasks = rows("T", ["ta", "tb", "tc", "td", "te"]);
  const token = `"${labelsToken(features, tasks)}"`;

  it("valida el mismo snapshot, con o sin comillas y como ETag débil", () => {
    expect(matchesLabelsToken(token, features, tasks)).toBe(true);
    expect(matchesLabelsToken(labelsToken(features, tasks), features, tasks)).toBe(true);
    expect(matchesLabelsToken(`W/${token}`, features, tasks)).toBe(true);
  });

  it("sigue siendo válido cuando se crean features o tareas", () => {
    expect(matchesLabelsToken(token, features, [...tasks, { id: "tf", label: "T-06" }])).toBe(true);
    expect(matchesLabelsToken(token, [...features, { id: "fd", label: "F-04" }], tasks)).toBe(true);
  });

  it("deja de ser válido cuando se borra algo que el snapshot vio", () => {
    // Borrar T-02 renumera: T-03 pasa a ser T-02, etc.
    expect(matchesLabelsToken(token, features, rows("T", ["ta", "tc", "td", "te"]))).toBe(false);
    // Borrar la última no renumera, pero T-05 ya no existe.
    expect(matchesLabelsToken(token, features, rows("T", ["ta", "tb", "tc", "td"]))).toBe(false);
    expect(matchesLabelsToken(token, rows("F", ["fa", "fc"]), tasks)).toBe(false);
  });

  it("deja de ser válido si un label que vio el snapshot ahora es otra entidad", () => {
    const reused = [...rows("T", ["ta", "tb", "tc", "td"]), { id: "nueva", label: "T-05" }];
    expect(matchesLabelsToken(token, features, reused)).toBe(false);
  });

  it("rechaza tokens mal formados", () => {
    expect(matchesLabelsToken("", features, tasks)).toBe(false);
    expect(matchesLabelsToken('"basura"', features, tasks)).toBe(false);
    expect(matchesLabelsToken('"3.5.otrodigest"', features, tasks)).toBe(false);
  });
});
