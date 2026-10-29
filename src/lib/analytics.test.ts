import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildActivityReport,
  buildProjectsReport,
  buildTeamReport,
  buildWeekStandups,
  heatLevel,
  isRangeWeeks,
  rangeWeeks,
  standupStreak,
  type ActivityMemberInput,
  type AnalyticsMember,
} from "@/lib/analytics";
import { OTHER_SERIES_KEY } from "@/lib/tiempo";

// Igual que tiempo.test.ts: en Chile es donde una fecha mal leída se corre de día.
const originalTZ = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "America/Santiago";
});
afterAll(() => {
  if (originalTZ === undefined) delete process.env.TZ;
  else process.env.TZ = originalTZ;
});

function member(id: string, extra: Partial<ActivityMemberInput> = {}): ActivityMemberInput {
  return {
    id,
    name: id[0].toUpperCase() + id.slice(1),
    initials: id.slice(0, 2).toUpperCase(),
    image: null,
    role: "EQUIPO",
    status: "ACTIVO",
    joinedWeek: "2026-01-05",
    ...extra,
  };
}

const project = (id: string) => ({ id, name: id });

describe("rango", () => {
  it("las semanas van de la más antigua a la actual", () => {
    expect(rangeWeeks("2026-10-26", 3)).toEqual(["2026-10-12", "2026-10-19", "2026-10-26"]);
  });

  it("solo acepta los rangos del selector", () => {
    expect(isRangeWeeks(8)).toBe(true);
    expect(isRangeWeeks(5)).toBe(false);
    expect(isRangeWeeks("8")).toBe(false);
  });
});

describe("standupStreak", () => {
  const sent = new Set(["2026-10-05", "2026-10-12", "2026-10-19"]);

  it("si la semana en curso aún no se envía, cuenta desde la anterior", () => {
    expect(standupStreak(sent, "2026-10-26")).toBe(3);
  });

  it("la semana en curso suma si ya está enviada", () => {
    expect(standupStreak(new Set([...sent, "2026-10-26"]), "2026-10-26")).toBe(4);
  });

  it("un hueco corta la racha", () => {
    expect(standupStreak(new Set(["2026-10-05", "2026-10-19"]), "2026-10-26")).toBe(1);
    expect(standupStreak(new Set(["2026-10-05"]), "2026-10-26")).toBe(0);
  });

  it("se corta en el tope de la ventana", () => {
    expect(standupStreak(sent, "2026-10-26", 2)).toBe(2);
  });
});

