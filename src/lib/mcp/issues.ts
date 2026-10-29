import "server-only";

import { z } from "zod";
import type { CallToolResult, McpServer } from "@modelcontextprotocol/server";
import { IssueCloseReason, IssueType } from "@/generated/prisma/enums";
import {
  createIssue,
  createIssueComment,
  getIssue,
  getProjectIssues,
  parseIssueCommentInput,
  parseIssueInput,
  parseIssueStatusInput,
  setIssueReviewed,
  setIssueStatus,
} from "@/lib/api/issues.server";
import { getProject, setIssueLink } from "@/lib/api/projects.server";
import type { IssueDetail, IssueListItem } from "@/lib/api/issues";
import type { ProjectDetail } from "@/lib/api/projects";
import { fail, json, run } from "@/lib/mcp/result";

const projectId = z.string().describe("id del proyecto (de list_projects)");
const number = z.number().int().positive().describe("Número del issue (el 12 de #12)");
const labelsToken = z.string().describe("labelsToken que devolvió get_project o get_issue");

function issueListView(issue: IssueListItem) {
  return {
    number: issue.number,
    title: issue.title,
    type: issue.type,
    status: issue.status,
    closeReason: issue.closeReason,
    author: issue.author,
    lastActivityAt: issue.lastActivityAt,
    commentCount: issue.commentCount,
    reviewed: issue.reviewedByMe,
  };
}

// canEdit/canDelete solo ocultan botones en la UI; al modelo no le sirven.
function issueView(issue: IssueDetail) {
  return {
    ...issueListView(issue),
    createdAt: issue.createdAt,
    body: issue.body,
    closedBy: issue.closedBy,
    closedAt: issue.closedAt,
    comments: issue.comments.map((c) => ({ author: c.author, date: c.date, edited: c.edited, body: c.body })),
  };
}

/**
 * Features y tareas vinculadas al issue, con el labelsToken del mismo snapshot del
 * proyecto: los labels y el token salen juntos, así que se pueden usar enseguida en
 * link_issue / unlink_issue.
 */
function linksView(project: ProjectDetail, issueNumber: number) {
  return {
    labelsToken: project.labelsToken,
    features: project.features
      .filter((f) => f.issues.includes(issueNumber))
      .map((f) => ({ id: f.id, name: f.name, status: f.statusValue })),
    tasks: project.tasks
      .filter((t) => t.issues.includes(issueNumber))
      .map((t) => ({ id: t.id, name: t.name, column: t.columnValue })),
  };
}

const linkSchema = z.object({
  projectId,
  number,
  featureId: z.string().optional().describe("Label de la feature (F-01). Va esto o taskId, no ambos."),
  taskId: z.string().optional().describe("Label de la tarea (T-01). Va esto o featureId, no ambos."),
  labelsToken,
});

async function setLink(args: z.infer<typeof linkSchema>, linked: boolean): Promise<CallToolResult> {
  if (Boolean(args.featureId) === Boolean(args.taskId)) {
    return fail("Indica featureId o taskId (uno de los dos, no ambos).");
  }
  const [kind, label] = args.featureId ? (["feature", args.featureId] as const) : (["task", args.taskId!] as const);

  const project = await setIssueLink(args.projectId, kind, label, args.number, linked, args.labelsToken);
  if (!project) return fail(`No existe ${label} o el issue #${args.number} en ese proyecto`);
  return json(linksView(project, args.number));
}

