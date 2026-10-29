import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireMember } from "@/lib/auth/guards";
import { dismissPendingHours, getDashboard } from "@/lib/api/dashboard.server";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    project: { findMany: vi.fn() },
    standup: { findMany: vi.fn() },
    calendarEvent: { findFirst: vi.fn(), findMany: vi.fn() },
    docVersion: { findMany: vi.fn() },
    docComment: { findMany: vi.fn() },
    issue: { findMany: vi.fn() },
    issueComment: { findMany: vi.fn() },
    taskTransition: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    task: { findMany: vi.fn() },
    timeEntry: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@/lib/auth", () => ({ auth: {} }));
vi.mock("@/lib/auth/guards", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/guards")>()),
  requireMember: vi.fn(),
}));

// Jueves 29 oct 2026, 15:00 en Chile: la semana empieza el lunes 26.
const now = new Date("2026-10-29T18:00:00.000Z");
const project = { id: "p1", name: "San Miguel" };
const ana = { id: "ana", name: "Ana" };
const myProjectRow = { ...project, status: "ACTIVO", tasks: [], issues: [] };

beforeEach(() => {
  for (const model of Object.values(prisma)) for (const fn of Object.values(model)) fn.mockReset().mockResolvedValue([]);
  prisma.calendarEvent.findFirst.mockResolvedValue(null);
  vi.mocked(requireMember).mockResolvedValue({ id: "yo", role: "EQUIPO", name: "Yo", email: "", image: null, isVerified: true });
});

describe("getDashboard", () => {
  it("cuenta mis tareas abiertas y las que esperan revisión", async () => {
    prisma.project.findMany.mockResolvedValue([
      {
        id: "p1",
        name: "San Miguel",
       
        status: "ACTIVO",
        tasks: [
          { label: "T-01", name: "A", column: "PROGRESO" },
          { label: "T-02", name: "B", column: "REVISAR" },
          { label: "T-03", name: "C", column: "REVISION" },
        ],
        issues: [],
      },
      { id: "p2", name: "Catastro", status: "EN_PAUSA", tasks: [], issues: [] },
    ]);

    const dashboard = await getDashboard(now);

    expect(dashboard.tasks).toEqual({ open: 3, inReview: 2 });
    expect(dashboard.projects[0]).toMatchObject({ id: "p1", status: "Activo", statusColor: "green" });
    const where = prisma.project.findMany.mock.calls[0][0].where;
    expect(where.archived).toBe(false);
  });

  it("calcula la racha desde las semanas con StandUp", async () => {
    prisma.standup.findMany.mockResolvedValue([
      { weekStart: new Date("2026-10-19T00:00:00.000Z") },
      { weekStart: new Date("2026-10-12T00:00:00.000Z") },
    ]);
    expect((await getDashboard(now)).streak).toEqual({ weeks: 2, sentThisWeek: false });
  });

  it("da la próxima reunión con día y hora de Chile", async () => {
    prisma.calendarEvent.findFirst.mockResolvedValue({
      id: "e1",
      title: "Reunión de equipo",
      allDay: false,
      startsAt: new Date("2026-11-02T21:00:00.000Z"),
      endsAt: new Date("2026-11-02T22:00:00.000Z"),
      project,
    });
    expect((await getDashboard(now)).nextMeeting).toMatchObject({ day: "2026-11-02", time: "18:00", project });
    expect(prisma.calendarEvent.findFirst.mock.calls[0][0].where).toEqual({ kind: "REUNION", endsAt: { gt: now } });
  });

  it("sin proyectos propios no hay actividad y no se consulta nada", async () => {
    const { activity } = await getDashboard(now);

    expect(activity).toEqual([]);
    expect(prisma.docVersion.findMany).not.toHaveBeenCalled();
    expect(prisma.issue.findMany).not.toHaveBeenCalled();
    expect(prisma.taskTransition.findMany).not.toHaveBeenCalled();
    expect(prisma.calendarEvent.findMany).not.toHaveBeenCalled();
    expect(prisma.timeEntry.findMany).not.toHaveBeenCalled();
  });

  it("limita el feed a mis proyectos", async () => {
    prisma.project.findMany.mockResolvedValue([myProjectRow]);

    await getDashboard(now);

    const mine = { projectId: { in: ["p1"] } };
    const docs = { OR: [{ document: mine }, { acta: mine }] };
    expect(prisma.docVersion.findMany.mock.calls[0][0].where).toMatchObject(docs);
    expect(prisma.docComment.findMany.mock.calls[0][0].where).toMatchObject(docs);
    for (const call of prisma.issue.findMany.mock.calls) expect(call[0].where).toMatchObject(mine);
    expect(prisma.issueComment.findMany.mock.calls[0][0].where).toMatchObject({ issue: mine });
    expect(prisma.taskTransition.findMany.mock.calls[0][0].where).toMatchObject({ task: mine });
    expect(prisma.calendarEvent.findMany.mock.calls[0][0].where).toMatchObject(mine);
    expect(prisma.timeEntry.findMany.mock.calls[0][0].where).toMatchObject(mine);
  });

  it("solo lee las horas propias para el feed", async () => {
    prisma.project.findMany.mockResolvedValue([myProjectRow]);
    prisma.timeEntry.findMany.mockResolvedValue([
      { id: "h1", createdAt: new Date("2026-10-29T12:00:00.000Z"), minutes: 90, project },
    ]);

    const { activity } = await getDashboard(now);

    expect(prisma.timeEntry.findMany.mock.calls[0][0].where.memberId).toBe("yo");
    expect(activity).toEqual([expect.objectContaining({ kind: "hours", self: true, minutes: 90, href: "/tiempo" })]);
  });

  it("arma los links de documentos y actas, y deja una fila por serie de eventos", async () => {
    prisma.project.findMany.mockResolvedValue([myProjectRow]);
    prisma.docVersion.findMany.mockResolvedValue([
      { id: "v1", createdAt: new Date("2026-10-29T12:00:00.000Z"), author: ana, document: { slot: "KICKOFF", project }, acta: null },
      { id: "v2", createdAt: new Date("2026-10-28T12:00:00.000Z"), author: ana, document: null, acta: { id: "a1", title: "Reunión 3", project } },
    ]);
    prisma.calendarEvent.findMany.mockResolvedValue([
      { id: "e1", title: "Daily", createdAt: new Date("2026-10-27T12:00:00.000Z"), seriesId: "s", allDay: false, startsAt: new Date("2026-10-27T13:00:00.000Z"), createdBy: null, project: null },
      { id: "e2", title: "Daily", createdAt: new Date("2026-10-27T12:00:00.000Z"), seriesId: "s", allDay: false, startsAt: new Date("2026-11-03T13:00:00.000Z"), createdBy: null, project: null },
    ]);

    const { activity } = await getDashboard(now);

    expect(activity.map((a) => [a.kind, a.href])).toEqual([
      ["doc_edit", "/proyectos/p1/docs/kickoff"],
      ["doc_edit", "/proyectos/p1/docs/a1"],
      ["event", "/calendario?vista=semana&fecha=2026-10-27"],
    ]);
    expect(activity[2]).toMatchObject({ actor: null, self: false });
  });
});

