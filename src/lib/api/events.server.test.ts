import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthError, requireMember } from "@/lib/auth/guards";
import {
  createEvent,
  deleteEvent,
  getEvents,
  parseCreateEventInput,
  parseEventRange,
  parseUpdateEventInput,
  updateEvent,
} from "@/lib/api/events.server";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    project: { findUnique: vi.fn() },
    calendarEvent: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma }));
// Better Auth no se inicializa en los tests; los guards reales no se usan acá.
vi.mock("@/lib/auth", () => ({ auth: {} }));
vi.mock("@/lib/auth/guards", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/guards")>()),
  requireMember: vi.fn(async () => ({ id: "yo", role: "EQUIPO" })),
}));

function resetPrisma() {
  for (const model of Object.values(prisma)) {
    if (typeof model === "function") model.mockReset();
    else for (const fn of Object.values(model)) fn.mockReset();
  }
}

function actAs(id: string, role: "COORDINACION" | "EQUIPO" | "ROOKIE") {
  vi.mocked(requireMember).mockResolvedValue({ id, role, name: id, email: "", image: null, isVerified: true });
}

const validEvent = {
  title: "Reunión de área",
  description: "",
  location: "Sala 2",
  kind: "REUNION",
  allDay: false,
  startsAt: "2026-10-14T21:00:00.000Z",
  endsAt: "2026-10-14T22:00:00.000Z",
  projectId: null,
};

/** Fila que devuelve Prisma con el include de events.server.ts. */
function eventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "e1",
    title: "Reunión de área",
    description: null,
    location: null,
    kind: "REUNION",
    allDay: false,
    startsAt: new Date("2026-10-14T21:00:00.000Z"),
    endsAt: new Date("2026-10-14T22:00:00.000Z"),
    seriesId: null,
    projectId: null,
    createdById: "autor",
    createdAt: new Date(),
    updatedAt: new Date(),
    project: null,
    createdBy: { id: "autor", name: "Ana Martínez" },
    ...overrides,
  };
}

describe("parseEventRange", () => {
  it("acepta el rango de una grilla mes o semana", () => {
    expect(parseEventRange("2026-09-28", "2026-11-09")).toEqual({ from: "2026-09-28", to: "2026-11-09" });
    expect(parseEventRange("2026-10-12", "2026-10-19")).not.toBeNull();
  });

  it("rechaza fechas faltantes, mal formadas, invertidas o rangos de más de 45 días", () => {
    expect(parseEventRange(null, "2026-10-19")).toBeNull();
    expect(parseEventRange("2026-10-12", "2026-02-30")).toBeNull();
    expect(parseEventRange("2026-10-19", "2026-10-12")).toBeNull();
    expect(parseEventRange("2026-10-12", "2026-10-12")).toBeNull();
    expect(parseEventRange("2026-01-01", "2026-03-01")).toBeNull();
  });
});

describe("parseUpdateEventInput / parseCreateEventInput", () => {
  it("normaliza textos vacíos a null y los instantes a UTC", () => {
    expect(parseUpdateEventInput({ ...validEvent, title: "  Reunión de área ", startsAt: "2026-10-14T18:00-03:00" })).toEqual({
      ...validEvent,
      description: null,
      startsAt: "2026-10-14T21:00:00.000Z",
    });
  });

  it("rechaza fin igual o anterior al inicio", () => {
    expect(parseUpdateEventInput({ ...validEvent, endsAt: validEvent.startsAt })).toBeNull();
    expect(parseUpdateEventInput({ ...validEvent, endsAt: "2026-10-14T20:00:00.000Z" })).toBeNull();
  });

  it("rechaza kind inválido, título vacío y fechas sin zona o mal formadas", () => {
    expect(parseUpdateEventInput({ ...validEvent, kind: "FIESTA" })).toBeNull();
    expect(parseUpdateEventInput({ ...validEvent, title: "   " })).toBeNull();
    expect(parseUpdateEventInput({ ...validEvent, startsAt: "2026-10-14T18:00" })).toBeNull();
    expect(parseUpdateEventInput({ ...validEvent, startsAt: "mañana" })).toBeNull();
    expect(parseUpdateEventInput(null)).toBeNull();
  });

  it("exige projectId explícito, aunque sea null", () => {
    const withoutProject: Record<string, unknown> = { ...validEvent };
    delete withoutProject.projectId;
    expect(parseUpdateEventInput(withoutProject)).toBeNull();
    expect(parseUpdateEventInput({ ...validEvent, projectId: " p1 " })).toMatchObject({ projectId: "p1" });
  });

  it("los de día completo tienen que caer a medianoche UTC", () => {
    const allDay = { ...validEvent, allDay: true, startsAt: "2026-10-14T00:00:00.000Z", endsAt: "2026-10-16T00:00:00.000Z" };
    expect(parseUpdateEventInput(allDay)).not.toBeNull();
    // Medianoche de Chile no es medianoche UTC.
    expect(parseUpdateEventInput({ ...allDay, startsAt: "2026-10-14T03:00:00.000Z" })).toBeNull();
  });

  it("acepta repetir hasta 26 semanas y rechaza más o una fecha anterior al evento", () => {
    expect(parseCreateEventInput(validEvent)).toMatchObject({ repeatWeeklyUntil: null });
    expect(parseCreateEventInput({ ...validEvent, repeatWeeklyUntil: "2027-04-14" })).toMatchObject({
      repeatWeeklyUntil: "2027-04-14",
    });
    expect(parseCreateEventInput({ ...validEvent, repeatWeeklyUntil: "2027-04-21" })).toBeNull();
    expect(parseCreateEventInput({ ...validEvent, repeatWeeklyUntil: "2026-10-13" })).toBeNull();
    expect(parseCreateEventInput({ ...validEvent, repeatWeeklyUntil: "14-04-2027" })).toBeNull();
  });
});

