import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildKanbanReport,
  durationStats,
  percentile,
  taskFlow,
  weekOfInstant,
  type KanbanTaskInput,
  type KanbanTransitionInput,
} from "@/lib/kanban-metrics";
import type { AnalyticsMember } from "@/lib/analytics";

const originalTZ = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "America/Santiago";
});
afterAll(() => {
  if (originalTZ === undefined) delete process.env.TZ;
  else process.env.TZ = originalTZ;
});

const H = 60 * 60 * 1000;
const D = 24 * H;

// Jueves 29 de octubre de 2026, 12:00 en Chile (UTC−3). La semana en curso empieza el lunes 26.
const NOW = new Date("2026-10-29T15:00:00.000Z");
// La migración que creó el historial corrió el lunes 19 a mediodía.
const MIGRATION = new Date("2026-10-19T15:00:00.000Z");
const WEEKS = ["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"];

const ana: AnalyticsMember = { id: "ana", name: "Ana", initials: "AN", image: null, role: "EQUIPO", status: "ACTIVO" };

/** Fila escrita por la app, `days` días después de la migración. */
function moved(days: number, toColumn: KanbanTransitionInput["toColumn"], assigneeId: string | null = "ana"): KanbanTransitionInput {
  return { fromColumn: "PENDIENTE", toColumn, assigneeId, byId: "yo", at: new Date(MIGRATION.getTime() + days * D) };
}

/** Fila de creación escrita por la app. */
function created(days: number, toColumn: KanbanTransitionInput["toColumn"] = "PENDIENTE"): KanbanTransitionInput {
  return { ...moved(days, toColumn, null), fromColumn: null };
}

/** Fila inicial que puso la migración. */
function backfill(toColumn: KanbanTransitionInput["toColumn"], assigneeId: string | null = null): KanbanTransitionInput {
  return { fromColumn: null, toColumn, assigneeId, byId: null, at: MIGRATION };
}

function task(id: string, transitions: KanbanTransitionInput[], extra: Partial<KanbanTaskInput> = {}): KanbanTaskInput {
  const last = [...transitions].sort((a, b) => a.at.getTime() - b.at.getTime()).at(-1);
  return {
    id,
    label: id,
    name: `Tarea ${id}`,
    projectId: "p1",
    column: last?.toColumn ?? "PENDIENTE",
    difficulty: null,
    createdAt: transitions[0]?.at ?? MIGRATION,
    assignee: null,
    transitions,
    ...extra,
  };
}

function report(tasks: KanbanTaskInput[], extra: Partial<Parameters<typeof buildKanbanReport>[0]> = {}) {
  return buildKanbanReport({
    weeks: WEEKS,
    now: NOW,
    projectId: null,
    projects: [
      { id: "p1", name: "Plataforma" },
      { id: "p2", name: "CESFAM" },
    ],
    tasks,
    effort: [],
    rangeHours: [],
    ...extra,
  });
}

describe("percentile", () => {
  it("interpola entre rangos y no depende del orden", () => {
    expect(percentile([], 0.5)).toBeNull();
    expect(percentile([7], 0.85)).toBe(7);
    expect(percentile([4, 1, 3, 2], 0.5)).toBe(2.5);
    expect(percentile([1, 2, 3, 4, 5], 0.85)).toBeCloseTo(4.4);
  });

  it("el p85 solo se calcula con 5 muestras o más", () => {
    expect(durationStats([1, 2, 3, 4])).toEqual({ count: 4, medianMs: 2.5, p85Ms: null });
    expect(durationStats([1, 2, 3, 4, 5]).p85Ms).toBeCloseTo(4.4);
    expect(durationStats([])).toEqual({ count: 0, medianMs: null, p85Ms: null });
  });
});

describe("weekOfInstant", () => {
  it("usa la semana de Chile: el domingo 23:30 en Chile ya es lunes en UTC", () => {
    expect(weekOfInstant(new Date("2026-10-26T02:30:00.000Z"))).toBe("2026-10-19");
  });
});

