import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CallToolResult, McpServer } from "@modelcontextprotocol/server";
import { ApiError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/guards";
import type { ProjectDetail, ProjectFeature, ProjectTask } from "@/lib/api/projects";
import { registerTools } from "@/lib/mcp/server";

const { projects, issues, events, tiempo } = vi.hoisted(() => ({
  projects: {
    getProject: vi.fn(),
    getAssignedTasks: vi.fn(),
    getProjectDoc: vi.fn(),
    updateProjectDoc: vi.fn(),
    createProjectDoc: vi.fn(),
    createActa: vi.fn(),
    getProjectDocComments: vi.fn(),
    resolveProjectDocComment: vi.fn(),
    updateTask: vi.fn(),
    createTask: vi.fn(),
    createFeature: vi.fn(),
    updateFeature: vi.fn(),
    setIssueLink: vi.fn(),
  },
  issues: {
    getIssue: vi.fn(),
    createIssue: vi.fn(),
    getProjectIssues: vi.fn(),
    updateIssue: vi.fn(),
    setIssueStatus: vi.fn(),
    setIssuePriority: vi.fn(),
    setIssueReviewed: vi.fn(),
  },
  events: { createEvent: vi.fn(), getEvent: vi.fn(), updateEvent: vi.fn() },
  tiempo: { createTimeEntry: vi.fn(), updateTimeEntry: vi.fn(), getTimeEntryLink: vi.fn(), resolveTaskLabel: vi.fn() },
}));

// Las funciones .server.ts se mockean; los parse* son los reales, para que las
// tools validen exactamente como la API.
vi.mock("@/lib/api/projects.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/projects.server")>()),
  ...projects,
}));
vi.mock("@/lib/api/issues.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/issues.server")>()),
  ...issues,
}));
vi.mock("@/lib/api/events.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/events.server")>()),
  ...events,
}));
vi.mock("@/lib/api/tiempo.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/tiempo.server")>()),
  ...tiempo,
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/auth", () => ({ auth: {} }));

type ToolCallback = (args: Record<string, unknown>) => Promise<CallToolResult>;

const tools = new Map<string, ToolCallback>();
registerTools({
  registerTool: (name: string, _config: unknown, cb: ToolCallback) => tools.set(name, cb),
} as unknown as McpServer);

/** Llama a la tool como lo haría el SDK, sin la validación de zod: los args van completos. */
function call(name: string, args: Record<string, unknown>) {
  return tools.get(name)!(args);
}

function text(result: CallToolResult): string {
  const block = result.content[0];
  return block.type === "text" ? block.text : "";
}

function task(overrides: Partial<ProjectTask> = {}): ProjectTask {
  return {
    id: "T-01",
    featureId: "F-01",
    name: "Login",
    type: "feature",
    typeValue: "FEATURE",
    done: false,
    assignee: { id: "m1", name: "Ana", initials: "A" },
    column: "pendiente",
    columnValue: "PENDIENTE",
    active: true,
    description: "Con GitHub",
    issues: [],
    difficulty: null,
    history: {
      createdAt: "2026-10-01T12:00:00.000Z",
      workedBy: [],
      reviewedBy: [],
      columnMs: {},
      completedAt: null,
      cycleMs: null,
      minutesWorked: 0,
      minutesReviewed: 0,
    },
    ...overrides,
  };
}

function project(tasks: ProjectTask[], features: ProjectFeature[] = []): ProjectDetail {
  return { id: "p1", labelsToken: "tok", tasks, features } as ProjectDetail;
}

beforeEach(() => {
  vi.clearAllMocks();
});

function feature(overrides: Partial<ProjectFeature> = {}): ProjectFeature {
  return {
    id: "F-01",
    name: "Acceso",
    priority: "alta",
    priorityValue: "ALTA",
    status: "Pendiente",
    statusColor: "gray",
    statusValue: "PENDIENTE",
    description: "Texto largo de la feature",
    taskCount: 1,
    issues: [],
    ...overrides,
  };
}

function fullProject(tasks: ProjectTask[], features: ProjectFeature[] = []): ProjectDetail {
  return { ...project(tasks, features), team: [], docs: [], actas: [] };
}

