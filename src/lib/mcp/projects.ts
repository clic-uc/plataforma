import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { KanbanColumn, TaskType } from "@/generated/prisma/enums";
import {
  createTask,
  getAssignedTasks,
  getProject,
  getProjectDoc,
  getProjects,
  parseCreateTaskInput,
  parseUpdateTaskInput,
  updateProjectDoc,
  updateTask,
} from "@/lib/api/projects.server";
import type { ProjectDetail, ProjectTask } from "@/lib/api/projects";
import { labelNumber } from "@/lib/api/labels";
import { fail, json, run } from "@/lib/mcp/result";

const projectId = z.string().describe("id del proyecto (de list_projects)");
const labelsToken = z.string().describe("labelsToken que devolvió get_project");
const docId = z
  .string()
  .describe("Documento: kickoff, requerimientos, tecnico, decisiones o informe; o el id de un acta (de get_project)");

function taskView(task: ProjectTask) {
  return {
    id: task.id,
    featureId: task.featureId,
    name: task.name,
    type: task.typeValue,
    column: task.columnValue,
    active: task.active,
    description: task.description,
    assignee: task.assignee ? { id: task.assignee.id, name: task.assignee.name } : null,
    issues: task.issues,
  };
}

function projectView(project: ProjectDetail) {
  return {
    id: project.id,
    name: project.name,
    client: project.client,
    description: project.description,
    status: project.statusValue,
    progress: project.progress,
    archived: project.archived,
    startDate: project.startDateISO,
    labelsToken: project.labelsToken,
    team: project.team.map((m) => ({ id: m.id, name: m.name, role: m.role })),
    features: project.features.map((f) => ({
      id: f.id,
      name: f.name,
      priority: f.priorityValue,
      status: f.statusValue,
      description: f.description,
      taskCount: f.taskCount,
      issues: f.issues,
    })),
    tasks: project.tasks.map(taskView),
    documents: project.docs.map((d) => ({ docId: d.key, name: d.name, filled: d.filled, author: d.author, date: d.date })),
    actas: project.actas.map((a) => ({ docId: a.id, title: a.title, date: a.date })),
  };
}

/**
 * Huella del contenido de un documento. update_document la exige: entre leer y
 * escribir pasa el tiempo que el modelo tarda en redactar, y sin ella un guardado
 * de otra persona en ese intervalo se perdería sin aviso.
 */