describe("issues sin revisar", () => {
  const activity = new Date("2026-10-20T12:00:00.000Z");
  const before = new Date("2026-10-19T12:00:00.000Z");

  it("cuenta por proyecto los abiertos y los que no revisé desde su última actividad", async () => {
    prisma.project.findMany.mockResolvedValue([
      {
        ...myProjectRow,
        issues: [
          { lastActivityAt: activity, reviews: [{ reviewedAt: activity }] },
          { lastActivityAt: activity, reviews: [{ reviewedAt: before }] },
          { lastActivityAt: activity, reviews: [] },
        ],
      },
      { ...myProjectRow, id: "p2", name: "Catastro", issues: [{ lastActivityAt: activity, reviews: [] }] },
    ]);

    const dashboard = await getDashboard(now);

    expect(dashboard.projects.map((p) => p.issues)).toEqual([
      { open: 3, unreviewed: 2 },
      { open: 1, unreviewed: 1 },
    ]);
    expect(dashboard.issues).toEqual({ open: 4, unreviewed: 3 });
    const include = prisma.project.findMany.mock.calls[0][0].include;
    expect(include.issues.where).toEqual({ status: "ABIERTO" });
    expect(include.issues.select.reviews).toEqual({ where: { memberId: "yo" }, select: { reviewedAt: true } });
  });

  it("sin proyectos el total es cero", async () => {
    expect((await getDashboard(now)).issues).toEqual({ open: 0, unreviewed: 0 });
  });
});

describe("tareas completadas en el feed", () => {
  it("salen de las transiciones a LISTO, con quien la movió como autor", async () => {
    prisma.project.findMany.mockResolvedValue([myProjectRow]);
    prisma.taskTransition.findMany.mockResolvedValue([
      { id: "t1", at: new Date("2026-10-29T12:00:00.000Z"), by: ana, task: { label: "T-03", name: "Login", project } },
      { id: "t2", at: new Date("2026-10-28T12:00:00.000Z"), by: { id: "yo", name: "Yo" }, task: { label: "T-04", name: "Logout", project } },
    ]);

    const { activity } = await getDashboard(now);

    expect(activity).toEqual([
      expect.objectContaining({ kind: "task_done", label: "T-03", name: "Login", actor: ana, self: false, href: "/proyectos/p1" }),
      expect.objectContaining({ kind: "task_done", label: "T-04", self: true }),
    ]);
  });

  it("no cuenta la fila de creación ni un cambio de asignado dentro de Listo", async () => {
    prisma.project.findMany.mockResolvedValue([myProjectRow]);

    await getDashboard(now);

    const { where } = prisma.taskTransition.findMany.mock.calls[0][0];
    expect(where.toColumn).toBe("LISTO");
    expect(where.fromColumn.in).toEqual(["PENDIENTE", "PROGRESO", "REVISAR", "REVISION"]);
    expect(where.at).toEqual({ gte: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000), lte: now });
  });
});