describe("get_project", () => {
  const done = task({ id: "T-02", columnValue: "LISTO", name: "Hecha" });
  const open = task({ id: "T-01", description: "Descripción larga de la tarea" });

  it("es un índice: sin descripciones ni historial", async () => {
    projects.getProject.mockResolvedValue(fullProject([open], [feature()]));

    const raw = text(await call("get_project", { projectId: "p1" }));
    const result = JSON.parse(raw);

    expect(raw).not.toContain("Descripción larga");
    expect(raw).not.toContain("Texto largo");
    expect(result.tasks[0]).toEqual({
      id: "T-01",
      featureId: "F-01",
      name: "Login",
      type: "FEATURE",
      column: "PENDIENTE",
      active: true,
      assignee: { id: "m1", name: "Ana" },
      difficulty: null,
      issues: [],
    });
    expect(result.features[0]).not.toHaveProperty("description");
    expect(result.labelsToken).toBe("tok");
  });

  it("omite las tareas en LISTO salvo includeDone, y taskCounts dice cuántas hay", async () => {
    projects.getProject.mockResolvedValue(fullProject([open, done]));

    const hidden = JSON.parse(text(await call("get_project", { projectId: "p1" })));
    expect(hidden.tasks.map((t: { id: string }) => t.id)).toEqual(["T-01"]);
    expect(hidden.taskCounts).toEqual({ total: 2, shown: 1 });

    const all = JSON.parse(text(await call("get_project", { projectId: "p1", includeDone: true })));
    expect(all.tasks.map((t: { id: string }) => t.id)).toEqual(["T-01", "T-02"]);
    expect(all.taskCounts).toEqual({ total: 2, shown: 2 });
  });

  it("una column explícita manda sobre includeDone, y los filtros se combinan", async () => {
    const other = task({ id: "T-03", featureId: null, assignee: { id: "m2", name: "Beto", initials: "B" } });
    projects.getProject.mockResolvedValue(fullProject([open, done, other]));

    const ids = async (args: Record<string, unknown>) =>
      JSON.parse(text(await call("get_project", { projectId: "p1", ...args }))).tasks.map((t: { id: string }) => t.id);

    expect(await ids({ column: "LISTO" })).toEqual(["T-02"]);
    expect(await ids({ assigneeId: "m2" })).toEqual(["T-03"]);
    expect(await ids({ featureId: "F-01" })).toEqual(["T-01"]);
    expect(await ids({ featureId: "F-01", assigneeId: "m2" })).toEqual([]);
  });

  it("el labelsToken no depende de los filtros", async () => {
    projects.getProject.mockResolvedValue(fullProject([open, done]));
    const result = JSON.parse(text(await call("get_project", { projectId: "p1", assigneeId: "nadie" })));
    expect(result.tasks).toEqual([]);
    expect(result.labelsToken).toBe("tok");
  });

  it("responde error si el proyecto no existe", async () => {
    projects.getProject.mockResolvedValue(null);
    expect((await call("get_project", { projectId: "x" })).isError).toBe(true);
  });
});

describe("get_task", () => {
  it("trae la descripción, dificultad, quién trabajó y revisó, las horas y el labelsToken", async () => {
    projects.getProject.mockResolvedValue(
      fullProject([
        task({
          difficulty: "MEDIA",
          history: {
            createdAt: "",
            workedBy: [{ id: "m1", name: "Ana" }],
            reviewedBy: [{ id: "m2", name: "Beto" }],
            columnMs: {},
            completedAt: null,
            cycleMs: null,
            minutesWorked: 120,
            minutesReviewed: 30,
          },
        }),
      ]),
    );

    const result = JSON.parse(text(await call("get_task", { projectId: "p1", taskId: "T-01" })));

    expect(result).toMatchObject({
      id: "T-01",
      description: "Con GitHub",
      difficulty: "MEDIA",
      workedBy: ["Ana"],
      reviewedBy: ["Beto"],
      minutesWorked: 120,
      minutesReviewed: 30,
      labelsToken: "tok",
    });
  });

  it("responde error si la tarea o el proyecto no existen", async () => {
    projects.getProject.mockResolvedValue(fullProject([task()]));
    expect((await call("get_task", { projectId: "p1", taskId: "T-09" })).isError).toBe(true);

    projects.getProject.mockResolvedValue(null);
    expect((await call("get_task", { projectId: "x", taskId: "T-01" })).isError).toBe(true);
  });
});

describe("get_feature", () => {
  it("trae la descripción, sus tareas (sin descripción) y el labelsToken", async () => {
    projects.getProject.mockResolvedValue(
      fullProject([task(), task({ id: "T-02", featureId: "F-02" })], [feature(), feature({ id: "F-02", name: "Otra" })]),
    );

    const raw = text(await call("get_feature", { projectId: "p1", featureId: "F-01" }));
    const result = JSON.parse(raw);

    expect(result).toMatchObject({ id: "F-01", description: "Texto largo de la feature", labelsToken: "tok" });
    expect(result.tasks.map((t: { id: string }) => t.id)).toEqual(["T-01"]);
    expect(raw).not.toContain("Con GitHub");
  });

  it("responde error si la feature no existe", async () => {
    projects.getProject.mockResolvedValue(fullProject([task()], [feature()]));
    expect((await call("get_feature", { projectId: "p1", featureId: "F-09" })).isError).toBe(true);
  });
});

describe("list_my_tasks", () => {
  it("no trae la descripción: eso es de get_task", async () => {
    projects.getAssignedTasks.mockResolvedValue([{ ...task(), project: { id: "p1", name: "Proyecto" } }]);

    const raw = text(await call("list_my_tasks", { includeDone: false }));

    expect(projects.getAssignedTasks).toHaveBeenCalledWith(false);
    expect(JSON.parse(raw)[0]).toMatchObject({ project: { id: "p1", name: "Proyecto" }, id: "T-01", name: "Login" });
    expect(raw).not.toContain("Con GitHub");
  });
});