describe("getEvents", () => {
  beforeEach(() => {
    resetPrisma();
    actAs("yo", "EQUIPO");
  });

  it("consulta con un día de margen por lado y calcula canEdit por evento", async () => {
    prisma.calendarEvent.findMany.mockResolvedValue([eventRow(), eventRow({ id: "e2", createdById: "yo", createdBy: null })]);

    const events = await getEvents("2026-10-12", "2026-10-19");

    expect(prisma.calendarEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          startsAt: { lt: new Date("2026-10-20T00:00:00.000Z") },
          endsAt: { gt: new Date("2026-10-11T00:00:00.000Z") },
        },
      }),
    );
    expect(events.map((e) => [e.id, e.canEdit])).toEqual([
      ["e1", false],
      ["e2", true],
    ]);
    expect(events[0]).toMatchObject({
      startsAt: "2026-10-14T21:00:00.000Z",
      createdBy: { id: "autor", name: "Ana Martínez", initials: "AM" },
    });
    expect(events[1].createdBy).toBeNull();
  });
});

describe("createEvent", () => {
  beforeEach(() => {
    resetPrisma();
    actAs("yo", "ROOKIE");
    prisma.$transaction.mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops));
    prisma.calendarEvent.create.mockImplementation(async ({ data }) => eventRow({ ...data, id: `e-${data.startsAt.toISOString()}` }));
  });

  it("cualquier miembro aprobado crea, y queda como autor", async () => {
    const [event] = await createEvent(parseCreateEventInput(validEvent)!);

    expect(prisma.calendarEvent.create).toHaveBeenCalledTimes(1);
    expect(prisma.calendarEvent.create.mock.calls[0][0].data).toMatchObject({ createdById: "yo", seriesId: null });
    expect(event.canEdit).toBe(true);
  });

  it("genera la serie semanal con un seriesId común y conserva la hora local tras el cambio de horario", async () => {
    // Martes 31 mar 2026, 18:00 en Chile (UTC−3); el 5 abr Chile pasa a UTC−4.
    const input = parseCreateEventInput({
      ...validEvent,
      startsAt: "2026-03-31T21:00:00.000Z",
      endsAt: "2026-03-31T22:00:00.000Z",
      repeatWeeklyUntil: "2026-04-14",
    })!;

    const created = await createEvent(input);

    const data = prisma.calendarEvent.create.mock.calls.map(([args]) => args.data);
    expect(created).toHaveLength(3);
    expect(data.map((d) => d.startsAt.toISOString())).toEqual([
      "2026-03-31T21:00:00.000Z",
      "2026-04-07T22:00:00.000Z",
      "2026-04-14T22:00:00.000Z",
    ]);
    expect(data.every((d) => d.endsAt.getTime() - d.startsAt.getTime() === 60 * 60 * 1000)).toBe(true);
    expect(new Set(data.map((d) => d.seriesId)).size).toBe(1);
    expect(data[0].seriesId).toEqual(expect.any(String));
  });

  it("responde 422 si el proyecto no existe", async () => {
    prisma.project.findUnique.mockResolvedValue(null);
    await expect(createEvent(parseCreateEventInput({ ...validEvent, projectId: "nope" })!)).rejects.toMatchObject({
      status: 422,
      code: "INVALID_PROJECT",
    });
    expect(prisma.calendarEvent.create).not.toHaveBeenCalled();
  });
});

describe("permisos de edición y borrado", () => {
  const input = parseUpdateEventInput({ ...validEvent, title: "Renombrado" })!;

  beforeEach(() => {
    resetPrisma();
    prisma.calendarEvent.findUnique.mockImplementation(async (args) =>
      args.select ? { createdById: "autor" } : eventRow({ title: "Renombrado" }),
    );
    prisma.calendarEvent.updateMany.mockResolvedValue({ count: 1 });
    prisma.calendarEvent.deleteMany.mockResolvedValue({ count: 1 });
  });

  it("el creador puede editar y borrar", async () => {
    actAs("autor", "ROOKIE");
    await expect(updateEvent("e1", input)).resolves.toMatchObject({ title: "Renombrado", canEdit: true });
    await expect(deleteEvent("e1")).resolves.toBe(true);
  });

  it("coordinación puede editar y borrar eventos ajenos", async () => {
    actAs("coord", "COORDINACION");
    await expect(updateEvent("e1", input)).resolves.toMatchObject({ canEdit: true });
    await expect(deleteEvent("e1")).resolves.toBe(true);
  });

  it("otro miembro recibe 403 y no se escribe nada", async () => {
    actAs("otro", "EQUIPO");
    await expect(updateEvent("e1", input)).rejects.toBeInstanceOf(AuthError);
    await expect(deleteEvent("e1")).rejects.toMatchObject({ status: 403, code: "FORBIDDEN_ROLE" });
    expect(prisma.calendarEvent.updateMany).not.toHaveBeenCalled();
    expect(prisma.calendarEvent.deleteMany).not.toHaveBeenCalled();
  });

  it("un evento cuyo autor ya no existe solo lo toca coordinación", async () => {
    prisma.calendarEvent.findUnique.mockResolvedValue({ createdById: null });
    actAs("otro", "EQUIPO");
    await expect(deleteEvent("e1")).rejects.toMatchObject({ status: 403 });
  });

  it("devuelve null / false si el evento no existe", async () => {
    actAs("coord", "COORDINACION");
    prisma.calendarEvent.findUnique.mockResolvedValue(null);
    await expect(updateEvent("e1", input)).resolves.toBeNull();
    await expect(deleteEvent("e1")).resolves.toBe(false);
  });
});
