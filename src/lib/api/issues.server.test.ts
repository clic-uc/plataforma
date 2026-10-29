import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthError, requireCoordinacion, requireMember } from "@/lib/auth/guards";
import { MAX_ISSUE_BODY_LENGTH, MAX_ISSUE_COMMENT_LENGTH, MAX_ISSUE_TITLE_LENGTH } from "@/lib/api/issues";
import {
  createIssue,
  createIssueComment,
  deleteIssue,
  getProjectIssues,
  ownActivity,
  parseIssueCommentInput,
  parseIssueInput,
  parseIssueNumber,
  parseIssueStatusInput,
  setIssueReviewed,
  setIssueStatus,
  updateIssue,
  updateIssueComment,
} from "@/lib/api/issues.server";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    project: { findUnique: vi.fn() },
    issue: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    issueComment: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    issueReview: { upsert: vi.fn(), deleteMany: vi.fn() },
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

/** Fila que loadDetail sabe mapear. */
function detailRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "i1",
    projectId: "p1",
    number: 3,
    title: "Login falla",
    body: "",
    type: "BUG",
    status: "ABIERTO",
    closeReason: null,
    authorId: "autor",
    closedById: null,
    closedAt: null,
    createdAt: new Date("2026-10-01T12:00:00Z"),
    lastActivityAt: new Date("2026-10-01T12:00:00Z"),
    author: { name: "Ana" },
    closedBy: null,
    _count: { comments: 0 },
    comments: [],
    reviews: [],
    ...overrides,
  };
}

/**
 * findUnique se usa dos veces: con `select` para validar y con `include` para devolver
 * el detalle. El segundo siempre devuelve detailRow.
 */
function mockIssue(row: { id: string; authorId: string | null } | null) {
  prisma.issue.findUnique.mockImplementation(async (args: { include?: unknown }) =>
    args.include ? detailRow(row ?? {}) : row,
  );
}

/** Lo que ownActivity escribe para "yo" en el issue `issueId`, con el instante de lastActivityAt. */
function expectOwnActivity(data: Record<string, unknown>, issueId: string) {
  const at = data.lastActivityAt;
  expect(at).toBeInstanceOf(Date);
  expect(data.reviews).toEqual({
    upsert: {
      where: { issueId_memberId: { issueId, memberId: "yo" } },
      create: { memberId: "yo", reviewedAt: at },
      update: { reviewedAt: at },
    },
  });
}

const uniqueViolation = () => Object.assign(new Error("Unique constraint failed"), { code: "P2002" });

beforeEach(() => {
  resetPrisma();
  vi.mocked(requireMember).mockClear();
  vi.mocked(requireCoordinacion).mockClear();
});

describe("parseIssueNumber", () => {
  it("acepta enteros positivos", () => {
    expect(parseIssueNumber("12")).toBe(12);
  });

  it.each(["0", "-1", "1.5", "abc", ""])("rechaza %j", (value) => {
    expect(parseIssueNumber(value)).toBeNull();
  });
});

describe("parseIssueInput", () => {
  const valid = { title: "  Login falla ", body: "  Pasos…  ", type: "BUG" };

  it("recorta título y cuerpo", () => {
    expect(parseIssueInput(valid)).toEqual({ title: "Login falla", body: "Pasos…", type: "BUG" });
  });

  it("permite el cuerpo vacío o ausente", () => {
    expect(parseIssueInput({ title: "X", type: "IDEA" })).toEqual({ title: "X", body: "", type: "IDEA" });
  });

  it("rechaza título vacío o demasiado largo", () => {
    expect(parseIssueInput({ ...valid, title: "   " })).toBeNull();
    expect(parseIssueInput({ ...valid, title: "x".repeat(MAX_ISSUE_TITLE_LENGTH + 1) })).toBeNull();
  });

  it("rechaza cuerpo demasiado largo", () => {
    expect(parseIssueInput({ ...valid, body: "x".repeat(MAX_ISSUE_BODY_LENGTH + 1) })).toBeNull();
  });

  it("rechaza tipo inválido", () => {
    expect(parseIssueInput({ ...valid, type: "TAREA" })).toBeNull();
    expect(parseIssueInput({ ...valid, type: undefined })).toBeNull();
  });

  it("rechaza lo que no es objeto", () => {
    expect(parseIssueInput(null)).toBeNull();
    expect(parseIssueInput("x")).toBeNull();
  });
});