describe("update_task", () => {
  it("completa los campos omitidos con los actuales", async () => {
    projects.getProject.mockResolvedValue(project([task()]));
    projects.updateTask.mockResolvedValue(project([task({ columnValue: "PROGRESO" })]));

    const result = await call("update_task", { projectId: "p1", taskId: "T-01", labelsToken: "tok", column: "PROGRESO" });

    expect(result.isError).toBeUndefined();
    expect(projects.updateTask).toHaveBeenCalledWith(
      "p1",
      "T-01",
      {
        featureId: "F-01",
        assigneeId: "m1",
        name: "Login",
        type: "FEATURE",
        column: "PROGRESO",
        active: true,
        description: "Con GitHub",
        difficulty: null,
        timeSpent: null,
      },
      "tok",
    );
  });

  it("minutesSpent llega como timeSpent y la dificultad se puede cambiar o quitar", async () => {
    projects.getProject.mockResolvedValue(project([task({ difficulty: "ALTA" })]));
    projects.updateTask.mockResolvedValue(project([task()]));

    await call("update_task", { projectId: "p1", taskId: "T-01", labelsToken: "tok", column: "REVISAR", minutesSpent: 90 });
    expect(projects.updateTask.mock.calls[0][2]).toMatchObject({ difficulty: "ALTA", timeSpent: { minutes: 90 } });

    await call("update_task", { projectId: "p1", taskId: "T-01", labelsToken: "tok", difficulty: null });
    expect(projects.updateTask.mock.calls[1][2]).toMatchObject({ difficulty: null, timeSpent: null });
  });

  it("rechaza minutesSpent fuera de tramos de 15 sin llegar a la base", async () => {
    projects.getProject.mockResolvedValue(project([task()]));
    const result = await call("update_task", { projectId: "p1", taskId: "T-01", labelsToken: "tok", minutesSpent: 20 });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain("minutesSpent");
    expect(projects.updateTask).not.toHaveBeenCalled();
  });

  it("ASSIGNEE_REQUIRED y TIME_NOT_ALLOWED le dicen al modelo qué corregir", async () => {
    projects.getProject.mockResolvedValue(project([task()]));

    projects.updateTask.mockRejectedValueOnce(new ApiError(422, "ASSIGNEE_REQUIRED", "Tiene que tener asignado"));
    const assignee = await call("update_task", { projectId: "p1", taskId: "T-01", labelsToken: "tok", column: "PROGRESO" });
    expect(assignee.isError).toBe(true);
    expect(text(assignee)).toContain("assigneeId");

    projects.updateTask.mockRejectedValueOnce(new ApiError(422, "TIME_NOT_ALLOWED", "No corresponde"));
    const time = await call("update_task", { projectId: "p1", taskId: "T-01", labelsToken: "tok", minutesSpent: 60 });
    expect(time.isError).toBe(true);
    expect(text(time)).toContain("log_time");
  });

  it("null desasigna y quita la feature, a diferencia de omitir el campo", async () => {
    projects.getProject.mockResolvedValue(project([task()]));
    projects.updateTask.mockResolvedValue(project([task()]));

    await call("update_task", { projectId: "p1", taskId: "T-01", labelsToken: "tok", assigneeId: null, featureId: null });

    expect(projects.updateTask.mock.calls[0][2]).toMatchObject({ assigneeId: null, featureId: null });
  });

  it("traduce LABELS_CHANGED a un error que manda a releer el proyecto", async () => {
    projects.getProject.mockResolvedValue(project([task()]));
    projects.updateTask.mockRejectedValue(new ApiError(412, "LABELS_CHANGED", "Se recargó el proyecto"));

    const result = await call("update_task", { projectId: "p1", taskId: "T-01", labelsToken: "viejo", name: "X" });

    expect(result.isError).toBe(true);
    expect(text(result)).toContain("get_project");
  });

  it("responde error si la tarea no existe", async () => {
    projects.getProject.mockResolvedValue(project([task()]));
    const result = await call("update_task", { projectId: "p1", taskId: "T-09", labelsToken: "tok" });
    expect(result.isError).toBe(true);
    expect(projects.updateTask).not.toHaveBeenCalled();
  });
});

describe("create_task", () => {
  it("exige labelsToken si la tarea va a una feature", async () => {
    const result = await call("create_task", { projectId: "p1", name: "X", type: "FIX", column: "PENDIENTE", featureId: "F-01" });
    expect(result.isError).toBe(true);
    expect(projects.createTask).not.toHaveBeenCalled();
  });

  it("devuelve la tarea de label más alto, que es la recién creada", async () => {
    projects.createTask.mockResolvedValue(project([task({ id: "T-09" }), task({ id: "T-10", name: "Nueva" })]));
    const result = await call("create_task", { projectId: "p1", name: "Nueva", type: "FIX", column: "PENDIENTE" });
    expect(JSON.parse(text(result))).toMatchObject({ id: "T-10", name: "Nueva" });
  });

  it("pasa la dificultad, o null si se omite", async () => {
    projects.createTask.mockResolvedValue(project([task({ difficulty: "BAJA" })]));
    const result = await call("create_task", { projectId: "p1", name: "X", type: "FIX", column: "PENDIENTE", difficulty: "BAJA" });
    expect(projects.createTask.mock.calls[0][1]).toMatchObject({ difficulty: "BAJA" });
    expect(JSON.parse(text(result))).toMatchObject({ difficulty: "BAJA" });

    await call("create_task", { projectId: "p1", name: "X", type: "FIX", column: "PENDIENTE" });
    expect(projects.createTask.mock.calls[1][1]).toMatchObject({ difficulty: null });
  });

  it("pasa el issue de origen para que la tarea quede vinculada", async () => {
    projects.createTask.mockResolvedValue(project([task({ id: "T-01", issues: [4] })]));
    const result = await call("create_task", { projectId: "p1", name: "X", type: "FIX", column: "PENDIENTE", issueNumber: 4 });
    expect(projects.createTask.mock.calls[0][1]).toMatchObject({ issueNumber: 4 });
    expect(JSON.parse(text(result))).toMatchObject({ issues: [4] });
  });
});

