import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireMember } from "@/lib/auth/guards";
import { ApiError } from "@/lib/api/errors";
import {
  createTimeEntry,
  deleteTimeEntry,
  getStandup,
  getTimeEntries,
  getTimeEntryTaskOptions,
  parseSaveStandupInput,
  parseTimeEntryFilter,
  parseTimeEntryInput,
  resolveTaskLabel,
  saveStandup,
  updateTimeEntry,
} from "@/lib/api/tiempo.server";
import type { TimeEntryInput } from "@/lib/api/tiempo";
import { labelsToken } from "@/lib/api/labels";
import { MAX_HISTORY_ENTRIES } from "@/lib/tiempo";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    project: { findUnique: vi.fn() },
    task: { findUnique: vi.fn(), findMany: vi.fn() },
    feature: { findMany: vi.fn() },
    standup: { findUnique: vi.fn(), upsert: vi.fn() },
    timeEntry: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma }));
// Better Auth no se inicializa en los tests; los guards reales no se usan acá.
vi.mock("@/lib/auth", () => ({ auth: {} }));
vi.mock("@/lib/auth/guards", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/guards")>()),
  requireMember: vi.fn(async () => ({ id: "yo", role: "EQUIPO" })),
}));

beforeEach(() => {
  for (const model of Object.values(prisma)) for (const fn of Object.values(model)) fn.mockReset();
  vi.mocked(requireMember).mockResolvedValue({ id: "yo", role: "EQUIPO", name: "yo", email: "", image: null, isVerified: true });
});

function standupRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "s1",
    memberId: "yo",
    weekStart: new Date("2026-10-12T00:00:00.000Z"),
    text: "Avancé el kanban",
    learned: null,
    createdAt: new Date("2026-10-13T20:00:00.000Z"),
    updatedAt: new Date("2026-10-13T20:00:00.000Z"),
    ...overrides,
  };
}

function entryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "t1",
    memberId: "yo",
    projectId: "p1",
    date: new Date("2026-10-13T00:00:00.000Z"),
    minutes: 150,
    description: "Revisión de PRs",
    createdAt: new Date(),
    updatedAt: new Date(),
    project: { id: "p1", name: "San Miguel" },
    kind: "MANUAL",
    taskId: null,
    task: null,
    ...overrides,
  };
}

const validEntry: TimeEntryInput = {
  date: "2026-10-13",
  projectId: "p1",
  minutes: 150,
  description: "Revisión de PRs",
  taskId: null,
  kind: "MANUAL",
};

// ─── StandUp ───

describe("parseSaveStandupInput", () => {
  it("recorta los textos y deja learned en null si viene vacío", () => {
    expect(parseSaveStandupInput({ weekStart: "2026-10-12", text: "  Hice cosas ", learned: "  " })).toEqual({
      weekStart: "2026-10-12",
      text: "Hice cosas",
      learned: null,
    });
  });

  it("rechaza una semana que no empieza en lunes, texto vacío o demasiado largo", () => {
    const valid = { weekStart: "2026-10-12", text: "Hice cosas", learned: null };
    expect(parseSaveStandupInput({ ...valid, weekStart: "2026-10-13" })).toBeNull();
    expect(parseSaveStandupInput({ ...valid, text: "   " })).toBeNull();
    expect(parseSaveStandupInput({ ...valid, text: "x".repeat(2001) })).toBeNull();
    expect(parseSaveStandupInput({ ...valid, learned: 3 })).toBeNull();
    expect(parseSaveStandupInput(null)).toBeNull();
  });
});

describe("getStandup", () => {
  it("busca el propio de esa semana y devuelve la semana como clave", async () => {
    prisma.standup.findUnique.mockResolvedValue(standupRow());

    expect(await getStandup("2026-10-12")).toMatchObject({ weekStart: "2026-10-12", text: "Avancé el kanban" });
    expect(prisma.standup.findUnique).toHaveBeenCalledWith({
      where: { memberId_weekStart: { memberId: "yo", weekStart: new Date("2026-10-12T00:00:00.000Z") } },
    });
  });

  it("devuelve null si todavía no lo envía", async () => {
    prisma.standup.findUnique.mockResolvedValue(null);
    expect(await getStandup("2026-10-12")).toBeNull();
  });
});