describe("parseIssueStatusInput", () => {
  it("cerrar exige un motivo válido", () => {
    expect(parseIssueStatusInput({ status: "CERRADO", closeReason: "RESUELTO" })).toEqual({
      status: "CERRADO",
      closeReason: "RESUELTO",
    });
    expect(parseIssueStatusInput({ status: "CERRADO" })).toBeNull();
    expect(parseIssueStatusInput({ status: "CERRADO", closeReason: "OLVIDADO" })).toBeNull();
  });

  it("reabrir ignora el motivo", () => {
    expect(parseIssueStatusInput({ status: "ABIERTO", closeReason: "RESUELTO" })).toEqual({ status: "ABIERTO" });
  });

  it("rechaza cualquier otro estado", () => {
    expect(parseIssueStatusInput({ status: "EN_PROGRESO" })).toBeNull();
    expect(parseIssueStatusInput({})).toBeNull();
    expect(parseIssueStatusInput(null)).toBeNull();
  });
});

describe("parseIssueCommentInput", () => {
  it("recorta el texto", () => {
    expect(parseIssueCommentInput({ body: "  hola  " })).toEqual({ body: "hola" });
  });

  it("rechaza vacío y demasiado largo", () => {
    expect(parseIssueCommentInput({ body: "   " })).toBeNull();
    expect(parseIssueCommentInput({})).toBeNull();
    expect(parseIssueCommentInput({ body: "x".repeat(MAX_ISSUE_COMMENT_LENGTH + 1) })).toBeNull();
  });
});

describe("createIssue", () => {
  const input = { title: "Login falla", body: "", type: "BUG" as const };

  beforeEach(() => {
    prisma.project.findUnique.mockResolvedValue({ id: "p1" });
    prisma.issue.findUnique.mockImplementation(async () => detailRow());
  });

  it("usa el máximo + 1", async () => {
    prisma.issue.findFirst.mockResolvedValue({ number: 7 });
    prisma.issue.create.mockResolvedValue({});

    await createIssue("p1", input);

    expect(prisma.issue.create.mock.calls[0][0].data).toMatchObject({ projectId: "p1", number: 8, authorId: "yo" });
  });

  it("nace revisado por quien lo abre, con el mismo instante que su actividad", async () => {
    prisma.issue.findFirst.mockResolvedValue(null);
    prisma.issue.create.mockResolvedValue({});

    await createIssue("p1", input);

    const { data } = prisma.issue.create.mock.calls[0][0];
    expect(data.lastActivityAt).toBeInstanceOf(Date);
    expect(data.createdAt).toBe(data.lastActivityAt);
    expect(data.reviews).toEqual({ create: { memberId: "yo", reviewedAt: data.lastActivityAt } });
  });

  it("empieza en 1 si el proyecto no tiene issues", async () => {
    prisma.issue.findFirst.mockResolvedValue(null);
    prisma.issue.create.mockResolvedValue({});

    await createIssue("p1", input);

    expect(prisma.issue.create.mock.calls[0][0].data.number).toBe(1);
  });

  it("reintenta con el máximo releído si otro tomó el número", async () => {
    prisma.issue.findFirst.mockResolvedValueOnce({ number: 7 }).mockResolvedValueOnce({ number: 8 });
    prisma.issue.create.mockRejectedValueOnce(uniqueViolation()).mockResolvedValueOnce({});

    const issue = await createIssue("p1", input);

    expect(prisma.issue.create).toHaveBeenCalledTimes(2);
    expect(prisma.issue.create.mock.calls[1][0].data.number).toBe(9);
    expect(prisma.issue.findUnique.mock.calls[0][0].where).toEqual({ projectId_number: { projectId: "p1", number: 9 } });
    expect(issue).not.toBeNull();
  });

  it("relanza errores que no son de unicidad sin reintentar", async () => {
    prisma.issue.findFirst.mockResolvedValue({ number: 1 });
    prisma.issue.create.mockRejectedValue(new Error("conexión"));

    await expect(createIssue("p1", input)).rejects.toThrow("conexión");
    expect(prisma.issue.create).toHaveBeenCalledTimes(1);
  });

  it("se rinde después de 3 intentos", async () => {
    prisma.issue.findFirst.mockResolvedValue({ number: 1 });
    prisma.issue.create.mockRejectedValue(uniqueViolation());

    await expect(createIssue("p1", input)).rejects.toMatchObject({ code: "P2002" });
    expect(prisma.issue.create).toHaveBeenCalledTimes(3);
  });

  it("devuelve null si el proyecto no existe", async () => {
    prisma.project.findUnique.mockResolvedValue(null);

    expect(await createIssue("nope", input)).toBeNull();
    expect(prisma.issue.create).not.toHaveBeenCalled();
  });
});