describe("features", () => {
  function feature(overrides: Partial<ProjectFeature> = {}): ProjectFeature {
    return {
      id: "F-01",
      name: "Auth",
      priority: "alta",
      priorityValue: "ALTA",
      status: "Pendiente",
      statusColor: "gray",
      statusValue: "PENDIENTE",
      description: "Con GitHub",
      taskCount: 0,
      issues: [],
      ...overrides,
    };
  }

  it("create_feature devuelve la de label más alto y pasa el issue de origen", async () => {
    projects.createFeature.mockResolvedValue(project([], [feature({ id: "F-01" }), feature({ id: "F-02", name: "MCP", issues: [4] })]));
    const result = await call("create_feature", { projectId: "p1", name: "MCP", priority: "MEDIA", issueNumber: 4 });
    expect(projects.createFeature.mock.calls[0][1]).toMatchObject({ name: "MCP", priority: "MEDIA", issueNumber: 4, description: null });
    expect(JSON.parse(text(result))).toMatchObject({ id: "F-02", name: "MCP", issues: [4] });
  });

  it("update_feature completa los campos omitidos con los actuales", async () => {
    projects.getProject.mockResolvedValue(project([], [feature()]));
    projects.updateFeature.mockResolvedValue(project([], [feature({ statusValue: "HECHO" })]));
    await call("update_feature", { projectId: "p1", featureId: "F-01", labelsToken: "tok", status: "HECHO" });
    expect(projects.updateFeature).toHaveBeenCalledWith(
      "p1",
      "F-01",
      { name: "Auth", priority: "ALTA", status: "HECHO", description: "Con GitHub" },
      "tok",
    );
  });

  it("update_feature con description null la quita, a diferencia de omitirla", async () => {
    projects.getProject.mockResolvedValue(project([], [feature()]));
    projects.updateFeature.mockResolvedValue(project([], [feature({ description: null })]));
    await call("update_feature", { projectId: "p1", featureId: "F-01", labelsToken: "tok", description: null });
    expect(projects.updateFeature.mock.calls[0][2]).toMatchObject({ description: null });
  });

  it("update_feature responde error si la feature no existe", async () => {
    projects.getProject.mockResolvedValue(project([], [feature()]));
    const result = await call("update_feature", { projectId: "p1", featureId: "F-09", labelsToken: "tok" });
    expect(result.isError).toBe(true);
    expect(projects.updateFeature).not.toHaveBeenCalled();
  });
});

describe("update_document", () => {
  const doc = (content: string) => ({ title: "Kickoff", type: "Kickoff", badgeColor: "blue", author: "", date: "", content });

  it("guarda si la version coincide con la leída", async () => {
    projects.getProjectDoc.mockResolvedValue(doc("v1"));
    const read = JSON.parse(text(await call("get_document", { projectId: "p1", docId: "kickoff" })));
    projects.updateProjectDoc.mockResolvedValue(doc("v2"));

    const result = await call("update_document", { projectId: "p1", docId: "kickoff", content: "v2", version: read.version });

    expect(result.isError).toBeUndefined();
    expect(projects.updateProjectDoc).toHaveBeenCalledWith("p1", "kickoff", "v2");
  });

  it("rechaza si otra persona guardó desde la lectura", async () => {
    projects.getProjectDoc.mockResolvedValue(doc("v1"));
    const read = JSON.parse(text(await call("get_document", { projectId: "p1", docId: "kickoff" })));
    projects.getProjectDoc.mockResolvedValue(doc("v1 editado por otra persona"));

    const result = await call("update_document", { projectId: "p1", docId: "kickoff", content: "v2", version: read.version });

    expect(result.isError).toBe(true);
    expect(projects.updateProjectDoc).not.toHaveBeenCalled();
  });

  it("get_document incluye los comentarios", async () => {
    const comment = { id: "c1", author: "Ana", date: "", quote: "alcance", occurrence: 0, body: "¿Incluye la app?" };
    projects.getProjectDoc.mockResolvedValue(doc("v1"));
    projects.getProjectDocComments.mockResolvedValue([comment]);

    const read = JSON.parse(text(await call("get_document", { projectId: "p1", docId: "kickoff" })));

    expect(read.comments).toEqual([comment]);
  });
});

describe("create_document", () => {
  const doc = (content: string) => ({ title: "Kickoff", type: "Kickoff", badgeColor: "blue", author: "", date: "", content });

  it("crea el documento vacío y guarda el contenido inicial", async () => {
    projects.getProjectDoc.mockResolvedValue(null);
    projects.createProjectDoc.mockResolvedValue(project([]));
    projects.updateProjectDoc.mockResolvedValue(doc("# Kickoff"));

    const result = await call("create_document", { projectId: "p1", slot: "kickoff", content: "# Kickoff" });

    expect(result.isError).toBeUndefined();
    expect(projects.createProjectDoc).toHaveBeenCalledWith("p1", "kickoff");
    expect(projects.updateProjectDoc).toHaveBeenCalledWith("p1", "kickoff", "# Kickoff");
    expect(JSON.parse(text(result))).toMatchObject({ docId: "kickoff" });
  });

  it("sin contenido no guarda una versión", async () => {
    projects.getProjectDoc.mockResolvedValueOnce(null).mockResolvedValueOnce(doc(""));
    projects.createProjectDoc.mockResolvedValue(project([]));

    const result = await call("create_document", { projectId: "p1", slot: "kickoff" });

    expect(result.isError).toBeUndefined();
    expect(projects.updateProjectDoc).not.toHaveBeenCalled();
  });

  it("si ya existe manda a update_document sin tocarlo", async () => {
    projects.getProjectDoc.mockResolvedValue(doc("v1"));

    const result = await call("create_document", { projectId: "p1", slot: "kickoff", content: "otra cosa" });

    expect(result.isError).toBe(true);
    expect(text(result)).toContain("update_document");
    expect(projects.createProjectDoc).not.toHaveBeenCalled();
  });
});

