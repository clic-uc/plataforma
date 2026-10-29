import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthError, requireCoordinacion } from "@/lib/auth/guards";
import {
  getActivityReport,
  getKanbanReport,
  getProjectsReport,
  getTeamReport,
  getWeekStandups,
  parseProjectParam,
  parseRangeParam,
  parseStandupWeekParam,
} from "@/lib/api/analytics.server";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    member: { findMany: vi.fn(), count: vi.fn() },
    timeEntry: { groupBy: vi.fn() },
    project: { findMany: vi.fn() },
    standup: { findMany: vi.fn() },
    task: { groupBy: vi.fn(), findMany: vi.fn() },
    feature: { groupBy: vi.fn() },
    issue: { groupBy: vi.fn() },
    projectMember: { groupBy: vi.fn() },
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@/lib/auth", () => ({ auth: {} }));
vi.mock("@/lib/auth/guards", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/guards")>()),
  requireCoordinacion: vi.fn(async () => ({ id: "yo", role: "COORDINACION" })),
}));

const originalTZ = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "America/Santiago";
});
afterAll(() => {
  if (originalTZ === undefined) delete process.env.TZ;
  else process.env.TZ = originalTZ;
});

beforeEach(() => {
  for (const model of Object.values(prisma)) for (const fn of Object.values(model)) fn.mockReset();
  vi.mocked(requireCoordinacion).mockClear();
});

// Miércoles 28 de octubre de 2026, 12:00 en Chile: la semana en curso empieza el lunes 26.
const NOW = new Date("2026-10-28T15:00:00.000Z");

const ana = {
  id: "ana",
  name: "Ana Pérez",
  image: null,
  role: "EQUIPO",
  status: "ACTIVO",
  // Aprobada el lunes 12 de octubre a las 22:00 de Chile (ya martes en UTC).
  joinedAt: new Date("2026-10-13T01:00:00.000Z"),
};

describe("parámetros", () => {
  it("el rango por defecto es 8 semanas y solo se aceptan las opciones del selector", () => {
    expect(parseRangeParam(null)).toBe(8);
    expect(parseRangeParam("4")).toBe(4);
    expect(parseRangeParam("5")).toBeNull();
    expect(parseRangeParam("abc")).toBeNull();
  });

  it("la semana de StandUps es un lunes que no está en el futuro", () => {
    expect(parseStandupWeekParam("2026-10-26", NOW)).toBe("2026-10-26");
    expect(parseStandupWeekParam("2026-10-19", NOW)).toBe("2026-10-19");
    expect(parseStandupWeekParam("2026-11-02", NOW)).toBeNull();
    expect(parseStandupWeekParam("2026-10-27", NOW)).toBeNull();
    expect(parseStandupWeekParam(null, NOW)).toBeNull();
  });
});

describe("permisos", () => {
  it.each([
    ["getActivityReport", () => getActivityReport(8, NOW)],
    ["getWeekStandups", () => getWeekStandups("2026-10-26")],
    ["getProjectsReport", () => getProjectsReport()],
    ["getTeamReport", () => getTeamReport()],
    ["getKanbanReport", () => getKanbanReport(8, null, NOW)],
  ])("%s exige coordinación antes de consultar", async (_name, call) => {
    vi.mocked(requireCoordinacion).mockRejectedValueOnce(new AuthError(403, "FORBIDDEN_ROLE", "No"));
    await expect(call()).rejects.toMatchObject({ code: "FORBIDDEN_ROLE" });
    expect(prisma.member.findMany).not.toHaveBeenCalled();
    expect(prisma.task.findMany).not.toHaveBeenCalled();
  });
});

describe("getActivityReport", () => {
  it("consulta el rango en fechas UTC y arma la grilla con la semana de ingreso en hora de Chile", async () => {
    prisma.member.findMany.mockResolvedValue([ana]);
    prisma.timeEntry.groupBy.mockResolvedValue([
      { memberId: "ana", projectId: "p1", date: new Date("2026-10-27T00:00:00.000Z"), _sum: { minutes: 90 } },
    ]);
    prisma.project.findMany.mockResolvedValue([{ id: "p1", name: "Plataforma" }]);
    prisma.standup.findMany.mockResolvedValue([{ memberId: "ana", weekStart: new Date("2026-10-19T00:00:00.000Z") }]);

    const report = await getActivityReport(4, NOW);

    expect(prisma.member.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isVerifiedByCoordinator: true } }),
    );
    expect(prisma.timeEntry.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { date: { gte: new Date("2026-10-05T00:00:00.000Z"), lt: new Date("2026-11-02T00:00:00.000Z") } },
      }),
    );
    expect(report.weeks).toEqual(["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"]);
    expect(report.rows[0]).toMatchObject({
      member: { id: "ana", initials: "AP" },
      minutes: [0, 0, 0, 90],
      standups: ["na", "missing", "sent", "missing"],
      streak: 1,
    });
    expect(report.projects[0]).toMatchObject({ name: "Plataforma", minutes: 90 });
  });
});