export function registerIssueTools(server: McpServer): void {
  server.registerTool(
    "list_issues",
    {
      title: "Listar issues",
      description:
        "Issues de un proyecto (tickets con hilo de conversación), del de actividad más reciente al más antiguo. reviewed dice si la persona conectada ya lo revisó después de su última actividad.",
      inputSchema: z.object({
        projectId,
        status: z.enum(["ABIERTO", "CERRADO", "TODOS"]).default("ABIERTO").describe("Filtrar por estado"),
      }),
      annotations: { readOnlyHint: true },
    },
    ({ projectId, status }) =>
      run(async () => {
        const issues = await getProjectIssues(projectId);
        if (!issues) return fail("No existe el proyecto");
        return json(issues.filter((i) => status === "TODOS" || i.status === status).map(issueListView));
      }),
  );

  server.registerTool(
    "get_issue",
    {
      title: "Ver issue",
      description:
        "Un issue con su cuerpo, todo su hilo de comentarios y las features y tareas vinculadas a él. Devuelve el labelsToken que piden link_issue y unlink_issue. Leerlo no lo marca como revisado: para eso está mark_issue_reviewed.",
      inputSchema: z.object({ projectId, number }),
      annotations: { readOnlyHint: true },
    },
    ({ projectId, number }) =>
      run(async () => {
        const [issue, project] = await Promise.all([getIssue(projectId, number), getProject(projectId)]);
        if (!issue || !project) return fail(`No existe el issue #${number} en ese proyecto`);
        return json({ ...issueView(issue), ...linksView(project, number) });
      }),
  );

  server.registerTool(
    "create_issue",
    {
      title: "Abrir issue",
      description:
        "Abre un issue en un proyecto: un ticket para discutir un bug, una idea o una pregunta antes de convertirlo en features o tareas. Cuerpo en Markdown (GFM).",
      inputSchema: z.object({
        projectId,
        title: z.string().min(1),
        body: z.string().default(""),
        type: z.enum(IssueType),
      }),
    },
    (args) =>
      run(async () => {
        const input = parseIssueInput({ title: args.title, body: args.body ?? "", type: args.type });
        if (!input) return fail("Datos inválidos");

        const issue = await createIssue(args.projectId, input);
        if (!issue) return fail("No existe el proyecto");
        return json(issueView(issue));
      }),
  );

  server.registerTool(
    "comment_issue",
    {
      title: "Comentar issue",
      description: "Agrega un comentario al hilo de un issue, en Markdown (GFM).",
      inputSchema: z.object({ projectId, number, body: z.string().min(1) }),
    },
    (args) =>
      run(async () => {
        const input = parseIssueCommentInput({ body: args.body });
        if (!input) return fail("Datos inválidos");

        const issue = await createIssueComment(args.projectId, args.number, input.body);
        if (!issue) return fail(`No existe el issue #${args.number} en ese proyecto`);
        return json(issueView(issue));
      }),
  );

  server.registerTool(
    "close_issue",
    {
      title: "Cerrar issue",
      description:
        "Cierra un issue con su motivo: RESUELTO (se hizo, por ejemplo con las tareas que generó), DESCARTADO (no se va a hacer) o DUPLICADO.",
      inputSchema: z.object({ projectId, number, closeReason: z.enum(IssueCloseReason) }),
    },
    (args) =>
      run(async () => {
        const input = parseIssueStatusInput({ status: "CERRADO", closeReason: args.closeReason });
        if (!input) return fail("Datos inválidos");

        const issue = await setIssueStatus(args.projectId, args.number, input);
        if (!issue) return fail(`No existe el issue #${args.number} en ese proyecto`);
        return json(issueView(issue));
      }),
  );

  server.registerTool(
    "reopen_issue",
    {
      title: "Reabrir issue",
      description: "Reabre un issue cerrado.",
      inputSchema: z.object({ projectId, number }),
    },
    (args) =>
      run(async () => {
        const issue = await setIssueStatus(args.projectId, args.number, { status: "ABIERTO" });
        if (!issue) return fail(`No existe el issue #${args.number} en ese proyecto`);
        return json(issueView(issue));
      }),
  );

  server.registerTool(
    "mark_issue_reviewed",
    {
      title: "Marcar issue como revisado",
      description:
        "Marca un issue como revisado por la persona conectada (o lo desmarca con reviewed: false). Es personal: no cambia nada para el resto. Cualquier actividad nueva de otra persona (comentario, edición, cierre, reapertura o vínculo) lo vuelve a dejar sin revisar; lo que hace la propia persona no.",
      inputSchema: z.object({
        projectId,
        number,
        reviewed: z.boolean().default(true).describe("true marca como revisado; false lo desmarca"),
      }),
    },
    (args) =>
      run(async () => {
        const issue = await setIssueReviewed(args.projectId, args.number, args.reviewed ?? true);
        if (!issue) return fail(`No existe el issue #${args.number} en ese proyecto`);
        return json(issueListView(issue));
      }),
  );

  server.registerTool(
    "link_issue",
    {
      title: "Vincular a issue",
      description:
        "Vincula una feature o tarea existente con un issue del mismo proyecto (una puede tener varios issues y un issue varias). Para una tarea nueva, mejor create_task con issueNumber.",
      inputSchema: linkSchema,
    },
    (args) => run(() => setLink(args, true)),
  );

  server.registerTool(
    "unlink_issue",
    {
      title: "Desvincular de issue",
      description: "Quita el vínculo entre una feature o tarea y un issue. No borra ninguna de las dos.",
      inputSchema: linkSchema,
    },
    (args) => run(() => setLink(args, false)),
  );
}