describe("updateIssue", () => {
  const input = { title: "Nuevo", body: "b", type: "IDEA" as const };

  it("rechaza con 403 a un miembro que no es el autor", async () => {
    mockIssue({ id: "i1", authorId: "otra" });

    await expect(updateIssue("p1", 3, input)).rejects.toMatchObject({ status: 403, code: "FORBIDDEN_ROLE" });
    expect(prisma.issue.update).not.toHaveBeenCalled();
  });

  it("rechaza si el autor ya no existe y no es coordinación", async () => {
    mockIssue({ id: "i1", authorId: null });

    await expect(updateIssue("p1", 3, input)).rejects.toBeInstanceOf(AuthError);
  });

  it("deja editar al autor", async () => {
    mockIssue({ id: "i1", authorId: "yo" });
    prisma.issue.update.mockResolvedValue({});

    const issue = await updateIssue("p1", 3, input);

    expect(prisma.issue.update.mock.calls[0][0]).toMatchObject({
      where: { id: "i1" },
      data: { title: "Nuevo", body: "b", type: "IDEA" },
    });
    expectOwnActivity(prisma.issue.update.mock.calls[0][0].data, "i1");
    expect(issue?.canEdit).toBe(true);
  });

  it("deja editar a coordinación aunque no sea el autor", async () => {
    vi.mocked(requireMember).mockResolvedValueOnce({ id: "coord", role: "COORDINACION" } as never);
    mockIssue({ id: "i1", authorId: "otra" });
    prisma.issue.update.mockResolvedValue({});

    await updateIssue("p1", 3, input);

    expect(prisma.issue.update).toHaveBeenCalled();
  });

  it("devuelve null si el issue no existe", async () => {
    mockIssue(null);

    expect(await updateIssue("p1", 99, input)).toBeNull();
    expect(prisma.issue.update).not.toHaveBeenCalled();
  });
});

describe("setIssueStatus", () => {
  beforeEach(() => {
    mockIssue({ id: "i1", authorId: "otra" });
    prisma.issue.update.mockResolvedValue({});
  });

  it("cerrar registra motivo, fecha y quién lo cerró", async () => {
    await setIssueStatus("p1", 3, { status: "CERRADO", closeReason: "DUPLICADO" });

    const { where, data } = prisma.issue.update.mock.calls[0][0];
    expect(where).toEqual({ id: "i1" });
    expect(data).toMatchObject({ status: "CERRADO", closeReason: "DUPLICADO", closedById: "yo" });
    expect(data.closedAt).toBeInstanceOf(Date);
    expect(data.lastActivityAt).toBe(data.closedAt);
    expectOwnActivity(data, "i1");
  });

  it("reabrir limpia el cierre y deja revisado a quien reabre", async () => {
    await setIssueStatus("p1", 3, { status: "ABIERTO" });

    const { data } = prisma.issue.update.mock.calls[0][0];
    expect(data).toMatchObject({ status: "ABIERTO", closeReason: null, closedAt: null, closedById: null });
    expectOwnActivity(data, "i1");
  });

  it("devuelve null si el issue no existe", async () => {
    mockIssue(null);

    expect(await setIssueStatus("p1", 99, { status: "ABIERTO" })).toBeNull();
    expect(prisma.issue.update).not.toHaveBeenCalled();
  });
});

