import { describe, expect, it } from "vitest";
import { columnStints, formatDuration, formatEffort, summarizeTaskHistory, taskPeriods, type TaskTransitionRow } from "@/lib/task-history";

const H = 60 * 60 * 1000;
const t0 = new Date("2026-10-26T12:00:00.000Z");
const at = (hours: number) => new Date(t0.getTime() + hours * H);

const row = (hours: number, toColumn: TaskTransitionRow["toColumn"], assigneeId: string | null): TaskTransitionRow => ({
  fromColumn: null,
  toColumn,
  assigneeId,
  at: at(hours),
});

describe("taskPeriods", () => {
  it("cada fila dura hasta la siguiente y la última sigue abierta", () => {
    const periods = taskPeriods([row(5, "PROGRESO", "ana"), row(0, "PENDIENTE", null)], at(8));
    expect(periods).toEqual([
      { column: "PENDIENTE", assigneeId: null, from: at(0), to: at(5), open: false },
      { column: "PROGRESO", assigneeId: "ana", from: at(5), to: at(8), open: true },
    ]);
  });
});

describe("summarizeTaskHistory", () => {
  const full = [
    row(0, "PENDIENTE", null),
    row(2, "PROGRESO", "ana"),
    row(10, "REVISAR", null),
    row(14, "REVISION", "beto"),
    row(15, "PROGRESO", "ana"), // la revisión la devolvió
    row(17, "REVISION", "beto"),
    row(18, "LISTO", "beto"),
  ];

  it("suma el tiempo por columna, también si una columna se repite", () => {
    const s = summarizeTaskHistory(full, at(0), at(30));
    expect(s.columnMs).toEqual({ PENDIENTE: 2 * H, PROGRESO: 10 * H, REVISAR: 4 * H, REVISION: 2 * H, LISTO: 12 * H });
  });

  it("sabe quién la trabajó, quién la revisó y los tiempos de ciclo", () => {
    const s = summarizeTaskHistory(full, at(0), at(30));
    expect(s.workerIds).toEqual(["ana"]);
    expect(s.reviewerIds).toEqual(["beto"]);
    expect(s.startedAt).toEqual(at(2));
    expect(s.completedAt).toEqual(at(18));
    expect(s.cycleMs).toBe(16 * H);
    expect(s.leadMs).toBe(18 * H);
  });

  it("un cambio de asignado dentro de la columna suma a otra persona", () => {
    const s = summarizeTaskHistory([row(0, "PROGRESO", "ana"), row(3, "PROGRESO", "caro")], at(0), at(5));
    expect(s.workerIds).toEqual(["ana", "caro"]);
    expect(s.columnMs.PROGRESO).toBe(5 * H);
  });

  it("sin llegar a Listo no hay fecha de término ni ciclo", () => {
    const s = summarizeTaskHistory([row(0, "PENDIENTE", null), row(1, "PROGRESO", "ana")], at(0), at(4));
    expect(s.completedAt).toBeNull();
    expect(s.cycleMs).toBeNull();
    expect(s.leadMs).toBeNull();
  });

  it("reasignar una tarea que ya está en Listo no mueve su fecha de término", () => {
    const s = summarizeTaskHistory([row(0, "PROGRESO", "ana"), row(2, "LISTO", "ana"), row(5, "LISTO", "beto")], at(0), at(8));
    expect(s.completedAt).toEqual(at(2));
    expect(s.cycleMs).toBe(2 * H);
  });

  it("si salió de Listo deja de contar como terminada", () => {
    const s = summarizeTaskHistory([row(0, "LISTO", null), row(2, "PROGRESO", "ana")], at(0), at(4));
    expect(s.completedAt).toBeNull();
  });
});

describe("formatDuration", () => {
  const MIN = 60 * 1000;
  it("usa dos unidades como máximo", () => {
    expect(formatDuration(3 * 24 * H + 4 * H + 30 * MIN)).toBe("3 d 4 h");
    expect(formatDuration(5 * H + 20 * MIN)).toBe("5 h 20 min");
    expect(formatDuration(45 * MIN)).toBe("45 min");
  });

  it("omite la unidad menor cuando es cero", () => {
    expect(formatDuration(2 * 24 * H + 10 * MIN)).toBe("2 d");
    expect(formatDuration(3 * H)).toBe("3 h");
  });

  it("bajo un minuto no dice 0 min", () => {
    expect(formatDuration(0)).toBe("menos de 1 min");
    expect(formatDuration(59 * 1000)).toBe("menos de 1 min");
  });
});

describe("formatEffort", () => {
  it("cuenta en horas sin pasar a días", () => {
    expect(formatEffort(30 * 60)).toBe("30 h");
    expect(formatEffort(90)).toBe("1 h 30 min");
    expect(formatEffort(45)).toBe("45 min");
  });
});

describe("columnStints", () => {
  it("junta los cambios de asignado dentro de la misma columna en un solo tramo", () => {
    const rows = [row(0, "PENDIENTE", null), row(2, "PROGRESO", "ana"), row(5, "PROGRESO", "caro"), row(9, "LISTO", "caro")];
    const stints = columnStints(rows, at(12));
    expect(stints.map((s) => [s.column, s.from, s.to, s.open])).toEqual([
      ["PENDIENTE", at(0), at(2), false],
      ["PROGRESO", at(2), at(9), false],
      ["LISTO", at(9), at(12), true],
    ]);
    expect(stints[1].row).toBe(rows[1]);
  });

  it("una columna a la que se vuelve es un tramo nuevo", () => {
    const stints = columnStints([row(0, "PROGRESO", "ana"), row(1, "REVISION", "beto"), row(2, "PROGRESO", "ana")], at(3));
    expect(stints.map((s) => s.column)).toEqual(["PROGRESO", "REVISION", "PROGRESO"]);
  });

  it("la llegada a Listo es la del tramo, aunque después cambie el asignado", () => {
    const stints = columnStints([row(0, "PROGRESO", "ana"), row(4, "LISTO", "ana"), row(6, "LISTO", "beto")], at(8));
    expect(stints.at(-1)).toMatchObject({ column: "LISTO", from: at(4), open: true });
  });

  it("sin filas no hay tramos", () => {
    expect(columnStints([], at(0))).toEqual([]);
  });
});