describe("saveStandup", () => {
  // Martes 13 oct 2026, 15:00 en Chile.
  const now = new Date("2026-10-13T18:00:00Z");

  it("crea o reemplaza el de la semana en curso", async () => {
    prisma.standup.upsert.mockResolvedValue(standupRow({ learned: "OAuth" }));

    await saveStandup({ weekStart: "2026-10-12", text: "Avancé el kanban", learned: "OAuth" }, now);

    expect(prisma.standup.upsert).toHaveBeenCalledWith({
      where: { memberId_weekStart: { memberId: "yo", weekStart: new Date("2026-10-12T00:00:00.000Z") } },
      create: { memberId: "yo", weekStart: new Date("2026-10-12T00:00:00.000Z"), text: "Avancé el kanban", learned: "OAuth" },
      update: { text: "Avancé el kanban", learned: "OAuth" },
    });
  });

  it("acepta la semana anterior, para un formulario enviado pasada la medianoche del domingo", async () => {
    prisma.standup.upsert.mockResolvedValue(standupRow({ weekStart: new Date("2026-10-05T00:00:00.000Z") }));
    await expect(saveStandup({ weekStart: "2026-10-05", text: "x", learned: null }, now)).resolves.toBeDefined();
  });

  it("rechaza semanas más antiguas o futuras con 422 WEEK_CLOSED", async () => {
    for (const weekStart of ["2026-09-28", "2026-10-19"]) {
      const error = await saveStandup({ weekStart, text: "x", learned: null }, now).catch((e) => e);
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ status: 422, code: "WEEK_CLOSED" });
    }
    expect(prisma.standup.upsert).not.toHaveBeenCalled();
  });
});

// ─── Horas ───

describe("parseTimeEntryFilter", () => {
  it("acepta sin filtros o con un lunes, y rechaza otra fecha", () => {
    expect(parseTimeEntryFilter(null, null)).toEqual({ week: null, projectId: null });
    expect(parseTimeEntryFilter("2026-10-12", " p1 ")).toEqual({ week: "2026-10-12", projectId: "p1" });
    expect(parseTimeEntryFilter("2026-10-13", null)).toBeNull();
  });
});

describe("parseTimeEntryInput", () => {
  const today = "2026-10-13";

  it("acepta un registro de hoy y recorta la descripción", () => {
    expect(parseTimeEntryInput({ ...validEntry, description: "  Revisión de PRs " }, today)).toEqual(validEntry);
  });

  it("rechaza fechas futuras o inválidas", () => {
    expect(parseTimeEntryInput({ ...validEntry, date: "2026-10-14" }, today)).toBeNull();
    expect(parseTimeEntryInput({ ...validEntry, date: "2026-02-30" }, today)).toBeNull();
  });

  it("rechaza minutos fuera de tramos de 15 o de más de 24 h", () => {
    expect(parseTimeEntryInput({ ...validEntry, minutes: 20 }, today)).toBeNull();
    expect(parseTimeEntryInput({ ...validEntry, minutes: 0 }, today)).toBeNull();
    expect(parseTimeEntryInput({ ...validEntry, minutes: 24 * 60 + 15 }, today)).toBeNull();
    expect(parseTimeEntryInput({ ...validEntry, minutes: "150" }, today)).toBeNull();
  });

  it("exige proyecto y descripción", () => {
    expect(parseTimeEntryInput({ ...validEntry, projectId: " " }, today)).toBeNull();
    expect(parseTimeEntryInput({ ...validEntry, description: "" }, today)).toBeNull();
    expect(parseTimeEntryInput({ ...validEntry, description: "x".repeat(301) }, today)).toBeNull();
  });
});

describe("getTimeEntries", () => {
  it("con semana, filtra los propios de lunes a domingo sin tope", async () => {
    prisma.timeEntry.findMany.mockResolvedValue([entryRow()]);

    const entries = await getTimeEntries({ week: "2026-10-12", projectId: "p1" });

    expect(entries).toEqual([
      {
        id: "t1",
        date: "2026-10-13",
        minutes: 150,
        description: "Revisión de PRs",
        project: { id: "p1", name: "San Miguel" },
        kind: "MANUAL",
        task: null,
      },
    ]);
    expect(prisma.timeEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          memberId: "yo",
          projectId: "p1",
          date: { gte: new Date("2026-10-12T00:00:00.000Z"), lt: new Date("2026-10-19T00:00:00.000Z") },
        },
        take: undefined,
      }),
    );
  });

  it("sin semana, trae los más recientes con tope", async () => {
    prisma.timeEntry.findMany.mockResolvedValue([]);
    await getTimeEntries({ week: null, projectId: null });
    expect(prisma.timeEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { memberId: "yo" }, take: MAX_HISTORY_ENTRIES }),
    );
  });
});