describe("create_acta", () => {
  const withActas = (ids: string[]) => ({ ...project([]), actas: ids.map((id) => ({ id, title: "", date: "" })) });

  it("devuelve el id del acta nueva y guarda el contenido inicial", async () => {
    projects.getProject.mockResolvedValue(withActas(["a1"]));
    projects.createActa.mockResolvedValue(withActas(["a1", "a2"]));
    projects.updateProjectDoc.mockResolvedValue({ title: "Kickoff", content: "Notas" });

    const result = await call("create_acta", { projectId: "p1", title: "Kickoff", date: "2026-10-26", content: "Notas" });

    expect(projects.createActa).toHaveBeenCalledWith("p1", { title: "Kickoff", date: "2026-10-26" });
    expect(projects.updateProjectDoc).toHaveBeenCalledWith("p1", "a2", "Notas");
    expect(JSON.parse(text(result))).toMatchObject({ docId: "a2", date: "2026-10-26" });
  });

  it("rechaza un título vacío sin llegar a la base", async () => {
    const result = await call("create_acta", { projectId: "p1", title: "  ", date: "2026-10-26" });
    expect(result.isError).toBe(true);
    expect(projects.createActa).not.toHaveBeenCalled();
  });
});

describe("resolve_document_comment", () => {
  it("resuelve el comentario", async () => {
    projects.resolveProjectDocComment.mockResolvedValue(true);
    const result = await call("resolve_document_comment", { projectId: "p1", docId: "kickoff", commentId: "c1" });
    expect(result.isError).toBeUndefined();
    expect(projects.resolveProjectDocComment).toHaveBeenCalledWith("p1", "kickoff", "c1");
  });

  it("responde error si no existe", async () => {
    projects.resolveProjectDocComment.mockResolvedValue(false);
    const result = await call("resolve_document_comment", { projectId: "p1", docId: "kickoff", commentId: "c9" });
    expect(result.isError).toBe(true);
  });
});