describe("horas por registrar", () => {
  const tr = (id: string, toColumn: string, assigneeId: string | null, at: string, hoursDismissedAt: Date | null = null) => ({
    id,
    toColumn,
    assigneeId,
    at: new Date(at),
    hoursDismissedAt,
  });

  it("sin tareas candidatas no lee horas y la lista va vacía", async () => {
    const { pendingHours } = await getDashboard(now);

    expect(pendingHours).toEqual([]);
    const { where } = prisma.task.findMany.mock.calls[0][0];
    expect(where.project).toEqual({ archived: false });
    expect(where.AND).toEqual([
      { transitions: { some: { at: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) } } } },
      { transitions: { some: { assigneeId: "yo", toColumn: { in: ["PROGRESO", "REVISION"] } } } },
    ]);
    expect(prisma.timeEntry.findMany).not.toHaveBeenCalled();
  });

  it("da los períodos míos terminados sin horas, del más reciente al más antiguo", async () => {
    prisma.task.findMany.mockResolvedValue([
      {
        id: "ta",
        label: "T-03",
        name: "Login",
        project,
        transitions: [
          tr("r1", "PROGRESO", "yo", "2026-10-20T12:00:00.000Z"),
          tr("r2", "REVISION", "ana", "2026-10-22T12:00:00.000Z"),
          tr("r3", "LISTO", "ana", "2026-10-23T12:00:00.000Z"),
        ],
      },
      {
        id: "tb",
        label: "T-04",
        name: "Logout",
        project,
        transitions: [
          tr("r4", "REVISION", "yo", "2026-10-24T12:00:00.000Z"),
          tr("r5", "LISTO", "yo", "2026-10-26T02:00:00.000Z"),
        ],
      },
    ]);
    prisma.timeEntry.findMany.mockResolvedValue([]);

    const { pendingHours } = await getDashboard(now);

    expect(pendingHours).toEqual([
      {
        transitionId: "r4",
        taskId: "tb",
        label: "T-04",
        name: "Logout",
        project,
        kind: "REVISION",
        from: "2026-10-24T12:00:00.000Z",
        to: "2026-10-26T02:00:00.000Z",
        // 23:00 del domingo 25 en Chile.
        suggestedDate: "2026-10-25",
      },
      expect.objectContaining({ transitionId: "r1", taskId: "ta", kind: "TRABAJO", suggestedDate: "2026-10-22" }),
    ]);
    expect(prisma.timeEntry.findMany.mock.calls[0][0].where).toEqual({
      memberId: "yo",
      taskId: { in: ["ta", "tb"] },
      kind: { in: ["TRABAJO", "REVISION"] },
    });
  });

  it("un registro mío vinculado o una fila descartada lo resuelven", async () => {
    prisma.task.findMany.mockResolvedValue([
      {
        id: "ta",
        label: "T-03",
        name: "Login",
        project,
        transitions: [tr("r1", "PROGRESO", "yo", "2026-10-20T12:00:00.000Z"), tr("r2", "LISTO", "yo", "2026-10-21T12:00:00.000Z")],
      },
      {
        id: "tb",
        label: "T-04",
        name: "Logout",
        project,
        transitions: [
          tr("r3", "PROGRESO", "yo", "2026-10-20T12:00:00.000Z", new Date("2026-10-22T12:00:00.000Z")),
          tr("r4", "LISTO", "yo", "2026-10-21T12:00:00.000Z"),
        ],
      },
    ]);
    prisma.timeEntry.findMany.mockResolvedValue([{ taskId: "ta", kind: "TRABAJO", createdAt: new Date("2026-10-27T12:00:00.000Z") }]);

    expect((await getDashboard(now)).pendingHours).toEqual([]);
  });
});

describe("dismissPendingHours", () => {
  it("marca la fila si es mía y de una columna de trabajo", async () => {
    prisma.taskTransition.findFirst.mockResolvedValue({ hoursDismissedAt: null });

    expect(await dismissPendingHours("r1", now)).toBe(true);
    expect(prisma.taskTransition.findFirst).toHaveBeenCalledWith({
      where: { id: "r1", assigneeId: "yo", toColumn: { in: ["PROGRESO", "REVISION"] } },
      select: { hoursDismissedAt: true },
    });
    expect(prisma.taskTransition.update).toHaveBeenCalledWith({ where: { id: "r1" }, data: { hoursDismissedAt: now } });
  });

  it("descartar dos veces conserva la primera fecha", async () => {
    prisma.taskTransition.findFirst.mockResolvedValue({ hoursDismissedAt: new Date("2026-10-28T12:00:00.000Z") });

    expect(await dismissPendingHours("r1", now)).toBe(true);
    expect(prisma.taskTransition.update).not.toHaveBeenCalled();
  });

  it("una fila ajena, de otra columna o inexistente es false (404)", async () => {
    prisma.taskTransition.findFirst.mockResolvedValue(null);

    expect(await dismissPendingHours("r1", now)).toBe(false);
    expect(prisma.taskTransition.update).not.toHaveBeenCalled();
  });
});