describe("createTimeEntry / updateTimeEntry / deleteTimeEntry", () => {
  it("crea el registro a nombre de quien llama, con la fecha a medianoche UTC", async () => {
    prisma.project.findUnique.mockResolvedValue({ id: "p1" });
    prisma.timeEntry.create.mockResolvedValue(entryRow());

    await createTimeEntry(validEntry);

    expect(prisma.timeEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          memberId: "yo",
          projectId: "p1",
          date: new Date("2026-10-13T00:00:00.000Z"),
          minutes: 150,
          description: "Revisión de PRs",
          taskId: null,
          kind: "MANUAL",
        },
      }),
    );
    expect(prisma.task.findUnique).not.toHaveBeenCalled();
  });

  it("rechaza un proyecto inexistente con 422 INVALID_PROJECT", async () => {
    prisma.project.findUnique.mockResolvedValue(null);
    await expect(createTimeEntry(validEntry)).rejects.toMatchObject({ status: 422, code: "INVALID_PROJECT" });
    expect(prisma.timeEntry.create).not.toHaveBeenCalled();
  });

  it("editar o borrar un registro ajeno se comporta como si no existiera", async () => {
    prisma.project.findUnique.mockResolvedValue({ id: "p1" });
    prisma.timeEntry.findFirst.mockResolvedValue(null);
    prisma.timeEntry.deleteMany.mockResolvedValue({ count: 0 });

    expect(await updateTimeEntry("ajeno", validEntry)).toBeNull();
    expect(await deleteTimeEntry("ajeno")).toBe(false);
    expect(prisma.timeEntry.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "ajeno", memberId: "yo" } }));
    expect(prisma.timeEntry.update).not.toHaveBeenCalled();
    expect(prisma.timeEntry.deleteMany).toHaveBeenCalledWith({ where: { id: "ajeno", memberId: "yo" } });
  });

  it("devuelve el registro editado", async () => {
    prisma.project.findUnique.mockResolvedValue({ id: "p1" });
    prisma.timeEntry.findFirst.mockResolvedValue({ id: "t1" });
    prisma.timeEntry.update.mockResolvedValue(entryRow({ minutes: 60 }));

    expect(await updateTimeEntry("t1", { ...validEntry, minutes: 60 })).toMatchObject({ id: "t1", minutes: 60 });
  });
});

describe("horas que salen de mover una tarea", () => {
  const linked = { kind: "TRABAJO", taskId: "ta", task: { label: "T-02", name: "Login" } };

  it("se listan con su tipo y la tarea con su label vigente", async () => {
    prisma.timeEntry.findMany.mockResolvedValue([entryRow({ ...linked, description: "T-03 · Login" })]);
    const [entry] = await getTimeEntries({ week: null, projectId: null });
    expect(entry).toMatchObject({ kind: "TRABAJO", task: { label: "T-02", name: "Login" }, description: "T-03 · Login" });
  });

  it("si la tarea se borró, conservan el tipo sin tarea", async () => {
    prisma.timeEntry.findMany.mockResolvedValue([entryRow({ kind: "REVISION", taskId: null, task: null })]);
    const [entry] = await getTimeEntries({ week: null, projectId: null });
    expect(entry).toMatchObject({ kind: "REVISION", task: null });
  });
});

// ─── Horas vinculadas a una tarea ───

describe("parseTimeEntryInput con tarea", () => {
  const today = "2026-10-13";

  it("acepta una tarea con trabajo o revisión, y sin tarea solo manual", () => {
    expect(parseTimeEntryInput({ ...validEntry, taskId: " ta ", kind: "TRABAJO" }, today)).toMatchObject({ taskId: "ta", kind: "TRABAJO" });
    expect(parseTimeEntryInput({ ...validEntry, taskId: "ta", kind: "REVISION" }, today)).toMatchObject({ kind: "REVISION" });
    expect(parseTimeEntryInput({ ...validEntry, taskId: "ta", kind: "MANUAL" }, today)).toBeNull();
    expect(parseTimeEntryInput({ ...validEntry, taskId: null, kind: "TRABAJO" }, today)).toBeNull();
  });

  it("exige taskId aunque sea null, y un kind conocido", () => {
    const withoutTask: Partial<TimeEntryInput> = { ...validEntry };
    delete withoutTask.taskId;
    expect(parseTimeEntryInput(withoutTask, today)).toBeNull();
    expect(parseTimeEntryInput({ ...validEntry, taskId: " " }, today)).toBeNull();
    expect(parseTimeEntryInput({ ...validEntry, taskId: 3 }, today)).toBeNull();
    expect(parseTimeEntryInput({ ...validEntry, kind: undefined }, today)).toBeNull();
    expect(parseTimeEntryInput({ ...validEntry, kind: "OTRO" }, today)).toBeNull();
  });
});