describe("issues", () => {
  const issue = {
    number: 3,
    title: "Login falla",
    type: "BUG",
    priority: null,
    status: "CERRADO",
    closeReason: "RESUELTO",
    author: "Ana",
    createdAt: "",
    lastActivityAt: "",
    commentCount: 0,
    reviewedByMe: true,
    body: "",
    closedBy: "Ana",
    closedAt: "",
    canEdit: true,
    canDelete: false,
    comments: [],
  };

  it("close_issue cierra con el motivo", async () => {
    issues.setIssueStatus.mockResolvedValue(issue);
    const result = await call("close_issue", { projectId: "p1", number: 3, closeReason: "RESUELTO" });
    expect(result.isError).toBeUndefined();
    expect(issues.setIssueStatus).toHaveBeenCalledWith("p1", 3, { status: "CERRADO", closeReason: "RESUELTO" });
    expect(JSON.parse(text(result))).not.toHaveProperty("canEdit");
  });

  it("mark_issue_reviewed marca por defecto y devuelve reviewed", async () => {
    issues.setIssueReviewed.mockResolvedValue(issue);
    const result = await call("mark_issue_reviewed", { projectId: "p1", number: 3 });
    expect(issues.setIssueReviewed).toHaveBeenCalledWith("p1", 3, true);
    expect(JSON.parse(text(result))).toMatchObject({ number: 3, reviewed: true });
  });

  it("mark_issue_reviewed con reviewed: false desmarca", async () => {
    issues.setIssueReviewed.mockResolvedValue({ ...issue, reviewedByMe: false });
    const result = await call("mark_issue_reviewed", { projectId: "p1", number: 3, reviewed: false });
    expect(issues.setIssueReviewed).toHaveBeenCalledWith("p1", 3, false);
    expect(JSON.parse(text(result)).reviewed).toBe(false);
  });

  it("mark_issue_reviewed responde error si el issue no existe", async () => {
    issues.setIssueReviewed.mockResolvedValue(null);
    const result = await call("mark_issue_reviewed", { projectId: "p1", number: 99 });
    expect(result.isError).toBe(true);
  });

  it("create_issue rechaza un título vacío sin llegar a la base", async () => {
    const result = await call("create_issue", { projectId: "p1", title: "   ", body: "", type: "IDEA" });
    expect(result.isError).toBe(true);
    expect(issues.createIssue).not.toHaveBeenCalled();
  });

  it("update_issue completa los campos omitidos con los actuales", async () => {
    issues.getIssue.mockResolvedValue({ ...issue, body: "Pasa en Safari" });
    issues.updateIssue.mockResolvedValue({ ...issue, title: "Login falla en Safari" });
    const result = await call("update_issue", { projectId: "p1", number: 3, title: "Login falla en Safari" });
    expect(issues.updateIssue).toHaveBeenCalledWith("p1", 3, { title: "Login falla en Safari", body: "Pasa en Safari", type: "BUG" });
    expect(JSON.parse(text(result))).toMatchObject({ title: "Login falla en Safari" });
  });

  it("update_issue responde error si el issue no existe", async () => {
    issues.getIssue.mockResolvedValue(null);
    const result = await call("update_issue", { projectId: "p1", number: 99, title: "X" });
    expect(result.isError).toBe(true);
    expect(issues.updateIssue).not.toHaveBeenCalled();
  });

  it("update_issue con solo la prioridad no pasa por updateIssue, que es actividad", async () => {
    issues.setIssuePriority.mockResolvedValue({ ...issue, priority: "ALTA" });
    const result = await call("update_issue", { projectId: "p1", number: 3, priority: "ALTA" });
    expect(issues.setIssuePriority).toHaveBeenCalledWith("p1", 3, "ALTA");
    expect(issues.updateIssue).not.toHaveBeenCalled();
    expect(issues.getIssue).not.toHaveBeenCalled();
    expect(JSON.parse(text(result))).toMatchObject({ priority: "ALTA" });
  });

  it("update_issue con priority null la quita", async () => {
    issues.setIssuePriority.mockResolvedValue(issue);
    await call("update_issue", { projectId: "p1", number: 3, priority: null });
    expect(issues.setIssuePriority).toHaveBeenCalledWith("p1", 3, null);
  });

  it("update_issue con contenido y prioridad edita primero y devuelve el último detalle", async () => {
    issues.getIssue.mockResolvedValue(issue);
    issues.updateIssue.mockResolvedValue({ ...issue, title: "Nuevo" });
    issues.setIssuePriority.mockResolvedValue({ ...issue, title: "Nuevo", priority: "BAJA" });
    const result = await call("update_issue", { projectId: "p1", number: 3, title: "Nuevo", priority: "BAJA" });
    expect(issues.updateIssue.mock.invocationCallOrder[0]).toBeLessThan(issues.setIssuePriority.mock.invocationCallOrder[0]);
    expect(JSON.parse(text(result))).toMatchObject({ title: "Nuevo", priority: "BAJA" });
  });

  it("update_issue no cambia la prioridad si la edición se rechaza por permisos", async () => {
    issues.getIssue.mockResolvedValue(issue);
    issues.updateIssue.mockRejectedValueOnce(new AuthError(403, "FORBIDDEN_ROLE", "Solo quien abrió el issue o coordinación puede editarlo"));
    const result = await call("update_issue", { projectId: "p1", number: 3, title: "Nuevo", priority: "ALTA" });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain("coordinación");
    expect(issues.setIssuePriority).not.toHaveBeenCalled();
  });

  it("update_issue sin campos o con una prioridad inválida responde error", async () => {
    expect((await call("update_issue", { projectId: "p1", number: 3 })).isError).toBe(true);
    expect((await call("update_issue", { projectId: "p1", number: 3, priority: "URGENTE" })).isError).toBe(true);
    expect(issues.updateIssue).not.toHaveBeenCalled();
    expect(issues.setIssuePriority).not.toHaveBeenCalled();
  });

  it("create_issue pasa la prioridad, o null si se omite", async () => {
    issues.createIssue.mockResolvedValue(issue);
    await call("create_issue", { projectId: "p1", title: "X", body: "", type: "IDEA", priority: "MEDIA" });
    await call("create_issue", { projectId: "p1", title: "X", body: "", type: "IDEA" });
    expect(issues.createIssue.mock.calls[0][1]).toMatchObject({ priority: "MEDIA" });
    expect(issues.createIssue.mock.calls[1][1]).toMatchObject({ priority: null });
  });

  it("list_issues filtra por prioridad e incluye la prioridad", async () => {
    issues.getProjectIssues.mockResolvedValue([
      { ...issue, number: 1, status: "ABIERTO", priority: "ALTA" },
      { ...issue, number: 2, status: "ABIERTO", priority: null },
      { ...issue, number: 3, status: "ABIERTO", priority: "BAJA" },
    ]);
    const numbers = async (priority: string) =>
      JSON.parse(text(await call("list_issues", { projectId: "p1", status: "ABIERTO", priority }))).map(
        (i: { number: number }) => i.number,
      );
    expect(await numbers("TODAS")).toEqual([1, 2, 3]);
    expect(await numbers("SIN")).toEqual([2]);
    expect(await numbers("ALTA")).toEqual([1]);
    const [first] = JSON.parse(text(await call("list_issues", { projectId: "p1", status: "ABIERTO", priority: "TODAS" })));
    expect(first).toMatchObject({ number: 1, priority: "ALTA" });
  });

  it("get_issue incluye las features y tareas vinculadas con el labelsToken", async () => {
    issues.getIssue.mockResolvedValue(issue);
    projects.getProject.mockResolvedValue(
      project([task({ id: "T-01", issues: [3] }), task({ id: "T-02", issues: [5] })], [
        { id: "F-01", name: "Auth", statusValue: "PENDIENTE", issues: [3] } as ProjectFeature,
      ]),
    );
    const result = JSON.parse(text(await call("get_issue", { projectId: "p1", number: 3 })));
    expect(result.labelsToken).toBe("tok");
    expect(result.reviewed).toBe(true);
    expect(result.tasks.map((t: { id: string }) => t.id)).toEqual(["T-01"]);
    expect(result.features).toEqual([{ id: "F-01", name: "Auth", status: "PENDIENTE" }]);
  });

  it("link_issue vincula una tarea por label con el labelsToken", async () => {
    projects.setIssueLink.mockResolvedValue(project([task({ issues: [3] })]));
    const result = await call("link_issue", { projectId: "p1", number: 3, taskId: "T-01", labelsToken: "tok" });
    expect(result.isError).toBeUndefined();
    expect(projects.setIssueLink).toHaveBeenCalledWith("p1", "task", "T-01", 3, true, "tok");
  });

  it("unlink_issue desvincula una feature", async () => {
    projects.setIssueLink.mockResolvedValue(project([]));
    await call("unlink_issue", { projectId: "p1", number: 3, featureId: "F-02", labelsToken: "tok" });
    expect(projects.setIssueLink).toHaveBeenCalledWith("p1", "feature", "F-02", 3, false, "tok");
  });

  it("link_issue rechaza featureId y taskId a la vez, o ninguno", async () => {
    const both = await call("link_issue", { projectId: "p1", number: 3, featureId: "F-01", taskId: "T-01", labelsToken: "tok" });
    const neither = await call("link_issue", { projectId: "p1", number: 3, labelsToken: "tok" });
    expect(both.isError).toBe(true);
    expect(neither.isError).toBe(true);
    expect(projects.setIssueLink).not.toHaveBeenCalled();
  });

  it("get_issue responde error si el issue no existe", async () => {
    issues.getIssue.mockResolvedValue(null);
    const result = await call("get_issue", { projectId: "p1", number: 99 });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain("#99");
  });
});

