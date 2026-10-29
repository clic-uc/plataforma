import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatLabel, labelsToken, type LabelledRow } from "@/lib/api/labels";
import { AuthError, requireCoordinacion } from "@/lib/auth/guards";
import {
  addProjectMember,
  deleteFeature,
  deleteTask,
  parseAddProjectMemberInput,
  createProjectDocComment,
  createTask,
  getProject,
  parseCreateDocCommentInput,
  parseCreateFeatureInput,
  parseCreateTaskInput,
  parseUpdateTaskInput,
  removeProjectMember,
  resolveProjectDocComment,
  setIssueLink,
  updateTask,
} from "@/lib/api/projects.server";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    project: { findUnique: vi.fn() },
    document: { findUnique: vi.fn() },
    acta: { findFirst: vi.fn() },
    docComment: { create: vi.fn(), deleteMany: vi.fn() },
    member: { findUnique: vi.fn() },
    feature: { findMany: vi.fn(), update: vi.fn() },
    task: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    issue: { findUnique: vi.fn(), update: vi.fn() },
    projectMember: { findUnique: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
    taskTransition: { findMany: vi.fn(), create: vi.fn() },
    timeEntry: { groupBy: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma }));
// Better Auth no se inicializa en los tests; los guards reales no se usan acá.
vi.mock("@/lib/auth", () => ({ auth: {} }));
vi.mock("@/lib/auth/guards", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/guards")>()),
  requireMember: vi.fn(async () => ({ id: "yo", role: "EQUIPO" })),
  requireCoordinacion: vi.fn(async () => ({ id: "yo", role: "COORDINACION" })),
}));

function resetPrisma() {
  for (const model of Object.values(prisma)) {
    if (typeof model === "function") model.mockReset();
    else for (const fn of Object.values(model)) fn.mockReset();
  }
  // getProject lee el historial y las horas de las tareas aparte; vacíos salvo que el test diga otra cosa.
  prisma.taskTransition.findMany.mockResolvedValue([]);
  prisma.timeEntry.groupBy.mockResolvedValue([]);
}

/** Fila mínima que getProject sabe mapear; las pruebas que no miran el detalle la dejan vacía. */
const projectRow = {
  id: "p1",
  name: "Plataforma",
  client: "CLIC",
  description: "",
  status: "ACTIVO",
  startDate: new Date(2026, 0, 15),
  archived: false,
  members: [],
  features: [],
  tasks: [],
  documents: [],
  actas: [],
};

const rows = (prefix: "F" | "T", ids: string[]): LabelledRow[] =>
  ids.map((id, i) => ({ id, label: formatLabel(prefix, i + 1) }));

const validTask = { featureId: null, assigneeId: null, name: "Login", type: "FEATURE", column: "PENDIENTE", difficulty: null };

describe("parseCreateTaskInput / parseUpdateTaskInput", () => {
  it("acepta un body válido y normaliza strings vacíos a null", () => {
    expect(parseCreateTaskInput({ ...validTask, featureId: " ", name: "  Login " })).toEqual({
      featureId: null,
      assigneeId: null,
      name: "Login",
      type: "FEATURE",
      column: "PENDIENTE",
      description: null,
      difficulty: null,
      issueNumber: null,
    });
  });

  it("exige assigneeId explícito, aunque sea null", () => {
    const withoutAssignee: Record<string, unknown> = { ...validTask };
    delete withoutAssignee.assigneeId;
    expect(parseCreateTaskInput(withoutAssignee)).toBeNull();
    expect(parseCreateTaskInput({ ...validTask, assigneeId: 42 })).toBeNull();
  });

  it("exige difficulty explícita, aunque sea null, y rechaza valores fuera del enum", () => {
    const withoutDifficulty: Record<string, unknown> = { ...validTask };
    delete withoutDifficulty.difficulty;
    expect(parseCreateTaskInput(withoutDifficulty)).toBeNull();
    expect(parseUpdateTaskInput(withoutDifficulty)).toBeNull();
    expect(parseCreateTaskInput({ ...validTask, difficulty: "EXTREMA" })).toBeNull();
    expect(parseCreateTaskInput({ ...validTask, difficulty: "ALTA" })).toMatchObject({ difficulty: "ALTA" });
  });

  it("timeSpent es opcional y se valida como cualquier registro de horas", () => {
    expect(parseUpdateTaskInput(validTask)).toMatchObject({ timeSpent: null });
    expect(parseUpdateTaskInput({ ...validTask, timeSpent: null })).toMatchObject({ timeSpent: null });
    expect(parseUpdateTaskInput({ ...validTask, timeSpent: { minutes: 90 } })).toMatchObject({ timeSpent: { minutes: 90 } });
    for (const timeSpent of [{ minutes: 20 }, { minutes: 0 }, { minutes: 24 * 60 + 15 }, { minutes: "60" }, {}, 60]) {
      expect(parseUpdateTaskInput({ ...validTask, timeSpent })).toBeNull();
    }
  });

  it("rechaza enums desconocidos y nombres vacíos", () => {
    expect(parseCreateTaskInput({ ...validTask, type: "EPIC" })).toBeNull();
    expect(parseCreateTaskInput({ ...validTask, column: "HECHO" })).toBeNull();
    expect(parseCreateTaskInput({ ...validTask, name: "   " })).toBeNull();
    expect(parseCreateTaskInput(null)).toBeNull();
  });

  it("completa active y description en el PATCH", () => {
    expect(parseUpdateTaskInput(validTask)).toMatchObject({ active: true, description: null });
  });

  it("acepta un issueNumber entero positivo y rechaza el body entero si es inválido", () => {
    expect(parseCreateTaskInput({ ...validTask, issueNumber: 3 })).toMatchObject({ issueNumber: 3 });
    expect(parseCreateTaskInput({ ...validTask, issueNumber: null })).toMatchObject({ issueNumber: null });
    for (const issueNumber of [0, -1, 1.5, "3"]) {
      expect(parseCreateTaskInput({ ...validTask, issueNumber })).toBeNull();
    }
  });

  it("el PATCH no lleva issueNumber: el vínculo tiene su propia ruta", () => {
    expect(parseUpdateTaskInput({ ...validTask, issueNumber: 3 })).not.toHaveProperty("issueNumber");
  });
});