describe("createTimeEntry / updateTimeEntry con tarea", () => {
  const linked: TimeEntryInput = { ...validEntry, taskId: "ta", kind: "REVISION" };

  beforeEach(() => {
    prisma.project.findUnique.mockResolvedValue({ id: "p1" });
  });

  it("crea el registro vinculado si la tarea es del proyecto", async () => {
    prisma.task.findUnique.mockResolvedValue({ projectId: "p1" });
    prisma.timeEntry.create.mockResolvedValue(entryRow({ kind: "REVISION", taskId: "ta", task: { label: "T-02", name: "Login" } }));

    expect(await createTimeEntry(linked)).toMatchObject({ kind: "REVISION", task: { label: "T-02", name: "Login" } });
    expect(prisma.task.findUnique).toHaveBeenCalledWith({ where: { id: "ta" }, select: { projectId: true } });
    expect(prisma.timeEntry.create.mock.calls[0][0].data).toMatchObject({ taskId: "ta", kind: "REVISION", memberId: "yo" });
  });

  it("rechaza una tarea de otro proyecto o inexistente con 422 INVALID_TASK", async () => {
    for (const task of [{ projectId: "p2" }, null]) {
      prisma.task.findUnique.mockResolvedValue(task);
      await expect(createTimeEntry(linked)).rejects.toMatchObject({ status: 422, code: "INVALID_TASK" });
      await expect(updateTimeEntry("t1", linked)).rejects.toMatchObject({ status: 422, code: "INVALID_TASK" });
    }
    expect(prisma.timeEntry.create).not.toHaveBeenCalled();
    expect(prisma.timeEntry.update).not.toHaveBeenCalled();
  });

  it("editar escribe el vínculo que viene en el body: cambiarlo, agregarlo o quitarlo", async () => {
    prisma.task.findUnique.mockResolvedValue({ projectId: "p1" });
    prisma.timeEntry.findFirst.mockResolvedValue({ id: "t1" });
    prisma.timeEntry.update.mockResolvedValue(entryRow());

    await updateTimeEntry("t1", linked);
    expect(prisma.timeEntry.update.mock.calls[0][0].data).toMatchObject({ taskId: "ta", kind: "REVISION" });

    await updateTimeEntry("t1", validEntry);
    expect(prisma.timeEntry.update.mock.calls[1][0].data).toMatchObject({ taskId: null, kind: "MANUAL" });
  });

  it("cambiar de proyecto sin tarea del nuevo lo deja manual", async () => {
    prisma.project.findUnique.mockResolvedValue({ id: "p2" });
    prisma.timeEntry.findFirst.mockResolvedValue({ id: "t1" });
    prisma.timeEntry.update.mockResolvedValue(entryRow({ projectId: "p2" }));

    await updateTimeEntry("t1", { ...validEntry, projectId: "p2" });
    expect(prisma.timeEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ projectId: "p2", taskId: null, kind: "MANUAL" }) }),
    );
  });
});

describe("getTimeEntryTaskOptions", () => {
  it("lista todas las tareas del proyecto, de cualquier columna, por número de label", async () => {
    prisma.project.findUnique.mockResolvedValue({
      tasks: [
        { id: "c", label: "T-100", name: "C", column: "PENDIENTE" },
        { id: "b", label: "T-10", name: "B", column: "LISTO" },
        { id: "a", label: "T-02", name: "A", column: "PROGRESO" },
      ],
    });
    expect((await getTimeEntryTaskOptions("p1"))?.map((t) => t.label)).toEqual(["T-02", "T-10", "T-100"]);
  });

  it("devuelve null si el proyecto no existe", async () => {
    prisma.project.findUnique.mockResolvedValue(null);
    expect(await getTimeEntryTaskOptions("nope")).toBeNull();
  });
});

describe("resolveTaskLabel", () => {
  const features = [{ id: "fa", label: "F-01" }];
  const tasks = [
    { id: "ta", label: "T-01" },
    { id: "tb", label: "T-02" },
  ];

  beforeEach(() => {
    prisma.feature.findMany.mockResolvedValue(features);
    prisma.task.findMany.mockResolvedValue(tasks);
  });

  it("resuelve el label al id con un token vigente", async () => {
    expect(await resolveTaskLabel("p1", "T-02", labelsToken(features, tasks))).toBe("tb");
  });

  it("rechaza un token de antes de un borrado con 412 y un label que no existe con 422", async () => {
    // El snapshot vio T-02 apuntando a otra tarea: se borró algo y se renumeró.
    const stale = labelsToken(features, [tasks[0], { id: "tx", label: "T-02" }]);
    await expect(resolveTaskLabel("p1", "T-02", stale)).rejects.toMatchObject({ status: 412, code: "LABELS_CHANGED" });
    await expect(resolveTaskLabel("p1", "T-09", labelsToken(features, tasks))).rejects.toMatchObject({
      status: 422,
      code: "INVALID_TASK",
    });
  });
});