describe("create_event", () => {
  it("interpreta fecha y hora en Chile", async () => {
    events.createEvent.mockResolvedValue([]);
    await call("create_event", {
      title: "Daily",
      kind: "REUNION",
      allDay: false,
      date: "2026-07-15",
      startTime: "10:00",
      endTime: "10:30",
    });
    expect(events.createEvent.mock.calls[0][0]).toMatchObject({
      startsAt: "2026-07-15T14:00:00.000Z",
      endsAt: "2026-07-15T14:30:00.000Z",
    });
  });

  it("un evento de día completo usa el último día inclusive", async () => {
    events.createEvent.mockResolvedValue([]);
    await call("create_event", { title: "Feriado", kind: "OTRO", allDay: true, date: "2026-09-18", endDate: "2026-09-19" });
    expect(events.createEvent.mock.calls[0][0]).toMatchObject({
      startsAt: "2026-09-18T00:00:00.000Z",
      endsAt: "2026-09-20T00:00:00.000Z",
    });
  });

  it("exige horas si no es de día completo", async () => {
    const result = await call("create_event", { title: "X", kind: "OTRO", allDay: false, date: "2026-07-15" });
    expect(result.isError).toBe(true);
  });
});

describe("update_event", () => {
  const event = {
    id: "e1",
    title: "Daily",
    description: "Estado",
    location: null,
    kind: "REUNION",
    allDay: false,
    // 10:00–10:30 en Chile (UTC-4 en julio).
    startsAt: "2026-07-15T14:00:00.000Z",
    endsAt: "2026-07-15T14:30:00.000Z",
    seriesId: null,
    project: { id: "p1", name: "San Miguel" },
    createdBy: null,
    canEdit: true,
  };

  it("completa los campos omitidos con los actuales", async () => {
    events.getEvent.mockResolvedValue(event);
    events.updateEvent.mockResolvedValue(event);

    const result = await call("update_event", { id: "e1", startTime: "16:00", endTime: "16:30" });

    expect(result.isError).toBeUndefined();
    expect(events.updateEvent).toHaveBeenCalledWith("e1", {
      title: "Daily",
      description: "Estado",
      location: null,
      kind: "REUNION",
      allDay: false,
      startsAt: "2026-07-15T20:00:00.000Z",
      endsAt: "2026-07-15T20:30:00.000Z",
      projectId: "p1",
    });
  });

  it("mover el primer día corre el último de un evento de varios días", async () => {
    const offsite = { ...event, allDay: true, startsAt: "2026-09-17T00:00:00.000Z", endsAt: "2026-09-20T00:00:00.000Z" };
    events.getEvent.mockResolvedValue(offsite);
    events.updateEvent.mockResolvedValue(offsite);

    await call("update_event", { id: "e1", date: "2026-09-24" });

    expect(events.updateEvent.mock.calls[0][1]).toMatchObject({
      startsAt: "2026-09-24T00:00:00.000Z",
      endsAt: "2026-09-27T00:00:00.000Z",
    });
  });

  it("null quita el proyecto, a diferencia de omitirlo", async () => {
    events.getEvent.mockResolvedValue(event);
    events.updateEvent.mockResolvedValue(event);

    await call("update_event", { id: "e1", projectId: null });

    expect(events.updateEvent.mock.calls[0][1]).toMatchObject({ projectId: null });
  });

  it("pasar a un evento con hora exige ambas horas", async () => {
    events.getEvent.mockResolvedValue({ ...event, allDay: true, startsAt: "2026-09-18T00:00:00.000Z", endsAt: "2026-09-19T00:00:00.000Z" });

    const result = await call("update_event", { id: "e1", allDay: false, startTime: "10:00" });

    expect(result.isError).toBe(true);
    expect(events.updateEvent).not.toHaveBeenCalled();
  });

  it("rechaza un fin anterior al inicio sin llegar a la base", async () => {
    events.getEvent.mockResolvedValue(event);

    const result = await call("update_event", { id: "e1", startTime: "11:00" });

    expect(result.isError).toBe(true);
    expect(events.updateEvent).not.toHaveBeenCalled();
  });

  it("responde error si el evento no existe", async () => {
    events.getEvent.mockResolvedValue(null);
    const result = await call("update_event", { id: "e9", title: "X" });
    expect(result.isError).toBe(true);
  });
});

const entryArgs = { projectId: "p1", minutes: 60, description: "Algo", date: "2026-01-05" };
const entryResult = {
  id: "h1",
  date: "2026-01-05",
  minutes: 60,
  description: "Algo",
  project: { id: "p1", name: "San Miguel" },
  kind: "TRABAJO",
  task: { label: "T-03", name: "Login" },
};

