import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatLabel, labelsToken, type LabelledRow } from "@/lib/api/labels";
import { AuthError, requireCoordinacion } from "@/lib/auth/guards";
import {
  addProjectMember,
  deleteFeature,
  deleteTask,
  parseAddProjectMemberInput,
  parseCreateTaskInput,
  parseUpdateProjectMemberInput,
  parseUpdateTaskInput,
  removeProjectMember,
  updateProjectMemberRole,
  updateTask,
} from "@/lib/api/projects.server";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    project: { findUnique: vi.fn() },
    member: { findUnique: vi.fn() },
    feature: { findMany: vi.fn() },
    task: { findMany: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
    projectMember: { findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
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
}

/** Fila mínima que getProject sabe mapear; las pruebas que no miran el detalle la dejan vacía. */
const projectRow = {
  id: "p1",
  name: "Plataforma",
  client: "CLIC",
  area: "Web",
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

const validTask = { featureId: null, assigneeId: null, name: "Login", type: "FEATURE", column: "PENDIENTE" };

describe("parseCreateTaskInput / parseUpdateTaskInput", () => {
  it("acepta un body válido y normaliza strings vacíos a null", () => {
    expect(parseCreateTaskInput({ ...validTask, featureId: " ", name: "  Login " })).toEqual({
      featureId: null,
      assigneeId: null,
      name: "Login",
      type: "FEATURE",
      column: "PENDIENTE",
    });
  });

  it("exige assigneeId explícito, aunque sea null", () => {
    const withoutAssignee: Record<string, unknown> = { ...validTask };
    delete withoutAssignee.assigneeId;
    expect(parseCreateTaskInput(withoutAssignee)).toBeNull();
    expect(parseCreateTaskInput({ ...validTask, assigneeId: 42 })).toBeNull();
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
});

describe("parseAddProjectMemberInput / parseUpdateProjectMemberInput", () => {
  it("exige miembro y un rol de hasta 60 caracteres", () => {
    expect(parseAddProjectMemberInput({ memberId: "m1", role: " Desarrollo " })).toEqual({ memberId: "m1", role: "Desarrollo" });
    expect(parseAddProjectMemberInput({ memberId: "m1", role: "" })).toBeNull();
    expect(parseAddProjectMemberInput({ memberId: "m1", role: "x".repeat(61) })).toBeNull();
    expect(parseAddProjectMemberInput({ role: "Desarrollo" })).toBeNull();
  });

  it("valida el rol en el PATCH igual que en el alta", () => {
    expect(parseUpdateProjectMemberInput({ role: " Líder técnico " })).toEqual({ role: "Líder técnico" });
    expect(parseUpdateProjectMemberInput({ role: "   " })).toBeNull();
    expect(parseUpdateProjectMemberInput({})).toBeNull();
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
    prisma.task.findUnique.mockResolvedValue({ assigneeId: null });
    prisma.task.updateMany.mockResolvedValue({ count: 1 });
    prisma.project.findUnique.mockResolvedValue(null);
  });

  it("responde 428 si falta If-Match", async () => {
    await expect(updateTask("p1", "T-02", input, null)).rejects.toMatchObject({ status: 428 });
    expect(prisma.task.updateMany).not.toHaveBeenCalled();
  });

  it("responde 412 si los labels se renumeraron después del snapshot", async () => {
    prisma.task.findMany.mockResolvedValue(after);
    await expect(updateTask("p1", "T-02", input, snapshotToken)).rejects.toMatchObject({
      status: 412,
      code: "LABELS_CHANGED",
    });
    await expect(deleteTask("p1", "T-02", snapshotToken)).rejects.toMatchObject({ status: 412 });
    expect(prisma.task.updateMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("con el token vigente escribe por id, no por label", async () => {
    await updateTask("p1", "T-02", input, snapshotToken);
    expect(prisma.task.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "tb" }, data: expect.objectContaining({ name: "Renombrada" }) }),
    );
  });

  it("solo permite asignar a miembros del equipo", async () => {
    prisma.projectMember.findUnique.mockResolvedValue(null);
    await expect(updateTask("p1", "T-02", { ...input, assigneeId: "ajeno" }, snapshotToken)).rejects.toMatchObject({
      status: 422,
      code: "NOT_PROJECT_MEMBER",
    });
    expect(prisma.task.updateMany).not.toHaveBeenCalled();
  });

  it("no revalida una asignación que no cambió", async () => {
    prisma.task.findUnique.mockResolvedValue({ assigneeId: "antiguo" });
    await updateTask("p1", "T-02", { ...input, assigneeId: "antiguo" }, snapshotToken);
    expect(prisma.projectMember.findUnique).not.toHaveBeenCalled();
    expect(prisma.task.updateMany).toHaveBeenCalled();
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
    await expect(addProjectMember("p1", { memberId: "m1", role: "Dev" })).rejects.toBe(forbidden);

    vi.mocked(requireCoordinacion).mockRejectedValueOnce(forbidden);
    await expect(removeProjectMember("p1", "m1")).rejects.toBe(forbidden);

    vi.mocked(requireCoordinacion).mockRejectedValueOnce(forbidden);
    await expect(updateProjectMemberRole("p1", "m1", "Dev")).rejects.toBe(forbidden);

    expect(prisma.projectMember.create).not.toHaveBeenCalled();
    expect(prisma.projectMember.deleteMany).not.toHaveBeenCalled();
    expect(prisma.projectMember.updateMany).not.toHaveBeenCalled();
  });

  it("agrega a un miembro aprobado con su rol", async () => {
    const detail = await addProjectMember("p1", { memberId: "m1", role: "Dev" });
    expect(prisma.projectMember.create).toHaveBeenCalledWith({ data: { projectId: "p1", memberId: "m1", role: "Dev" } });
    expect(detail?.id).toBe("p1");
  });

  it("devuelve null si el proyecto no existe", async () => {
    prisma.project.findUnique.mockResolvedValue(null);
    await expect(addProjectMember("nope", { memberId: "m1", role: "Dev" })).resolves.toBeNull();
    expect(prisma.projectMember.create).not.toHaveBeenCalled();
  });

  it("rechaza miembros inexistentes o pendientes de aprobación", async () => {
    prisma.member.findUnique.mockResolvedValue({ isVerifiedByCoordinator: false });
    await expect(addProjectMember("p1", { memberId: "m1", role: "Dev" })).rejects.toMatchObject({
      status: 422,
      code: "INVALID_MEMBER",
    });
    prisma.member.findUnique.mockResolvedValue(null);
    await expect(addProjectMember("p1", { memberId: "fantasma", role: "Dev" })).rejects.toMatchObject({ status: 422 });
    expect(prisma.projectMember.create).not.toHaveBeenCalled();
  });

  it("rechaza agregar dos veces a la misma persona", async () => {
    prisma.projectMember.findUnique.mockResolvedValue({ memberId: "m1" });
    await expect(addProjectMember("p1", { memberId: "m1", role: "Dev" })).rejects.toMatchObject({
      status: 409,
      code: "ALREADY_PROJECT_MEMBER",
    });
    expect(prisma.projectMember.create).not.toHaveBeenCalled();
  });

  it("cambiar el rol de alguien fuera del equipo devuelve null", async () => {
    prisma.projectMember.updateMany.mockResolvedValue({ count: 0 });
    await expect(updateProjectMemberRole("p1", "m1", "Dev")).resolves.toBeNull();
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