describe("taskFlow", () => {
  it("con historia completa: ciclo desde la primera entrada a En progreso y lead desde la creación", () => {
    const flow = taskFlow(task("t", [created(0), moved(1, "PROGRESO"), moved(3, "REVISION"), moved(4, "PROGRESO"), moved(6, "LISTO")]), NOW);
    expect(flow.cycleMs).toBe(5 * D);
    expect(flow.leadMs).toBe(6 * D);
  });

  it("una tarea que ya estaba en Listo al empezar el historial no cuenta como terminada", () => {
    const flow = taskFlow(task("t", [backfill("LISTO")]), NOW);
    expect(flow.completedAt).toBeNull();
  });

  it("una tarea anterior al historial que termina después tiene ciclo si se vio entrar a En progreso, pero no lead", () => {
    const flow = taskFlow(task("t", [backfill("PENDIENTE"), moved(1, "PROGRESO"), moved(3, "LISTO")]), NOW);
    expect(flow.cycleMs).toBe(2 * D);
    expect(flow.leadMs).toBeNull();
  });

  it("si ya estaba En progreso al empezar el historial, el ciclo es desconocido", () => {
    const flow = taskFlow(task("t", [backfill("PROGRESO", "ana"), moved(2, "LISTO")]), NOW);
    expect(flow.completedAt).not.toBeNull();
    expect(flow.cycleMs).toBeNull();
  });

  it("reasignar una tarea terminada no mueve su fecha de término", () => {
    const flow = taskFlow(task("t", [created(0), moved(1, "PROGRESO"), moved(2, "LISTO"), moved(5, "LISTO", "beto")]), NOW);
    expect(flow.completedAt).toEqual(moved(2, "LISTO").at);
  });

  it("si pasó directo a Listo hay lead pero no ciclo", () => {
    const flow = taskFlow(task("t", [created(0), moved(2, "LISTO")]), NOW);
    expect(flow.cycleMs).toBeNull();
    expect(flow.leadMs).toBe(2 * D);
  });
});

