import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CallToolResult, McpServer } from "@modelcontextprotocol/server";
import { ApiError } from "@/lib/api/errors";
import type { ProjectDetail, ProjectFeature, ProjectTask } from "@/lib/api/projects";
import { registerTools } from "@/lib/mcp/server";

const { projects, issues, events, tiempo } = vi.hoisted(() => ({
  projects: {
    getProject: vi.fn(),
    getProjectDoc: vi.fn(),
    updateProjectDoc: vi.fn(),
    updateTask: vi.fn(),
    createTask: vi.fn(),
    setIssueLink: vi.fn(),
  },
  issues: { getIssue: vi.fn(), createIssue: vi.fn(), setIssueStatus: vi.fn() },
  events: { createEvent: vi.fn() },
  tiempo: { createTimeEntry: vi.fn() },
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
    ...overrides,
  };
}

function project(tasks: ProjectTask[], features: ProjectFeature[] = []): ProjectDetail {
  return { id: "p1", labelsToken: "tok", tasks, features } as ProjectDetail;
}

beforeEach(() => {
  vi.clearAllMocks();
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
      },
      "tok",
    );
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

  it("pasa el issue de origen para que la tarea quede vinculada", async () => {
    projects.createTask.mockResolvedValue(project([task({ id: "T-01", issues: [4] })]));
    const result = await call("create_task", { projectId: "p1", name: "X", type: "FIX", column: "PENDIENTE", issueNumber: 4 });
    expect(projects.createTask.mock.calls[0][1]).toMatchObject({ issueNumber: 4 });
    expect(JSON.parse(text(result))).toMatchObject({ issues: [4] });
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
});

describe("issues", () => {
  const issue = {
    number: 3,
    title: "Login falla",
    type: "BUG",
    status: "CERRADO",
    closeReason: "RESUELTO",
    author: "Ana",
    createdAt: "",
    lastActivityAt: "",
    commentCount: 0,
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

  it("create_issue rechaza un título vacío sin llegar a la base", async () => {
    const result = await call("create_issue", { projectId: "p1", title: "   ", body: "", type: "IDEA" });
    expect(result.isError).toBe(true);
    expect(issues.createIssue).not.toHaveBeenCalled();
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

describe("log_time", () => {
  it("rechaza minutos que no son múltiplo de 15 sin llegar a la base", async () => {
    const result = await call("log_time", { projectId: "p1", minutes: 20, description: "Algo", date: "2026-01-05" });
    expect(result.isError).toBe(true);
    expect(tiempo.createTimeEntry).not.toHaveBeenCalled();
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
