import { describe, expect, it } from "vitest";
import { pendingPeriods, PENDING_HOURS_WINDOW_DAYS, type LinkedEntry, type PendingTransitionRow } from "@/lib/pending-hours";

const DAY_MS = 24 * 60 * 60 * 1000;
// Jueves 29 oct 2026, 15:00 en Chile.
const now = new Date("2026-10-29T18:00:00.000Z");

function row(id: string, toColumn: PendingTransitionRow["toColumn"], assigneeId: string | null, at: string, dismissed?: string): PendingTransitionRow {
  return { id, toColumn, assigneeId, at: new Date(at), hoursDismissedAt: dismissed ? new Date(dismissed) : null };
}

function entry(kind: string, createdAt: string, taskId = "t1"): LinkedEntry {
  return { taskId, kind, createdAt: new Date(createdAt) };
}

const pending = (rows: PendingTransitionRow[], entries: LinkedEntry[] = []) => pendingPeriods("t1", rows, entries, "yo", now);

describe("pendingPeriods", () => {
  it("da un período terminado en En progreso con su tipo, inicio, fin y fecha propuesta en Chile", () => {
    const rows = [
      row("r1", "PENDIENTE", null, "2026-10-20T12:00:00.000Z"),
      row("r2", "PROGRESO", "yo", "2026-10-21T12:00:00.000Z"),
      // 22:30 del 27 en Chile ya es 28 en UTC: la fecha propuesta es la de Chile.
      row("r3", "REVISAR", null, "2026-10-28T01:30:00.000Z"),
    ];
    expect(pending(rows)).toEqual([
      {
        transitionId: "r2",
        kind: "TRABAJO",
        from: new Date("2026-10-21T12:00:00.000Z"),
        to: new Date("2026-10-28T01:30:00.000Z"),
        suggestedDate: "2026-10-27",
      },
    ]);
  });

  it("En revisión da horas de revisión; las demás columnas no cuentan", () => {
    const rows = [
      row("r1", "PENDIENTE", "yo", "2026-10-20T12:00:00.000Z"),
      row("r2", "REVISAR", "yo", "2026-10-21T12:00:00.000Z"),
      row("r3", "REVISION", "yo", "2026-10-22T12:00:00.000Z"),
      row("r4", "LISTO", "yo", "2026-10-23T12:00:00.000Z"),
    ];
    expect(pending(rows)).toMatchObject([{ transitionId: "r3", kind: "REVISION" }]);
  });

  it("el período abierto (la tarea sigue ahí) no está pendiente", () => {
    expect(pending([row("r1", "PROGRESO", "yo", "2026-10-21T12:00:00.000Z")])).toEqual([]);
  });

  it("un cambio de asignado cierra el período aunque la tarea no se mueva", () => {
    const rows = [
      row("r1", "PROGRESO", "yo", "2026-10-21T12:00:00.000Z"),
      row("r2", "PROGRESO", "ana", "2026-10-22T12:00:00.000Z"),
    ];
    expect(pending(rows)).toMatchObject([{ transitionId: "r1", to: new Date("2026-10-22T12:00:00.000Z") }]);
  });

  it("solo los períodos en que el asignado era yo", () => {
    const rows = [
      row("r1", "PROGRESO", "ana", "2026-10-21T12:00:00.000Z"),
      row("r2", "REVISION", "yo", "2026-10-22T12:00:00.000Z"),
      row("r3", "LISTO", null, "2026-10-23T12:00:00.000Z"),
    ];
    expect(pending(rows).map((p) => p.transitionId)).toEqual(["r2"]);
  });

  it("junta filas seguidas con la misma columna y el mismo asignado", () => {
    const rows = [
      row("r1", "PROGRESO", "yo", "2026-10-21T12:00:00.000Z"),
      row("r2", "PROGRESO", "yo", "2026-10-22T12:00:00.000Z"),
      row("r3", "REVISAR", null, "2026-10-23T12:00:00.000Z"),
    ];
    expect(pending(rows)).toMatchObject([
      { transitionId: "r1", from: new Date("2026-10-21T12:00:00.000Z"), to: new Date("2026-10-23T12:00:00.000Z") },
    ]);
  });

  it("ordena del más reciente al más antiguo, aunque las filas lleguen desordenadas", () => {
    const rows = [
      row("r4", "REVISION", "yo", "2026-10-24T12:00:00.000Z"),
      row("r1", "PROGRESO", "yo", "2026-10-21T12:00:00.000Z"),
      row("r5", "LISTO", "yo", "2026-10-25T12:00:00.000Z"),
      row("r2", "REVISAR", null, "2026-10-22T12:00:00.000Z"),
    ];
    expect(pending(rows).map((p) => [p.transitionId, p.kind])).toEqual([
      ["r4", "REVISION"],
      ["r1", "TRABAJO"],
    ]);
  });

  it("deja fuera los que terminaron antes de la ventana", () => {
    const end = new Date(now.getTime() - PENDING_HOURS_WINDOW_DAYS * DAY_MS);
    const rows = (endAt: Date) => [
      row("r1", "PROGRESO", "yo", "2026-08-01T12:00:00.000Z"),
      row("r2", "LISTO", "yo", endAt.toISOString()),
    ];
    expect(pending(rows(end))).toHaveLength(1);
    expect(pending(rows(new Date(end.getTime() - 1)))).toEqual([]);
  });

  it("descartar la fila que abrió el período lo resuelve", () => {
    const rows = [
      row("r1", "PROGRESO", "yo", "2026-10-21T12:00:00.000Z", "2026-10-25T12:00:00.000Z"),
      row("r2", "LISTO", "yo", "2026-10-23T12:00:00.000Z"),
    ];
    expect(pending(rows)).toEqual([]);
  });

  it("lo resuelve un registro mío de la tarea y el tipo, creado desde el inicio del período", () => {
    const rows = [
      row("r1", "PROGRESO", "yo", "2026-10-21T12:00:00.000Z"),
      row("r2", "LISTO", "yo", "2026-10-23T12:00:00.000Z"),
    ];
    // Registrado al moverla (en el instante del cambio) o después, en /tiempo.
    expect(pending(rows, [entry("TRABAJO", "2026-10-23T12:00:00.000Z")])).toEqual([]);
    expect(pending(rows, [entry("TRABAJO", "2026-10-28T12:00:00.000Z")])).toEqual([]);
    // Otro tipo, otra tarea o un registro anterior al período no cuentan.
    expect(pending(rows, [entry("REVISION", "2026-10-23T12:00:00.000Z")])).toHaveLength(1);
    expect(pending(rows, [entry("TRABAJO", "2026-10-23T12:00:00.000Z", "t2")])).toHaveLength(1);
    expect(pending(rows, [entry("TRABAJO", "2026-10-20T12:00:00.000Z")])).toHaveLength(1);
  });

  it("un registro posterior al segundo paso por En progreso resuelve ambos", () => {
    const rows = [
      row("r1", "PROGRESO", "yo", "2026-10-21T12:00:00.000Z"),
      row("r2", "REVISAR", null, "2026-10-22T12:00:00.000Z"),
      row("r3", "PROGRESO", "yo", "2026-10-24T12:00:00.000Z"),
      row("r4", "LISTO", null, "2026-10-25T12:00:00.000Z"),
    ];
    expect(pending(rows).map((p) => p.transitionId)).toEqual(["r3", "r1"]);
    expect(pending(rows, [entry("TRABAJO", "2026-10-22T12:00:00.000Z")]).map((p) => p.transitionId)).toEqual(["r3"]);
    expect(pending(rows, [entry("TRABAJO", "2026-10-25T12:00:00.000Z")])).toEqual([]);
  });
});