describe("heatLevel", () => {
  it("usa los cortes 0, <2h, 2–4h, 4–8h y 8h o más", () => {
    expect([0, 15, 119, 120, 239, 240, 479, 480, 2000].map(heatLevel)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });
});

describe("buildActivityReport", () => {
  const weeks = ["2026-10-12", "2026-10-19", "2026-10-26"];

  it("suma los minutos por persona y semana, y por semana del equipo", () => {
    const report = buildActivityReport({
      weeks,
      members: [member("ana"), member("beto")],
      entries: [
        { memberId: "ana", date: "2026-10-12", minutes: 60, project: project("p1") },
        // Domingo: sigue siendo la semana del lunes 12.
        { memberId: "ana", date: "2026-10-18", minutes: 30, project: project("p1") },
        { memberId: "beto", date: "2026-10-27", minutes: 120, project: project("p2") },
      ],
      standups: [],
    });

    expect(report.rows.map((r) => [r.member.id, r.minutes, r.totalMinutes])).toEqual([
      ["ana", [90, 0, 0], 90],
      ["beto", [0, 0, 120], 120],
    ]);
    expect(report.weekTotals).toEqual([90, 0, 120]);
    expect(report.totalMinutes).toBe(210);
    expect(report.currentWeek).toBe("2026-10-26");
  });

  it("ignora registros fuera del rango y de personas que no están en la lista", () => {
    const report = buildActivityReport({
      weeks,
      members: [member("ana")],
      entries: [
        { memberId: "ana", date: "2026-10-11", minutes: 60, project: project("p1") },
        { memberId: "ana", date: "2026-11-02", minutes: 60, project: project("p1") },
        { memberId: "pendiente", date: "2026-10-26", minutes: 60, project: project("p1") },
      ],
      standups: [],
    });
    expect(report.totalMinutes).toBe(0);
    expect(report.projects).toEqual([]);
  });

  it("marca los StandUps enviados, los que faltan y las semanas antes de entrar", () => {
    const report = buildActivityReport({
      weeks,
      members: [member("ana"), member("nueva", { joinedWeek: "2026-10-19" })],
      entries: [],
      standups: [
        { memberId: "ana", weekStart: "2026-10-12" },
        { memberId: "ana", weekStart: "2026-10-05" },
        { memberId: "nueva", weekStart: "2026-10-26" },
      ],
    });

    expect(report.rows[0].standups).toEqual(["sent", "missing", "missing"]);
    expect(report.rows[1].standups).toEqual(["na", "missing", "sent"]);
    // Ana: 5 y 12 de octubre seguidas, pero falta el 19.
    expect(report.rows[0].streak).toBe(0);
    expect(report.rows[1].streak).toBe(1);
    expect(report.standupTotals).toEqual([
      { sent: 1, expected: 1 },
      { sent: 0, expected: 2 },
      { sent: 1, expected: 2 },
    ]);
    expect(report.missingStandups.map((m) => m.id)).toEqual(["ana"]);
  });

  it("quien está en Hiatus va al final y no cuenta como pendiente", () => {
    const report = buildActivityReport({
      weeks,
      members: [member("zoe"), member("abel", { status: "HIATUS" })],
      entries: [],
      standups: [],
    });

    expect(report.rows.map((r) => r.member.id)).toEqual(["zoe", "abel"]);
    expect(report.missingHours.map((m) => m.id)).toEqual(["zoe"]);
    expect(report.missingStandups.map((m) => m.id)).toEqual(["zoe"]);
    expect(report.standupTotals.every((t) => t.expected === 1)).toBe(true);
  });

  it("no expone joinedWeek en las filas", () => {
    const report = buildActivityReport({ weeks, members: [member("ana")], entries: [], standups: [] });
    expect(report.rows[0].member).not.toHaveProperty("joinedWeek");
  });

  it("horas por proyecto con el color de /tiempo, de más a menos y con las personas distintas", () => {
    const report = buildActivityReport({
      weeks,
      members: [member("ana"), member("beto")],
      entries: [
        { memberId: "ana", date: "2026-10-12", minutes: 60, project: project("Beta") },
        { memberId: "beto", date: "2026-10-13", minutes: 60, project: project("Beta") },
        { memberId: "ana", date: "2026-10-14", minutes: 240, project: project("Alfa") },
      ],
      standups: [],
    });

    // El color va por nombre (Alfa = 1, Beta = 2), el orden por horas.
    expect(report.projects.map((p) => [p.name, p.slot, p.minutes, p.people])).toEqual([
      ["Alfa", 1, 240, 1],
      ["Beta", 2, 120, 2],
    ]);
  });

  it("del sexto proyecto en adelante se juntan en Otros, al final", () => {
    const names = ["A", "B", "C", "D", "E", "F", "G"];
    const report = buildActivityReport({
      weeks,
      members: [member("ana")],
      entries: names.map((n, i) => ({ memberId: "ana", date: "2026-10-26", minutes: (10 - i) * 15, project: project(n) })),
      standups: [],
    });

    expect(report.projects).toHaveLength(6);
    expect(report.projects.at(-1)).toMatchObject({ key: OTHER_SERIES_KEY, slot: null, minutes: (4 + 5) * 15, people: 1 });
  });
});

describe("buildWeekStandups", () => {
  it("lista los enviados y quién falta, sin contar Hiatus ni a quien aún no era miembro", () => {
    const result = buildWeekStandups(
      "2026-10-19",
      [
        member("ana"),
        member("beto"),
        member("ceci", { status: "HIATUS" }),
        member("nueva", { joinedWeek: "2026-10-26" }),
      ],
      [{ memberId: "beto", text: "Hice cosas", learned: null, updatedAt: "2026-10-24T15:00:00.000Z" }],
    );

    expect(result.entries.map((e) => [e.member.id, e.text])).toEqual([["beto", "Hice cosas"]]);
    expect(result.missing.map((m) => m.id)).toEqual(["ana"]);
  });
});

describe("buildProjectsReport", () => {
  const people: AnalyticsMember[] = [member("ana"), member("beto"), member("ceci", { status: "HIATUS" })];

  it("arma las cuentas por proyecto", () => {
    const report = buildProjectsReport({
      projects: [
        { id: "p2", name: "Zeta", status: "ACTIVO" },
        { id: "p1", name: "Alfa", status: "DESARROLLO" },
      ],
      tasks: [
        { projectId: "p1", column: "PENDIENTE", count: 3 },
        { projectId: "p1", column: "LISTO", count: 2 },
      ],
      unassigned: [{ projectId: "p1", count: 1 }],
      features: [
        { projectId: "p1", status: "HECHO", count: 1 },
        { projectId: "p1", status: "EN_PROGRESO", count: 2 },
      ],
      openIssues: [{ projectId: "p1", count: 4 }],
      teams: [{ projectId: "p1", count: 3 }],
      members: people,
      assigned: [],
    });

    expect(report.projects.map((p) => p.name)).toEqual(["Alfa", "Zeta"]);
    expect(report.projects[0]).toMatchObject({
      tasks: { PENDIENTE: 3, PROGRESO: 0, REVISAR: 0, REVISION: 0, LISTO: 2 },
      totalTasks: 5,
      features: { HECHO: 1, EN_PROGRESO: 2, PENDIENTE: 0 },
      totalFeatures: 3,
      openIssues: 4,
      unassignedOpen: 1,
      team: 3,
    });
    expect(report.projects[1]).toMatchObject({ totalTasks: 0, openIssues: 0, team: 0 });
    expect(report.unassignedOpen).toBe(1);
  });

  it("ordena la carga por trabajo en curso, junta las dos columnas de revisión y deja Hiatus al final", () => {
    const report = buildProjectsReport({
      projects: [],
      tasks: [],
      unassigned: [],
      features: [],
      openIssues: [],
      teams: [],
      members: people,
      assigned: [
        { assigneeId: "ana", column: "PENDIENTE", count: 5 },
        { assigneeId: "beto", column: "REVISAR", count: 1 },
        { assigneeId: "beto", column: "REVISION", count: 1 },
        { assigneeId: "ceci", column: "PROGRESO", count: 9 },
      ],
    });

    expect(report.workload.map((w) => [w.member.id, w.pendiente, w.progreso, w.revision, w.total])).toEqual([
      ["beto", 0, 0, 2, 2],
      ["ana", 5, 0, 0, 5],
      ["ceci", 0, 9, 0, 9],
    ]);
  });
});

describe("buildTeamReport", () => {
  it("cuenta por rol y estado, y la disponibilidad solo de los activos", () => {
    const report = buildTeamReport(
      [
        { ...member("ana", { role: "COORDINACION" }), availability: ["LUN_MANANA", "MAR_TARDE"] },
        { ...member("beto"), availability: ["MAR_TARDE", "NO_EXISTE"] },
        { ...member("ceci", { status: "HIATUS" }), availability: ["MAR_TARDE"] },
        { ...member("dani", { role: "ROOKIE" }), availability: [] },
      ],
      2,
    );

    expect(report).toMatchObject({ total: 4, active: 3, hiatus: 1, pending: 2, declared: 2 });
    expect(report.byRole).toEqual([
      { role: "COORDINACION", label: "Coordinación", active: 1, hiatus: 0 },
      { role: "EQUIPO", label: "Equipo", active: 1, hiatus: 1 },
      { role: "ROOKIE", label: "Rookie", active: 1, hiatus: 0 },
    ]);
    expect(report.availability).toHaveLength(15);
    const tuesday = report.availability.find((c) => c.slot === "MAR_TARDE")!;
    expect(tuesday.label).toBe("Mar · Tarde");
    expect(tuesday.members.map((m) => m.id)).toEqual(["ana", "beto"]);
    expect(tuesday.members[0]).not.toHaveProperty("availability");
    expect(report.undeclared.map((m) => m.id)).toEqual(["dani"]);
  });
});