describe("createIssueComment", () => {
  it("crea el comentario y actualiza la actividad en la misma transacción", async () => {
    mockIssue({ id: "i1", authorId: "otra" });
    prisma.issueComment.create.mockReturnValue("create-op");
    prisma.issue.update.mockReturnValue("update-op");
    prisma.$transaction.mockResolvedValue([]);

    await createIssueComment("p1", 3, "hola");

    expect(prisma.$transaction).toHaveBeenCalledWith(["create-op", "update-op"]);
    const created = prisma.issueComment.create.mock.calls[0][0].data;
    const updated = prisma.issue.update.mock.calls[0][0];
    expect(created).toMatchObject({ issueId: "i1", authorId: "yo", body: "hola" });
    expect(updated).toMatchObject({ where: { id: "i1" } });
    expect(updated.data.lastActivityAt).toBe(created.createdAt);
    expectOwnActivity(updated.data, "i1");
  });

  it("devuelve null si el issue no existe", async () => {
    mockIssue(null);

    expect(await createIssueComment("p1", 99, "hola")).toBeNull();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("updateIssueComment", () => {
  beforeEach(() => {
    prisma.issue.findUnique.mockImplementation(async () => detailRow());
  });

  it("rechaza con 403 el comentario de otra persona, aunque sea coordinación", async () => {
    vi.mocked(requireMember).mockResolvedValueOnce({ id: "coord", role: "COORDINACION" } as never);
    prisma.issueComment.findFirst.mockResolvedValue({ authorId: "otra", body: "x" });

    await expect(updateIssueComment("p1", 3, "c1", "y")).rejects.toMatchObject({ status: 403, code: "FORBIDDEN_ROLE" });
    expect(prisma.issueComment.update).not.toHaveBeenCalled();
  });

  it("marca editado al cambiar el texto", async () => {
    prisma.issueComment.findFirst.mockResolvedValue({ authorId: "yo", body: "x" });

    await updateIssueComment("p1", 3, "c1", "y");

    const { where, data } = prisma.issueComment.update.mock.calls[0][0];
    expect(where).toEqual({ id: "c1" });
    expect(data.body).toBe("y");
    expect(data.editedAt).toBeInstanceOf(Date);
  });

  it("editar un comentario no es actividad: no toca el issue ni las revisiones", async () => {
    prisma.issueComment.findFirst.mockResolvedValue({ authorId: "yo", body: "x" });

    await updateIssueComment("p1", 3, "c1", "y");

    expect(prisma.issue.update).not.toHaveBeenCalled();
    expect(prisma.issueReview.upsert).not.toHaveBeenCalled();
  });

  it("guardar el mismo texto no lo marca como editado", async () => {
    prisma.issueComment.findFirst.mockResolvedValue({ authorId: "yo", body: "x" });

    const issue = await updateIssueComment("p1", 3, "c1", "x");

    expect(prisma.issueComment.update).not.toHaveBeenCalled();
    expect(issue).not.toBeNull();
  });

  it("devuelve null si el comentario es de otro issue", async () => {
    prisma.issueComment.findFirst.mockResolvedValue(null);

    expect(await updateIssueComment("p1", 3, "c-de-otro", "y")).toBeNull();
    expect(prisma.issueComment.findFirst.mock.calls[0][0].where).toEqual({
      id: "c-de-otro",
      issue: { projectId: "p1", number: 3 },
    });
  });
});

describe("deleteIssue", () => {
  it("exige coordinación", async () => {
    vi.mocked(requireCoordinacion).mockRejectedValueOnce(new AuthError(403, "FORBIDDEN_ROLE", "Solo coordinación"));

    await expect(deleteIssue("p1", 3)).rejects.toMatchObject({ status: 403 });
    expect(prisma.issue.deleteMany).not.toHaveBeenCalled();
  });

  it("devuelve si borró algo", async () => {
    prisma.issue.deleteMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

    expect(await deleteIssue("p1", 3)).toBe(true);
    expect(await deleteIssue("p1", 3)).toBe(false);
    expect(prisma.issue.deleteMany).toHaveBeenCalledWith({ where: { projectId: "p1", number: 3 } });
  });
});

describe("ownActivity", () => {
  it("mueve la actividad y deja la revisión de quien la hace en el mismo instante", () => {
    const at = new Date("2026-10-29T12:00:00Z");
    expect(ownActivity("i1", "yo", at)).toEqual({
      lastActivityAt: at,
      reviews: {
        upsert: {
          where: { issueId_memberId: { issueId: "i1", memberId: "yo" } },
          create: { memberId: "yo", reviewedAt: at },
          update: { reviewedAt: at },
        },
      },
    });
  });
});

describe("reviewedByMe", () => {
  const activity = new Date("2026-10-20T12:00:00Z");

  it("lee solo mi revisión y la compara con la última actividad", async () => {
    prisma.project.findUnique.mockResolvedValue({ id: "p1" });
    prisma.issue.findMany.mockResolvedValue([
      detailRow({ number: 1, lastActivityAt: activity, reviews: [{ reviewedAt: activity }] }),
      detailRow({ number: 2, lastActivityAt: activity, reviews: [{ reviewedAt: new Date("2026-10-19T12:00:00Z") }] }),
      detailRow({ number: 3, lastActivityAt: activity, reviews: [] }),
    ]);

    const issues = await getProjectIssues("p1");

    expect(issues?.map((i) => [i.number, i.reviewedByMe])).toEqual([
      [1, true],
      [2, false],
      [3, false],
    ]);
    expect(prisma.issue.findMany.mock.calls[0][0].include.reviews).toEqual({
      where: { memberId: "yo" },
      select: { reviewedAt: true },
    });
  });
});

describe("setIssueReviewed", () => {
  /** findUnique con select (validar) devuelve `row`; con include (detalle), detailRow(detail). */
  function mockReviewTarget(row: { id: string; lastActivityAt: Date } | null, detail: Record<string, unknown> = {}) {
    prisma.issue.findUnique.mockImplementation(async (args: { include?: unknown }) =>
      args.include ? detailRow(detail) : row,
    );
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it("marcar crea o renueva mi revisión con la hora actual", async () => {
    const now = new Date("2026-10-29T12:00:00Z");
    vi.useFakeTimers({ now });
    mockReviewTarget({ id: "i1", lastActivityAt: new Date("2026-10-01T12:00:00Z") }, { reviews: [{ reviewedAt: now }] });

    const issue = await setIssueReviewed("p1", 3, true);

    expect(prisma.issueReview.upsert).toHaveBeenCalledWith({
      where: { issueId_memberId: { issueId: "i1", memberId: "yo" } },
      create: { issueId: "i1", memberId: "yo", reviewedAt: now },
      update: { reviewedAt: now },
    });
    expect(issue?.reviewedByMe).toBe(true);
  });

  it("si la actividad quedó adelante del reloj, marca con la actividad", async () => {
    const future = new Date(Date.now() + 60_000);
    mockReviewTarget({ id: "i1", lastActivityAt: future });

    await setIssueReviewed("p1", 3, true);

    expect(prisma.issueReview.upsert.mock.calls[0][0].update.reviewedAt).toEqual(future);
  });

  it("desmarcar borra solo mi revisión", async () => {
    mockReviewTarget({ id: "i1", lastActivityAt: new Date() });

    const issue = await setIssueReviewed("p1", 3, false);

    expect(prisma.issueReview.deleteMany).toHaveBeenCalledWith({ where: { issueId: "i1", memberId: "yo" } });
    expect(prisma.issueReview.upsert).not.toHaveBeenCalled();
    expect(issue?.reviewedByMe).toBe(false);
  });

  it("devuelve null si el issue no existe, sin tocar revisiones", async () => {
    mockReviewTarget(null);

    expect(await setIssueReviewed("p1", 99, true)).toBeNull();
    expect(prisma.issueReview.upsert).not.toHaveBeenCalled();
    expect(prisma.issueReview.deleteMany).not.toHaveBeenCalled();
  });
});