function contentVersion(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

export function registerProjectTools(server: McpServer): void {
  server.registerTool(
    "list_projects",
    {
      title: "Listar proyectos",
      description: "Proyectos de CLIC con su estado, avance y equipo.",
      inputSchema: z.object({
        includeArchived: z.boolean().default(false).describe("Incluir proyectos archivados"),
      }),
      annotations: { readOnlyHint: true },
    },
    ({ includeArchived }) =>
      run(async () => {
        const projects = await getProjects();
        return json(
          projects
            .filter((p) => includeArchived || !p.archived)
            .map((p) => ({
              id: p.id,
              name: p.name,
              client: p.client,
              status: p.statusValue,
              progress: p.progress,
              archived: p.archived,
              startDate: p.startDateISO,
              team: p.team.map((m) => ({ id: m.id, name: m.name, role: m.role })),
            })),
        );
      }),
  );

  server.registerTool(
    "get_project",
    {
      title: "Ver proyecto",
      description:
        "Detalle de un proyecto: equipo, features (F-01…), tareas (T-01…), documentos y actas. Devuelve el labelsToken que piden las tools que editan tareas.",
      inputSchema: z.object({ projectId }),
      annotations: { readOnlyHint: true },
    },
    ({ projectId }) =>
      run(async () => {
        const project = await getProject(projectId);
        if (!project) return fail("No existe el proyecto");
        return json(projectView(project));
      }),
  );

  server.registerTool(
    "list_my_tasks",
    {
      title: "Mis tareas",
      description: "Tareas asignadas a la persona conectada, en todos los proyectos.",
      inputSchema: z.object({
        includeDone: z.boolean().default(false).describe("Incluir las que están en LISTO"),
      }),
      annotations: { readOnlyHint: true },
    },
    ({ includeDone }) =>
      run(async () => {
        const tasks = await getAssignedTasks(includeDone);
        return json(
          tasks.map((t) => ({
            project: t.project,
            id: t.id,
            featureId: t.featureId,
            name: t.name,
            type: t.typeValue,
            column: t.columnValue,
            active: t.active,
            description: t.description,
          })),
        );
      }),
  );

  server.registerTool(
    "create_task",
    {
      title: "Crear tarea",
      description:
        "Crea una tarea en un proyecto. Solo se puede asignar a miembros del equipo del proyecto. Una tarea queda terminada cuando está en la columna LISTO.",
      inputSchema: z.object({
        projectId,
        name: z.string().min(1),
        type: z.enum(TaskType),
        column: z.enum(KanbanColumn).default(KanbanColumn.PENDIENTE),
        featureId: z.string().optional().describe("Label de la feature (F-01). Requiere labelsToken."),
        assigneeId: z.string().optional().describe("id del miembro asignado"),
        description: z.string().optional(),
        issueNumber: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Número del issue del que sale la tarea (el 12 de #12); queda vinculada a él"),
        labelsToken: labelsToken.optional(),
      }),
    },
    (args) =>
      run(async () => {
        if (args.featureId && !args.labelsToken) {
          return fail("Para asociar la tarea a una feature hace falta el labelsToken de get_project.");
        }
        const input = parseCreateTaskInput({
          name: args.name,
          type: args.type,
          column: args.column,
          featureId: args.featureId ?? null,
          assigneeId: args.assigneeId ?? null,
          description: args.description ?? null,
          issueNumber: args.issueNumber ?? null,
        });
        if (!input) return fail("Datos inválidos");

        const project = await createTask(args.projectId, input, args.labelsToken ?? null);
        if (!project) return fail("No existe el proyecto o la feature");

        // createTask devuelve el proyecto entero; la tarea nueva es la del label más alto.
        const created = project.tasks.reduce((a, b) => (labelNumber("T", b.id) > labelNumber("T", a.id) ? b : a));
        return json(taskView(created));
      }),
  );

  server.registerTool(
    "update_task",
    {
      title: "Editar tarea",
      description:
        "Edita una tarea: solo cambian los campos que se envían. Sirve para moverla de columna, asignarla o desasignarla.",
      inputSchema: z.object({
        projectId,
        taskId: z.string().describe("Label de la tarea (T-01)"),
        labelsToken,
        name: z.string().min(1).optional(),
        type: z.enum(TaskType).optional(),
        column: z.enum(KanbanColumn).optional(),
        featureId: z.string().nullable().optional().describe("Label de la feature, o null para quitarla"),
        assigneeId: z.string().nullable().optional().describe("id del miembro, o null para desasignar"),
        active: z.boolean().optional(),
        description: z.string().nullable().optional(),
      }),
    },
    (args) =>
      run(async () => {
        // La API reemplaza la tarea entera; los campos omitidos se completan con lo
        // actual. Si los labels cambiaron desde el labelsToken, updateTask rechaza
        // antes de escribir, así que esta lectura nunca mezcla dos tareas distintas.
        const current = await getProject(args.projectId);
        if (!current) return fail("No existe el proyecto");
        const task = current.tasks.find((t) => t.id === args.taskId);
        if (!task) return fail(`No existe la tarea ${args.taskId}`);

        const input = parseUpdateTaskInput({
          name: args.name ?? task.name,
          type: args.type ?? task.typeValue,
          column: args.column ?? task.columnValue,
          featureId: args.featureId !== undefined ? args.featureId : task.featureId,
          assigneeId: args.assigneeId !== undefined ? args.assigneeId : (task.assignee?.id ?? null),
          active: args.active ?? task.active,
          description: args.description !== undefined ? args.description : task.description,
        });
        if (!input) return fail("Datos inválidos");

        const project = await updateTask(args.projectId, args.taskId, input, args.labelsToken);
        const updated = project?.tasks.find((t) => t.id === args.taskId);
        if (!updated) return fail("No existe la tarea o la feature");
        return json(taskView(updated));
      }),
  );

  server.registerTool(
    "get_document",
    {
      title: "Leer documento",
      description:
        "Contenido Markdown de un documento o acta de un proyecto. Devuelve `version`, que update_document exige.",
      inputSchema: z.object({ projectId, docId }),
      annotations: { readOnlyHint: true },
    },
    ({ projectId, docId }) =>
      run(async () => {
        const doc = await getProjectDoc(projectId, docId);
        if (!doc) return fail("No existe el documento (los que no están creados no se pueden leer)");
        return json({
          title: doc.title,
          type: doc.type,
          author: doc.author,
          date: doc.date,
          version: contentVersion(doc.content),
          content: doc.content,
        });
      }),
  );

  server.registerTool(
    "update_document",
    {
      title: "Editar documento",
      description:
        "Reemplaza el contenido completo de un documento o acta: envía el texto entero, no solo lo que cambia. Cada guardado con cambios queda en el historial de versiones. Formato Markdown (GFM) sin HTML ni listas de tareas (- [ ]): las tareas viven en el kanban.",
      inputSchema: z.object({
        projectId,
        docId,
        content: z.string(),
        version: z.string().describe("`version` que devolvió get_document"),
      }),
    },
    ({ projectId, docId, content, version }) =>
      run(async () => {
        const current = await getProjectDoc(projectId, docId);
        if (!current) return fail("No existe el documento");
        if (contentVersion(current.content) !== version) {
          return fail(
            "El documento cambió desde que lo leíste (alguien más lo guardó). Vuelve a leerlo con get_document y aplica tus cambios sobre esa versión.",
          );
        }

        const doc = await updateProjectDoc(projectId, docId, content);
        if (!doc) return fail("No existe el documento");
        return json({ version: contentVersion(doc.content) });
      }),
  );
}