describe("log_time", () => {
  it("rechaza minutos que no son múltiplo de 15 sin llegar a la base", async () => {
    const result = await call("log_time", { ...entryArgs, minutes: 20 });
    expect(result.isError).toBe(true);
    expect(tiempo.createTimeEntry).not.toHaveBeenCalled();
  });

  it("sin tarea registra horas manuales", async () => {
    tiempo.createTimeEntry.mockResolvedValue({ ...entryResult, kind: "MANUAL", task: null });
    await call("log_time", entryArgs);
    expect(tiempo.createTimeEntry).toHaveBeenCalledWith(expect.objectContaining({ taskId: null, kind: "MANUAL" }));
    expect(tiempo.resolveTaskLabel).not.toHaveBeenCalled();
  });

  it("vincula la tarea por label con el labelsToken, como trabajo por defecto", async () => {
    tiempo.resolveTaskLabel.mockResolvedValue("task-id");
    tiempo.createTimeEntry.mockResolvedValue(entryResult);

    const result = await call("log_time", { ...entryArgs, taskLabel: "T-03", labelsToken: "tok" });

    expect(tiempo.resolveTaskLabel).toHaveBeenCalledWith("p1", "T-03", "tok");
    expect(tiempo.createTimeEntry).toHaveBeenCalledWith(expect.objectContaining({ taskId: "task-id", kind: "TRABAJO" }));
    expect(JSON.parse(text(result))).toMatchObject({ kind: "TRABAJO", task: { label: "T-03", name: "Login" } });

    await call("log_time", { ...entryArgs, taskLabel: "T-03", labelsToken: "tok", kind: "REVISION" });
    expect(tiempo.createTimeEntry).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "REVISION" }));
  });

  it("exige el labelsToken con taskLabel, y kind solo con taskLabel", async () => {
    expect((await call("log_time", { ...entryArgs, taskLabel: "T-03" })).isError).toBe(true);
    expect((await call("log_time", { ...entryArgs, kind: "REVISION" })).isError).toBe(true);
    expect(tiempo.createTimeEntry).not.toHaveBeenCalled();
  });

  it("si los labels cambiaron pide releer el proyecto", async () => {
    tiempo.resolveTaskLabel.mockRejectedValue(new ApiError(412, "LABELS_CHANGED", "UI"));
    const result = await call("log_time", { ...entryArgs, taskLabel: "T-03", labelsToken: "viejo" });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain("get_project");
  });
});

describe("update_time_entry", () => {
  beforeEach(() => {
    tiempo.updateTimeEntry.mockResolvedValue(entryResult);
  });

  it("sin taskLabel conserva la tarea vinculada si el proyecto no cambia", async () => {
    tiempo.getTimeEntryLink.mockResolvedValue({ projectId: "p1", taskId: "task-id", kind: "REVISION" });
    await call("update_time_entry", { id: "h1", ...entryArgs });
    expect(tiempo.updateTimeEntry).toHaveBeenCalledWith("h1", expect.objectContaining({ taskId: "task-id", kind: "REVISION" }));
  });

  it("sin taskLabel y con otro proyecto la deja manual", async () => {
    tiempo.getTimeEntryLink.mockResolvedValue({ projectId: "p2", taskId: "task-id", kind: "TRABAJO" });
    await call("update_time_entry", { id: "h1", ...entryArgs });
    expect(tiempo.updateTimeEntry).toHaveBeenCalledWith("h1", expect.objectContaining({ taskId: null, kind: "MANUAL" }));
  });

  it("taskLabel null quita la tarea y un label la cambia", async () => {
    await call("update_time_entry", { id: "h1", ...entryArgs, taskLabel: null });
    expect(tiempo.updateTimeEntry).toHaveBeenLastCalledWith("h1", expect.objectContaining({ taskId: null, kind: "MANUAL" }));
    expect(tiempo.getTimeEntryLink).not.toHaveBeenCalled();

    tiempo.resolveTaskLabel.mockResolvedValue("otra");
    await call("update_time_entry", { id: "h1", ...entryArgs, taskLabel: "T-05", labelsToken: "tok" });
    expect(tiempo.updateTimeEntry).toHaveBeenLastCalledWith("h1", expect.objectContaining({ taskId: "otra", kind: "TRABAJO" }));
  });

  it("un registro ajeno o inexistente responde que no existe", async () => {
    tiempo.getTimeEntryLink.mockResolvedValue(null);
    const result = await call("update_time_entry", { id: "h9", ...entryArgs });
    expect(result.isError).toBe(true);
    expect(tiempo.updateTimeEntry).not.toHaveBeenCalled();
  });
});

describe("tools/list", () => {
  it("publica cada tool con su JSON Schema", async () => {
    const { createMcpHandler } = await import("mcp-handler");
    const handler = createMcpHandler(registerTools);
    const res = await handler(
      new Request("http://localhost/api/mcp", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      }),
    );
    const raw = await res.text();
    const body = JSON.parse(raw.startsWith("event:") || raw.startsWith("data:") ? raw.split("data: ")[1] : raw);
    const listed = body.result.tools as { name: string; inputSchema: { type: string; properties?: object } }[];

    expect(listed.map((t) => t.name).sort()).toEqual([...tools.keys()].sort());
    expect(listed.find((t) => t.name === "create_task")?.inputSchema.properties).toHaveProperty("type.enum");
  });
});