describe("parseCreateFeatureInput", () => {
  const validFeature = { name: "Auth", priority: "ALTA" };

  it("issueNumber es opcional: null si no viene", () => {
    expect(parseCreateFeatureInput(validFeature)).toEqual({
      name: "Auth",
      priority: "ALTA",
      description: null,
      issueNumber: null,
    });
    expect(parseCreateFeatureInput({ ...validFeature, issueNumber: 7 })).toMatchObject({ issueNumber: 7 });
  });

  it("rechaza el body entero si issueNumber es inválido", () => {
    for (const issueNumber of [0, 1.5, "3"]) {
      expect(parseCreateFeatureInput({ ...validFeature, issueNumber })).toBeNull();
    }
  });
});

describe("vínculos con issues", () => {
  const features = rows("F", ["fa"]);
  const tasks = rows("T", ["ta", "tb"]);
  const token = `"${labelsToken(features, tasks)}"`;

  beforeEach(() => {
    resetPrisma();
    prisma.project.findUnique.mockResolvedValue(projectRow);
    prisma.feature.findMany.mockResolvedValue(features);
    prisma.task.findMany.mockResolvedValue(tasks);
    prisma.issue.findUnique.mockResolvedValue({ id: "i3" });
    prisma.$transaction.mockResolvedValue([]);
  });

  it("crear una tarea desde un issue la vincula", async () => {
    await createTask("p1", { ...parseCreateTaskInput(validTask)!, issueNumber: 3 }, null);
    expect(prisma.issue.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId_number: { projectId: "p1", number: 3 } } }),
    );
    expect(prisma.task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ issues: { connect: { id: "i3" } } }),
    });
  });

  it("crear vinculada cuenta como actividad del issue, en la misma transacción", async () => {
    await createTask("p1", { ...parseCreateTaskInput(validTask)!, issueNumber: 3 }, null);
    expect(prisma.issue.update).toHaveBeenCalledWith({
      where: { id: "i3" },
      data: expect.objectContaining({
        lastActivityAt: expect.any(Date),
        reviews: expect.objectContaining({ upsert: expect.objectContaining({ create: expect.objectContaining({ memberId: "yo" }) }) }),
      }),
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("crear una tarea desde un issue que no existe responde 422 sin crearla", async () => {
    prisma.issue.findUnique.mockResolvedValue(null);
    await expect(
      createTask("p1", { ...parseCreateTaskInput(validTask)!, issueNumber: 9 }, null),
    ).rejects.toMatchObject({ status: 422, code: "INVALID_ISSUE" });
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it("sin issueNumber la tarea se crea sin vínculo", async () => {
    await createTask("p1", parseCreateTaskInput(validTask)!, null);
    expect(prisma.issue.findUnique).not.toHaveBeenCalled();
    expect(prisma.task.create.mock.calls[0][0].data).not.toHaveProperty("issues");
  });

  it("vincular exige el labelsToken", async () => {
    await expect(setIssueLink("p1", "task", "T-02", 3, true, null)).rejects.toMatchObject({ status: 428 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("vincula por id, marca actividad en el issue y lo deja revisado por quien vincula", async () => {
    await expect(setIssueLink("p1", "task", "T-02", 3, true, token)).resolves.not.toBeNull();
    expect(prisma.task.update).toHaveBeenCalledWith({ where: { id: "tb" }, data: { issues: { connect: { id: "i3" } } } });
    const { where, data } = prisma.issue.update.mock.calls[0][0];
    expect(where).toEqual({ id: "i3" });
    expect(data.lastActivityAt).toBeInstanceOf(Date);
    expect(data.reviews.upsert).toEqual({
      where: { issueId_memberId: { issueId: "i3", memberId: "yo" } },
      create: { memberId: "yo", reviewedAt: data.lastActivityAt },
      update: { reviewedAt: data.lastActivityAt },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("desvincular una feature usa disconnect", async () => {
    await setIssueLink("p1", "feature", "F-01", 3, false, token);
    expect(prisma.feature.update).toHaveBeenCalledWith({
      where: { id: "fa" },
      data: { issues: { disconnect: { id: "i3" } } },
    });
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it("null si no existe el label o el issue", async () => {
    await expect(setIssueLink("p1", "task", "T-09", 3, true, token)).resolves.toBeNull();
    prisma.issue.findUnique.mockResolvedValue(null);
    await expect(setIssueLink("p1", "task", "T-01", 99, true, token)).resolves.toBeNull();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("parseAddProjectMemberInput", () => {
  it("exige el miembro; un rol que venga en el body se ignora", () => {
    expect(parseAddProjectMemberInput({ memberId: " m1 " })).toEqual({ memberId: "m1" });
    expect(parseAddProjectMemberInput({ memberId: "m1", role: "Dev" })).toEqual({ memberId: "m1" });
    expect(parseAddProjectMemberInput({ memberId: "" })).toBeNull();
    expect(parseAddProjectMemberInput({})).toBeNull();
  });
});

describe("mutaciones direccionadas por label", () => {
  const features = rows("F", ["fa"]);
  const before = rows("T", ["ta", "tb", "tc"]);
  // Otro cliente borró T-01: tb y tc se renumeraron a T-01 y T-02.
  const after = rows("T", ["tb", "tc"]);
  // Token del snapshot `before`; los tests deciden qué estado ve el servidor.
  const snapshotToken = `"${labelsToken(features, before)}"`;
  const input = parseUpdateTaskInput({ ...validTask, name: "Renombrada" })!;

  beforeEach(() => {
    resetPrisma();
    prisma.feature.findMany.mockResolvedValue(features);
    prisma.task.findMany.mockResolvedValue(before);
    prisma.task.findUnique.mockResolvedValue({ assigneeId: null, column: "PENDIENTE" });
    prisma.project.findUnique.mockResolvedValue(null);
    prisma.$transaction.mockImplementation((fn: (client: typeof prisma) => unknown) => fn(prisma));
  });

  it("responde 428 si falta el token", async () => {
    await expect(updateTask("p1", "T-02", input, null)).rejects.toMatchObject({ status: 428 });
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it("responde 412 si los labels se renumeraron después del snapshot", async () => {
    prisma.task.findMany.mockResolvedValue(after);
    await expect(updateTask("p1", "T-02", input, snapshotToken)).rejects.toMatchObject({
      status: 412,
      code: "LABELS_CHANGED",
    });
    await expect(deleteTask("p1", "T-02", snapshotToken)).rejects.toMatchObject({ status: 412 });
    expect(prisma.task.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("con el token vigente escribe por id, no por label", async () => {
    await updateTask("p1", "T-02", input, snapshotToken);
    expect(prisma.task.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "tb" }, data: expect.objectContaining({ name: "Renombrada" }) }),
    );
  });

  it("solo permite asignar a miembros del equipo", async () => {
    prisma.projectMember.findUnique.mockResolvedValue(null);
    await expect(updateTask("p1", "T-02", { ...input, assigneeId: "ajeno" }, snapshotToken)).rejects.toMatchObject({
      status: 422,
      code: "NOT_PROJECT_MEMBER",
    });
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it("no revalida una asignación que no cambió", async () => {
    prisma.task.findUnique.mockResolvedValue({ assigneeId: "antiguo", column: "PENDIENTE" });
    await updateTask("p1", "T-02", { ...input, assigneeId: "antiguo" }, snapshotToken);
    expect(prisma.projectMember.findUnique).not.toHaveBeenCalled();
    expect(prisma.task.update).toHaveBeenCalled();
  });
});

// ─── Flujo de tareas ───
//
// Asignado obligatorio en En progreso / En revisión, historial en TaskTransition y horas al
// sacar la tarea de esas columnas. requireMember devuelve "yo".

describe("flujo de tareas", () => {
  const tasks = rows("T", ["ta", "tb"]);
  const token = `"${labelsToken([], tasks)}"`;
  // Martes 13 oct 2026, 22:30 en Chile (ya es 14 en UTC): la fecha de las horas es la de Chile.
  const now = new Date("2026-10-14T01:30:00.000Z");
  const base = parseUpdateTaskInput(validTask)!;

  function current(column: string, assigneeId: string | null) {
    prisma.task.findUnique.mockResolvedValue({ column, assigneeId });
  }

  beforeEach(() => {
    resetPrisma();
    prisma.feature.findMany.mockResolvedValue([]);
    prisma.task.findMany.mockResolvedValue(tasks);
    prisma.project.findUnique.mockResolvedValue(projectRow);
    prisma.projectMember.findUnique.mockResolvedValue({ memberId: "x" });
    prisma.$transaction.mockImplementation((fn: (client: typeof prisma) => unknown) => fn(prisma));
  });

  describe("al crear", () => {
    it("escribe la fila inicial del historial junto con la tarea", async () => {
      await createTask("p1", parseCreateTaskInput({ ...validTask, assigneeId: "ana", difficulty: "MEDIA" })!, null);
      expect(prisma.task.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          difficulty: "MEDIA",
          transitions: { create: { fromColumn: null, toColumn: "PENDIENTE", assigneeId: "ana", byId: "yo" } },
        }),
      });
    });

    it.each(["PROGRESO", "REVISION"])("en %s exige asignado", async (column) => {
      await expect(createTask("p1", parseCreateTaskInput({ ...validTask, column })!, null)).rejects.toMatchObject({
        status: 422,
        code: "ASSIGNEE_REQUIRED",
      });
      expect(prisma.task.create).not.toHaveBeenCalled();
    });

    it("en Por revisar puede quedar sin asignar", async () => {
      await createTask("p1", parseCreateTaskInput({ ...validTask, column: "REVISAR" })!, null);
      expect(prisma.task.create).toHaveBeenCalled();
    });
  });

  describe("asignado obligatorio", () => {
    it("rechaza mover a En progreso sin asignado, sin escribir nada", async () => {
      current("PENDIENTE", null);
      await expect(updateTask("p1", "T-01", { ...base, column: "PROGRESO" }, token, now)).rejects.toMatchObject({
        status: 422,
        code: "ASSIGNEE_REQUIRED",
      });
      expect(prisma.task.update).not.toHaveBeenCalled();
      expect(prisma.taskTransition.create).not.toHaveBeenCalled();
    });

    it("rechaza quitar el asignado de una tarea En revisión", async () => {
      current("REVISION", "beto");
      await expect(
        updateTask("p1", "T-01", { ...base, column: "REVISION", assigneeId: null }, token, now),
      ).rejects.toMatchObject({ code: "ASSIGNEE_REQUIRED" });
    });

    it("rechaza pasar de En progreso a En revisión sin asignado aunque ya estuviera sin él", async () => {
      current("PROGRESO", null);
      await expect(updateTask("p1", "T-01", { ...base, column: "REVISION" }, token, now)).rejects.toMatchObject({
        code: "ASSIGNEE_REQUIRED",
      });
    });

    it("una tarea antigua en progreso sin asignado se puede editar si no cambia columna ni asignado", async () => {
      current("PROGRESO", null);
      await updateTask("p1", "T-01", { ...base, column: "PROGRESO", name: "Otro nombre" }, token, now);
      expect(prisma.task.update).toHaveBeenCalled();
      expect(prisma.taskTransition.create).not.toHaveBeenCalled();
    });
  });

  describe("historial", () => {
    it("un cambio de columna escribe la transición con quién la movió y el asignado vigente", async () => {
      current("PENDIENTE", null);
      await updateTask("p1", "T-02", { ...base, column: "PROGRESO", assigneeId: "ana" }, token, now);
      expect(prisma.taskTransition.create).toHaveBeenCalledWith({
        data: { taskId: "tb", fromColumn: "PENDIENTE", toColumn: "PROGRESO", assigneeId: "ana", byId: "yo", at: now },
      });
    });

    it("un cambio solo de asignado también, con la misma columna de origen y destino", async () => {
      current("PROGRESO", "ana");
      await updateTask("p1", "T-01", { ...base, column: "PROGRESO", assigneeId: "caro" }, token, now);
      expect(prisma.taskTransition.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ fromColumn: "PROGRESO", toColumn: "PROGRESO", assigneeId: "caro" }),
      });
    });

    it("editar sin cambiar columna ni asignado no escribe historial", async () => {
      current("PENDIENTE", "ana");
      await updateTask("p1", "T-01", { ...base, assigneeId: "ana", difficulty: "ALTA" }, token, now);
      expect(prisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ difficulty: "ALTA" }) }),
      );
      expect(prisma.taskTransition.create).not.toHaveBeenCalled();
    });
  });

  describe("horas al mover", () => {
    it("quien la tenía en progreso registra horas de trabajo, aunque la deje sin asignar", async () => {
      current("PROGRESO", "yo");
      await updateTask(
        "p1",
        "T-02",
        { ...base, name: "Login", column: "REVISAR", assigneeId: null, timeSpent: { minutes: 90 } },
        token,
        now,
      );
      expect(prisma.timeEntry.create).toHaveBeenCalledWith({
        data: {
          memberId: "yo",
          projectId: "p1",
          taskId: "tb",
          kind: "TRABAJO",
          date: new Date("2026-10-13T00:00:00.000Z"),
          minutes: 90,
          description: "T-02 · Login",
        },
      });
      expect(prisma.taskTransition.create).toHaveBeenCalled();
    });

    it("al salir de En revisión las horas son de revisión", async () => {
      current("REVISION", "yo");
      await updateTask("p1", "T-01", { ...base, column: "LISTO", assigneeId: "yo", timeSpent: { minutes: 30 } }, token, now);
      expect(prisma.timeEntry.create).toHaveBeenCalledWith({ data: expect.objectContaining({ kind: "REVISION", minutes: 30 }) });
    });

    it("moverla sin horas no crea registro", async () => {
      current("PROGRESO", "yo");
      await updateTask("p1", "T-01", { ...base, column: "REVISAR" }, token, now);
      expect(prisma.timeEntry.create).not.toHaveBeenCalled();
    });

    it.each([
      ["no sale de una columna de trabajo", "PENDIENTE", "yo", "REVISAR"],
      ["no cambia de columna", "PROGRESO", "yo", "PROGRESO"],
      ["quien envía no es el asignado", "PROGRESO", "ana", "REVISAR"],
      ["la tarea no tenía asignado", "REVISAR", null, "LISTO"],
    ] as const)("rechaza horas si %s", async (_name, from, assigneeId, to) => {
      current(from, assigneeId);
      await expect(
        updateTask("p1", "T-01", { ...base, column: to, assigneeId, timeSpent: { minutes: 60 } }, token, now),
      ).rejects.toMatchObject({ status: 422, code: "TIME_NOT_ALLOWED" });
      expect(prisma.task.update).not.toHaveBeenCalled();
      expect(prisma.timeEntry.create).not.toHaveBeenCalled();
    });

    it("el asignado que cuenta es el de antes del cambio", async () => {
      current("PROGRESO", "ana");
      // Se la pasa a sí misma al moverla: las horas de lo que trabajó Ana no son suyas.
      await expect(
        updateTask("p1", "T-01", { ...base, column: "REVISION", assigneeId: "yo", timeSpent: { minutes: 60 } }, token, now),
      ).rejects.toMatchObject({ code: "TIME_NOT_ALLOWED" });
    });
  });
});

describe("getProject: dificultad e historial", () => {
  const H = 60 * 60 * 1000;
  const createdAt = new Date("2026-10-01T12:00:00.000Z");
  const at = (hours: number) => new Date(createdAt.getTime() + hours * H);
  const taskRow = (overrides: Record<string, unknown>) => ({
    featureId: null,
    type: "FEATURE",
    active: true,
    description: null,
    createdAt,
    issues: [],
    ...overrides,
  });

  beforeEach(() => {
    resetPrisma();
    prisma.project.findUnique.mockResolvedValue({
      ...projectRow,
      tasks: [
        taskRow({
          id: "ta", label: "T-01", name: "Login", column: "LISTO", difficulty: "ALTA",
          assigneeId: "beto", assignee: { id: "beto", name: "Beto" },
        }),
        taskRow({ id: "tb", label: "T-02", name: "Sin historial", column: "PENDIENTE", difficulty: null, assigneeId: null, assignee: null }),
      ],
    });
    const transition = (hours: number, toColumn: string, assignee: { id: string; name: string } | null) => ({
      taskId: "ta", fromColumn: null, toColumn, assigneeId: assignee?.id ?? null, at: at(hours), assignee,
    });
    prisma.taskTransition.findMany.mockResolvedValue([
      transition(0, "PENDIENTE", null),
      transition(1, "PROGRESO", { id: "ana", name: "Ana" }),
      transition(5, "REVISION", { id: "beto", name: "Beto" }),
      transition(6, "LISTO", { id: "beto", name: "Beto" }),
    ]);
    prisma.timeEntry.groupBy.mockResolvedValue([
      { taskId: "ta", kind: "TRABAJO", _sum: { minutes: 180 } },
      { taskId: "ta", kind: "REVISION", _sum: { minutes: 45 } },
    ]);
  });

  it("resume quién trabajó y revisó, el tiempo por columna y las horas de todo el equipo", async () => {
    const detail = await getProject("p1", at(10));
    const [done, untouched] = detail!.tasks;

    expect(done.difficulty).toBe("ALTA");
    expect(done.history).toEqual({
      createdAt: createdAt.toISOString(),
      workedBy: [{ id: "ana", name: "Ana" }],
      reviewedBy: [{ id: "beto", name: "Beto" }],
      columnMs: { PENDIENTE: H, PROGRESO: 4 * H, REVISION: H, LISTO: 4 * H },
      completedAt: at(6).toISOString(),
      cycleMs: 5 * H,
      minutesWorked: 180,
      minutesReviewed: 45,
    });
    // Las horas se suman por tarea y tipo en la base, sin traer los registros de cada persona.
    expect(prisma.timeEntry.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ by: ["taskId", "kind"], where: { projectId: "p1", taskId: { not: null } } }),
    );

    // Sin filas de historial se asume que está en su columna desde que se creó.
    expect(untouched.difficulty).toBeNull();
    expect(untouched.history).toMatchObject({ columnMs: { PENDIENTE: 10 * H }, workedBy: [], minutesWorked: 0 });
  });
});

// ─── Renumeración ───
//
// Un almacén en memoria en lugar de mocks sueltos: respeta el @@unique([projectId, label])
// del schema, así que también detecta un orden de updates que choque consigo mismo.

interface StoredRow {
  id: string;
  projectId: string;
  label: string;
  featureId?: string | null;
}

function fakeTable(rowsInTable: StoredRow[], model: string) {
  const matches = (row: StoredRow, where: Record<string, unknown>) =>
    Object.entries(where).every(([key, value]) => row[key as keyof StoredRow] === value);
  return {
    findMany: async ({ where }: { where: Record<string, unknown> }) =>
      rowsInTable.filter((r) => matches(r, where)).map(({ id, label }) => ({ id, label })),
    deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
      const doomed = rowsInTable.filter((r) => matches(r, where));
      for (const row of doomed) rowsInTable.splice(rowsInTable.indexOf(row), 1);
      return { count: doomed.length };
    },
    update: async ({ where, data }: { where: { id: string }; data: { label: string } }) => {
      const row = rowsInTable.find((r) => r.id === where.id)!;
      if (rowsInTable.some((r) => r.id !== row.id && r.projectId === row.projectId && r.label === data.label)) {
        throw new Error(`Unique constraint failed on ${model} (projectId, label) = ${data.label}`);
      }
      row.label = data.label;
      return row;
    },
  };
}

function useStore(store: { features: StoredRow[]; tasks: StoredRow[] }) {
  const tx = { feature: fakeTable(store.features, "Feature"), task: fakeTable(store.tasks, "Task") };
  prisma.feature.findMany.mockImplementation(tx.feature.findMany);
  prisma.task.findMany.mockImplementation(tx.task.findMany);
  prisma.$transaction.mockImplementation((fn: (client: typeof tx) => unknown) => fn(tx));
  return () =>
    labelsToken(
      store.features.filter((r) => r.projectId === "p1"),
      store.tasks.filter((r) => r.projectId === "p1"),
    );
}

const labelsById = (rowsInTable: StoredRow[], projectId = "p1") =>
  Object.fromEntries(rowsInTable.filter((r) => r.projectId === projectId).map((r) => [r.id, r.label]));

describe("renumeración al borrar", () => {
  beforeEach(() => {
    resetPrisma();
    prisma.project.findUnique.mockResolvedValue(projectRow);
  });

  it("borrar una tarea corre las siguientes un lugar, sin chocar con el unique", async () => {
    const store = {
      features: [],
      // Desordenadas a propósito: la renumeración no puede depender del orden de findMany.
      tasks: [
        { id: "d", projectId: "p1", label: "T-04" },
        { id: "a", projectId: "p1", label: "T-01" },
        { id: "c", projectId: "p1", label: "T-03" },
        { id: "b", projectId: "p1", label: "T-02" },
        { id: "otro", projectId: "p2", label: "T-01" },
      ],
    };
    const token = useStore(store)();

    await expect(deleteTask("p1", "T-02", token)).resolves.not.toBeNull();

    expect(labelsById(store.tasks)).toEqual({ a: "T-01", c: "T-02", d: "T-03" });
    expect(labelsById(store.tasks, "p2")).toEqual({ otro: "T-01" });
  });

  it("ordena por número, no alfabéticamente, pasado T-99", async () => {
    const ids = Array.from({ length: 101 }, (_, i) => `t${i + 1}`);
    const store = { features: [], tasks: rows("T", ids).map((r) => ({ ...r, projectId: "p1" })).reverse() };
    const token = useStore(store)();

    await deleteTask("p1", "T-50", token);

    const labels = labelsById(store.tasks);
    expect(labels.t49).toBe("T-49");
    expect(labels.t51).toBe("T-50");
    expect(labels.t100).toBe("T-99");
    expect(labels.t101).toBe("T-100");
  });

  it("borrar una feature borra sus tareas y renumera features y tareas", async () => {
    const store = {
      features: [
        { id: "f1", projectId: "p1", label: "F-01" },
        { id: "f2", projectId: "p1", label: "F-02" },
        { id: "f3", projectId: "p1", label: "F-03" },
      ],
      tasks: [
        { id: "a", projectId: "p1", label: "T-01", featureId: "f1" },
        { id: "b", projectId: "p1", label: "T-02", featureId: "f2" },
        { id: "c", projectId: "p1", label: "T-03", featureId: "f3" },
        { id: "d", projectId: "p1", label: "T-04", featureId: null },
      ],
    };
    const token = useStore(store)();

    await deleteFeature("p1", "F-02", token);

    expect(labelsById(store.features)).toEqual({ f1: "F-01", f3: "F-02" });
    expect(labelsById(store.tasks)).toEqual({ a: "T-01", c: "T-02", d: "T-03" });
  });

  it("después de borrar, el token anterior ya no sirve", async () => {
    const store = {
      features: [],
      tasks: [
        { id: "a", projectId: "p1", label: "T-01" },
        { id: "b", projectId: "p1", label: "T-02" },
      ],
    };
    const token = useStore(store)();

    await deleteTask("p1", "T-01", token);

    await expect(deleteTask("p1", "T-01", token)).rejects.toMatchObject({ status: 412 });
    expect(labelsById(store.tasks)).toEqual({ b: "T-01" });
  });
});

describe("equipo del proyecto", () => {
  beforeEach(() => {
    resetPrisma();
    vi.mocked(requireCoordinacion).mockClear();
    prisma.project.findUnique.mockResolvedValue(projectRow);
    prisma.member.findUnique.mockResolvedValue({ isVerifiedByCoordinator: true });
    prisma.projectMember.findUnique.mockResolvedValue(null);
    prisma.$transaction.mockImplementation((fn: (client: typeof prisma) => unknown) => fn(prisma));
  });

  it("solo coordinación puede tocar el equipo", async () => {
    const forbidden = new AuthError(403, "FORBIDDEN_ROLE", "Esta acción requiere rol de coordinación");
    vi.mocked(requireCoordinacion).mockRejectedValueOnce(forbidden);
    await expect(addProjectMember("p1", { memberId: "m1" })).rejects.toBe(forbidden);

    vi.mocked(requireCoordinacion).mockRejectedValueOnce(forbidden);
    await expect(removeProjectMember("p1", "m1")).rejects.toBe(forbidden);

    expect(prisma.projectMember.create).not.toHaveBeenCalled();
    expect(prisma.projectMember.deleteMany).not.toHaveBeenCalled();
  });

  it("agrega a un miembro aprobado", async () => {
    const detail = await addProjectMember("p1", { memberId: "m1" });
    expect(prisma.projectMember.create).toHaveBeenCalledWith({ data: { projectId: "p1", memberId: "m1" } });
    expect(detail?.id).toBe("p1");
  });

  it("devuelve null si el proyecto no existe", async () => {
    prisma.project.findUnique.mockResolvedValue(null);
    await expect(addProjectMember("nope", { memberId: "m1" })).resolves.toBeNull();
    expect(prisma.projectMember.create).not.toHaveBeenCalled();
  });

  it("rechaza miembros inexistentes o pendientes de aprobación", async () => {
    prisma.member.findUnique.mockResolvedValue({ isVerifiedByCoordinator: false });
    await expect(addProjectMember("p1", { memberId: "m1" })).rejects.toMatchObject({
      status: 422,
      code: "INVALID_MEMBER",
    });
    prisma.member.findUnique.mockResolvedValue(null);
    await expect(addProjectMember("p1", { memberId: "fantasma" })).rejects.toMatchObject({ status: 422 });
    expect(prisma.projectMember.create).not.toHaveBeenCalled();
  });

  it("rechaza agregar dos veces a la misma persona", async () => {
    prisma.projectMember.findUnique.mockResolvedValue({ memberId: "m1" });
    await expect(addProjectMember("p1", { memberId: "m1" })).rejects.toMatchObject({
      status: 409,
      code: "ALREADY_PROJECT_MEMBER",
    });
    expect(prisma.projectMember.create).not.toHaveBeenCalled();
  });

  it("quitar a alguien lo desasigna solo de las tareas de ese proyecto", async () => {
    prisma.projectMember.deleteMany.mockResolvedValue({ count: 1 });
    await removeProjectMember("p1", "m1");
    expect(prisma.task.updateMany).toHaveBeenCalledWith({
      where: { projectId: "p1", assigneeId: "m1" },
      data: { assigneeId: null },
    });
  });

  it("quitar a alguien que no estaba no toca las tareas", async () => {
    prisma.projectMember.deleteMany.mockResolvedValue({ count: 0 });
    await expect(removeProjectMember("p1", "m1")).resolves.toBeNull();
    expect(prisma.task.updateMany).not.toHaveBeenCalled();
  });
});

describe("parseCreateDocCommentInput", () => {
  const valid = { quote: "un fragmento", occurrence: 1, body: "  Falta una fuente  " };

  it("acepta un comentario válido y recorta el cuerpo", () => {
    expect(parseCreateDocCommentInput(valid)).toEqual({ quote: "un fragmento", occurrence: 1, body: "Falta una fuente" });
  });

  it("conserva el fragmento tal cual, con sus espacios", () => {
    expect(parseCreateDocCommentInput({ ...valid, quote: "a  b" })?.quote).toBe("a  b");
  });

  it.each([
    ["sin cuerpo", { ...valid, body: "   " }],
    ["sin fragmento", { ...valid, quote: "  " }],
    ["fragmento demasiado largo", { ...valid, quote: "x".repeat(501) }],
    ["cuerpo demasiado largo", { ...valid, body: "x".repeat(2001) }],
    ["repetición negativa", { ...valid, occurrence: -1 }],
    ["repetición fraccionaria", { ...valid, occurrence: 0.5 }],
    ["repetición como texto", { ...valid, occurrence: "1" }],
    ["body que no es un objeto", "hola"],
    ["body nulo", null],
  ])("rechaza %s", (_name, body) => {
    expect(parseCreateDocCommentInput(body)).toBeNull();
  });
});

describe("comentarios de documentos", () => {
  beforeEach(resetPrisma);

  const documentRow = { id: "d1", filled: true, content: "", authorId: null, date: null };

  it("resolver borra la fila, acotada al documento del que se pidió", async () => {
    prisma.document.findUnique.mockResolvedValue(documentRow);
    prisma.docComment.deleteMany.mockResolvedValue({ count: 1 });
    await expect(resolveProjectDocComment("p1", "kickoff", "c1")).resolves.toBe(true);
    expect(prisma.docComment.deleteMany).toHaveBeenCalledWith({ where: { id: "c1", documentId: "d1" } });
  });

  it("resolver un comentario de otro documento (o ya resuelto) devuelve false", async () => {
    prisma.document.findUnique.mockResolvedValue(documentRow);
    prisma.docComment.deleteMany.mockResolvedValue({ count: 0 });
    await expect(resolveProjectDocComment("p1", "kickoff", "otro")).resolves.toBe(false);
  });

  it("sin documento ni acta no toca la base de comentarios", async () => {
    prisma.document.findUnique.mockResolvedValue(null);
    prisma.acta.findFirst.mockResolvedValue(null);
    await expect(resolveProjectDocComment("p1", "nada", "c1")).resolves.toBe(false);
    await expect(createProjectDocComment("p1", "nada", { quote: "a", occurrence: 0, body: "b" })).resolves.toBeNull();
    expect(prisma.docComment.deleteMany).not.toHaveBeenCalled();
    expect(prisma.docComment.create).not.toHaveBeenCalled();
  });

  it("en un acta, el comentario cuelga del acta", async () => {
    prisma.acta.findFirst.mockResolvedValue({ id: "a1", content: "", date: new Date() });
    prisma.docComment.create.mockResolvedValue({
      id: "c1", quote: "a", occurrence: 0, body: "b", createdAt: new Date(), author: { name: "Yo" },
    });
    await createProjectDocComment("p1", "a1", { quote: "a", occurrence: 0, body: "b" });
    expect(prisma.docComment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ actaId: "a1", authorId: "yo" }) }),
    );
  });
});