describe("buildKanbanReport", () => {
  it("sin historial nuevo queda todo vacío, pero el WIP antiguo aparece con su entrada desconocida", () => {
    const r = report([task("T-01", [backfill("LISTO")], { column: "LISTO" }), task("T-02", [backfill("PROGRESO", "ana")], { assignee: ana })]);
    expect(r.throughput.total).toBe(0);
    expect(r.throughput.weeks.map((w) => w.total)).toEqual([0, 0, 0, 0]);
    expect(r.overall).toMatchObject({ completed: 0, cycle: { count: 0, medianMs: null } });
    expect(r.columns.every((c) => c.stats.count === 0)).toBe(true);
    expect(r.wip).toEqual([
      expect.objectContaining({ label: "T-02", column: "PROGRESO", sinceKnown: false, since: MIGRATION.toISOString(), ageMs: 10 * D }),
    ]);
    expect(r.wipByColumn).toEqual({ PROGRESO: 1, REVISAR: 0, REVISION: 0 });
    expect(r.historySince).toBe(MIGRATION.toISOString());
  });

  it("cuenta las tareas terminadas por semana de Chile y por proyecto", () => {
    const r = report([
      task("T-01", [created(0), moved(1, "PROGRESO"), moved(2, "LISTO")]), // miércoles 21
      task("T-02", [created(0), moved(1, "PROGRESO"), moved(8, "LISTO")]), // martes 27
      task("T-03", [created(0), moved(1, "PROGRESO"), moved(9, "LISTO")], { projectId: "p2" }), // miércoles 28
      task("T-04", [created(0), moved(1, "PROGRESO")]),
    ]);
    expect(r.throughput.total).toBe(3);
    expect(r.throughput.weeks.map((w) => w.total)).toEqual([0, 0, 1, 2]);
    // Colores por nombre: CESFAM antes que Plataforma.
    expect(r.throughput.series.map((s) => [s.name, s.slot, s.count])).toEqual([
      ["CESFAM", 1, 1],
      ["Plataforma", 2, 2],
    ]);
    expect(r.throughput.weeks[3].segments).toEqual([
      { key: "p2", count: 1 },
      { key: "p1", count: 1 },
    ]);
  });

  it("no cuenta lo que terminó antes del rango", () => {
    const old = new Date("2026-09-01T15:00:00.000Z");
    const r = report([
      task("T-01", [
        { ...created(0), at: old },
        { ...moved(0, "LISTO"), at: new Date(old.getTime() + D) },
      ]),
    ]);
    expect(r.throughput.total).toBe(0);
    expect(r.overall.completed).toBe(0);
  });

  it("ciclo y lead por proyecto y por dificultad, con horas dedicadas", () => {
    const r = report(
      [
        task("T-01", [created(0), moved(1, "PROGRESO"), moved(3, "LISTO")], { difficulty: "BAJA" }),
        task("T-02", [created(0), moved(2, "PROGRESO"), moved(6, "LISTO")], { difficulty: "ALTA" }),
        task("T-03", [created(0), moved(1, "PROGRESO"), moved(2, "LISTO")], { difficulty: "BAJA", projectId: "p2" }),
      ],
      {
        effort: [
          { taskId: "T-01", kind: "TRABAJO", minutes: 120 },
          { taskId: "T-01", kind: "REVISION", minutes: 30 },
          { taskId: "T-02", kind: "TRABAJO", minutes: 600 },
        ],
        rangeHours: [
          { projectId: "p1", kind: "TRABAJO", minutes: 720 },
          { projectId: "p1", kind: "REVISION", minutes: 30 },
        ],
      },
    );

    expect(r.overall).toMatchObject({ completed: 3, cycle: { count: 3, medianMs: 2 * D, p85Ms: null } });
    expect(r.byProject.map((p) => p.name)).toEqual(["CESFAM", "Plataforma"]);
    expect(r.byProject[1]).toMatchObject({
      completed: 2,
      cycle: { medianMs: 3 * D },
      lead: { medianMs: 4.5 * D },
      // T-01: 2.5 h, T-02: 10 h.
      effortMedianMinutes: 375,
      withEffort: 2,
      workedMinutes: 720,
      reviewedMinutes: 30,
    });
    // T-03 no tiene horas: no cuenta como cero.
    expect(r.byProject[0]).toMatchObject({ completed: 1, effortMedianMinutes: null, withEffort: 0, workedMinutes: 0 });
    expect(r.byDifficulty.map((d) => [d.difficulty, d.completed])).toEqual([
      ["BAJA", 2],
      ["MEDIA", 0],
      ["ALTA", 1],
      [null, 0],
    ]);
    expect(r.workedMinutes).toBe(720);
    expect(r.reviewedMinutes).toBe(30);
  });

  it("con filtro solo muestra el proyecto elegido, pero ofrece todos en el selector", () => {
    const r = report([], { projectId: "p2" });
    expect(r.byProject.map((p) => p.id)).toEqual(["p2"]);
    expect(r.projects.map((p) => p.id)).toEqual(["p2", "p1"]);
  });

  it("tiempo en cada columna: cada paso que terminó en el rango, sin el tramo de la migración", () => {
    const r = report([
      // Pendiente desde la migración (desconocido), luego 2 d en progreso, 1 d por revisar, sigue en revisión.
      task("T-01", [backfill("PENDIENTE"), moved(1, "PROGRESO"), moved(3, "REVISAR", null), moved(4, "REVISION")]),
      // Volvió a En progreso: dos pasos de 1 d y 3 d.
      task("T-02", [created(0), moved(1, "PROGRESO"), moved(2, "REVISION"), moved(2.5, "PROGRESO"), moved(5.5, "LISTO")]),
    ]);
    const col = Object.fromEntries(r.columns.map((c) => [c.column, c.stats]));
    expect(col.PENDIENTE).toMatchObject({ count: 1, medianMs: 1 * D });
    expect(col.PROGRESO).toMatchObject({ count: 3, medianMs: 2 * D });
    expect(col.REVISAR).toMatchObject({ count: 1, medianMs: 1 * D });
    // El paso abierto de T-01 por En revisión no cuenta; el cerrado de T-02 sí.
    expect(col.REVISION).toMatchObject({ count: 1, medianMs: 0.5 * D });
  });

  it("el WIP se ordena por tiempo en la columna y no se reinicia al cambiar de asignado", () => {
    const r = report([
      task("T-01", [created(0), moved(8, "PROGRESO")]),
      task("T-02", [created(0), moved(2, "REVISION"), moved(9, "REVISION", "beto")], { assignee: ana }),
      task("T-03", [created(0)]),
    ]);
    expect(r.wip.map((t) => [t.label, t.ageMs, t.sinceKnown])).toEqual([
      ["T-02", 8 * D, true],
      ["T-01", 2 * D, true],
    ]);
    expect(r.wip[0].assignee).toEqual(ana);
  });
});