describe("getWeekStandups", () => {
  it("devuelve los textos con updatedAt en ISO", async () => {
    prisma.member.findMany.mockResolvedValue([ana]);
    const updatedAt = new Date("2026-10-23T20:00:00.000Z");
    prisma.standup.findMany.mockResolvedValue([{ memberId: "ana", text: "Avancé", learned: "Prisma", updatedAt }]);

    const result = await getWeekStandups("2026-10-19");

    expect(prisma.standup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { weekStart: new Date("2026-10-19T00:00:00.000Z") } }),
    );
    expect(result.entries).toEqual([
      {
        member: { id: "ana", name: "Ana Pérez", initials: "AP", image: null, role: "EQUIPO", status: "ACTIVO" },
        text: "Avancé",
        learned: "Prisma",
        updatedAt: updatedAt.toISOString(),
      },
    ]);
    expect(result.missing).toEqual([]);
  });
});

describe("getProjectsReport", () => {
  it("solo mira proyectos sin archivar y no cuenta tareas asignadas en Listo", async () => {
    prisma.project.findMany.mockResolvedValue([{ id: "p1", name: "Plataforma", status: "ACTIVO" }]);
    prisma.task.groupBy.mockResolvedValue([]);
    prisma.feature.groupBy.mockResolvedValue([]);
    prisma.issue.groupBy.mockResolvedValue([]);
    prisma.projectMember.groupBy.mockResolvedValue([]);
    prisma.member.findMany.mockResolvedValue([ana]);

    await getProjectsReport();

    expect(prisma.project.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { archived: false } }));
    expect(prisma.task.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ["assigneeId", "column"],
        where: { project: { archived: false }, assigneeId: { not: null }, column: { not: "LISTO" } },
      }),
    );
  });
});

describe("getTeamReport", () => {
  it("cuenta las cuentas pendientes aparte", async () => {
    prisma.member.findMany.mockResolvedValue([{ ...ana, availability: ["LUN_MANANA"] }]);
    prisma.member.count.mockResolvedValue(3);

    const report = await getTeamReport();

    expect(prisma.member.count).toHaveBeenCalledWith({ where: { isVerifiedByCoordinator: false } });
    expect(report).toMatchObject({ total: 1, active: 1, pending: 3, declared: 1 });
  });
});

describe("getKanbanReport", () => {
  const projects = [
    { id: "p1", name: "Plataforma" },
    { id: "p2", name: "CESFAM" },
  ];

  it("pide las tareas abiertas o terminadas desde el lunes 00:00 de Chile y las horas del rango", async () => {
    prisma.project.findMany.mockResolvedValue(projects);
    prisma.task.findMany.mockResolvedValue([
      {
        id: "t1",
        label: "T-01",
        name: "Login",
        projectId: "p1",
        column: "PROGRESO",
        difficulty: "MEDIA",
        createdAt: new Date("2026-10-26T12:00:00.000Z"),
        assignee: { id: "ana", name: "Ana Pérez", image: null, role: "EQUIPO", status: "ACTIVO" },
        transitions: [
          { fromColumn: null, toColumn: "PENDIENTE", assigneeId: null, byId: "yo", at: new Date("2026-10-26T12:00:00.000Z") },
          { fromColumn: "PENDIENTE", toColumn: "PROGRESO", assigneeId: "ana", byId: "ana", at: new Date("2026-10-27T12:00:00.000Z") },
        ],
      },
    ]);
    prisma.timeEntry.groupBy
      .mockResolvedValueOnce([{ taskId: "t1", kind: "TRABAJO", _sum: { minutes: 60 } }])
      .mockResolvedValueOnce([{ projectId: "p1", kind: "TRABAJO", _sum: { minutes: 60 } }]);

    const report = await getKanbanReport(4, "p1", NOW);

    // Lunes 5 de octubre, 00:00 en Chile (UTC−3).
    const rangeStart = new Date("2026-10-05T03:00:00.000Z");
    const scope = { project: { archived: false }, projectId: "p1" };
    const taskWhere = {
      ...scope,
      OR: [{ column: { not: "LISTO" } }, { transitions: { some: { toColumn: "LISTO", at: { gte: rangeStart } } } }],
    };
    expect(prisma.task.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: taskWhere }));
    expect(prisma.timeEntry.groupBy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ by: ["taskId", "kind"], where: { kind: { in: ["TRABAJO", "REVISION"] }, task: taskWhere } }),
    );
    expect(prisma.timeEntry.groupBy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        by: ["projectId", "kind"],
        where: {
          ...scope,
          kind: { in: ["TRABAJO", "REVISION"] },
          date: { gte: new Date("2026-10-05T00:00:00.000Z"), lt: new Date("2026-11-02T00:00:00.000Z") },
        },
      }),
    );

    expect(report).toMatchObject({
      projectId: "p1",
      projects: [{ name: "CESFAM" }, { name: "Plataforma" }],
      byProject: [{ id: "p1", workedMinutes: 60 }],
      wip: [{ label: "T-01", sinceKnown: true, assignee: { id: "ana", initials: "AP" } }],
    });
  });

  it("devuelve null si el proyecto no existe o está archivado", async () => {
    prisma.project.findMany.mockResolvedValue(projects);
    prisma.task.findMany.mockResolvedValue([]);
    prisma.timeEntry.groupBy.mockResolvedValue([]);

    expect(await getKanbanReport(8, "otro", NOW)).toBeNull();
  });

  it("el proyecto vacío en la query string es todos", () => {
    expect(parseProjectParam(null)).toBeNull();
    expect(parseProjectParam("  ")).toBeNull();
    expect(parseProjectParam("p1")).toBe("p1");
  });
});
