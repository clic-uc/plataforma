import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { FeatureStatus, KanbanColumn, Priority, TaskDifficulty, TaskType } from "@/generated/prisma/enums";
import {
  createFeature,
  createTask,
  getAssignedTasks,
  getProject,
  getProjectDoc,
  getProjects,
  parseCreateFeatureInput,
  parseCreateTaskInput,
  parseUpdateFeatureInput,
  parseUpdateTaskInput,
  updateFeature,
  updateProjectDoc,
  updateTask,
} from "@/lib/api/projects.server";
import type { ProjectDetail, ProjectFeature, ProjectTask } from "@/lib/api/projects";
import { labelNumber } from "@/lib/api/labels";
import { MAX_ENTRY_MINUTES, MINUTES_STEP, isValidEntryMinutes } from "@/lib/tiempo";
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
    difficulty: task.difficulty,
    issues: task.issues,
  };
}

/** En get_project: quién la trabajó y la revisó, y las horas dedicadas (totales del equipo). */
function taskWithHistoryView(task: ProjectTask) {
  const { history } = task;
  return {
    ...taskView(task),
    workedBy: history.workedBy.map((m) => m.name),
    reviewedBy: history.reviewedBy.map((m) => m.name),
    minutesWorked: history.minutesWorked,
    minutesReviewed: history.minutesReviewed,
    completedAt: history.completedAt,
  };
}

const difficultyDescription = "Dificultad estimada: BAJA, MEDIA o ALTA";

function featureView(feature: ProjectFeature) {
  return {
    id: feature.id,
    name: feature.name,
    priority: feature.priorityValue,
    status: feature.statusValue,
    description: feature.description,
    taskCount: feature.taskCount,
    issues: feature.issues,
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
    team: project.team.map((m) => ({ id: m.id, name: m.name })),
    features: project.features.map(featureView),
    tasks: project.tasks.map(taskWithHistoryView),
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
              team: p.team.map((m) => ({ id: m.id, name: m.name })),
            })),
        );
      }),
  );

  server.registerTool(
    "get_project",
    {
      title: "Ver proyecto",
      description:
        "Detalle de un proyecto: equipo, features (F-01…), tareas (T-01…), documentos y actas. Devuelve el labelsToken que piden las tools que editan tareas y features. Cada tarea trae su dificultad, quién la trabajó (workedBy: asignados mientras estuvo En progreso) y quién la revisó (reviewedBy: asignados mientras estuvo En revisión), y los minutos dedicados registrados por todo el equipo (minutesWorked, minutesReviewed).",
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
            difficulty: t.difficulty,
          })),
        );
      }),
  );

  server.registerTool(
    "create_task",
    {
      title: "Crear tarea",
      description:
        "Crea una tarea en un proyecto. Solo se puede asignar a miembros del equipo del proyecto. Para crearla en PROGRESO o REVISION hay que asignarla. Una tarea queda terminada cuando está en la columna LISTO.",
      inputSchema: z.object({
        projectId,
        name: z.string().min(1),
        type: z.enum(TaskType),
        column: z.enum(KanbanColumn).default(KanbanColumn.PENDIENTE),
        featureId: z.string().optional().describe("Label de la feature (F-01). Requiere labelsToken."),
        assigneeId: z.string().optional().describe("id del miembro asignado (obligatorio en PROGRESO y REVISION)"),
        description: z.string().optional(),
        difficulty: z.enum(TaskDifficulty).optional().describe(`${difficultyDescription}. Si se omite, queda sin estimar`),
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
          difficulty: args.difficulty ?? null,
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
        "Edita una tarea: solo cambian los campos que se envían. Sirve para moverla de columna, asignarla o desasignarla. PROGRESO y REVISION exigen asignado: al moverla ahí sin asignado, envía también assigneeId. Al sacarla de PROGRESO o REVISION, si la persona conectada la tenía asignada, puede registrar en minutesSpent el tiempo que le dedicó (queda en sus horas, vinculado a la tarea); es opcional.",
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
        difficulty: z.enum(TaskDifficulty).nullable().optional().describe(`${difficultyDescription}, o null para dejarla sin estimar`),
        minutesSpent: z
          .number()
          .int()
          .optional()
          .describe(
            `Minutos que la persona conectada le dedicó, al sacarla de PROGRESO o REVISION. Múltiplo de ${MINUTES_STEP}, entre ${MINUTES_STEP} y ${MAX_ENTRY_MINUTES}`,
          ),
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

        if (args.minutesSpent !== undefined && !isValidEntryMinutes(args.minutesSpent)) {
          return fail(`minutesSpent tiene que ser un múltiplo de ${MINUTES_STEP}, entre ${MINUTES_STEP} y ${MAX_ENTRY_MINUTES}.`);
        }
        const input = parseUpdateTaskInput({
          name: args.name ?? task.name,
          type: args.type ?? task.typeValue,
          column: args.column ?? task.columnValue,
          featureId: args.featureId !== undefined ? args.featureId : task.featureId,
          assigneeId: args.assigneeId !== undefined ? args.assigneeId : (task.assignee?.id ?? null),
          active: args.active ?? task.active,
          description: args.description !== undefined ? args.description : task.description,
          difficulty: args.difficulty !== undefined ? args.difficulty : task.difficulty,
          timeSpent: args.minutesSpent !== undefined ? { minutes: args.minutesSpent } : null,
        });
        if (!input) return fail("Datos inválidos");

        const project = await updateTask(args.projectId, args.taskId, input, args.labelsToken);
        const updated = project?.tasks.find((t) => t.id === args.taskId);
        if (!updated) return fail("No existe la tarea o la feature");
        return json(taskView(updated));
      }),
  );

  server.registerTool(
    "create_feature",
    {
      title: "Crear feature",
      description: "Crea una feature en un proyecto. Nace en estado PENDIENTE. Descripción en Markdown (GFM).",
      inputSchema: z.object({
        projectId,
        name: z.string().min(1),
        priority: z.enum(Priority),
        description: z.string().optional(),
        issueNumber: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Número del issue del que sale la feature (el 12 de #12); queda vinculada a él"),
      }),
    },
    (args) =>
      run(async () => {
        const input = parseCreateFeatureInput({
          name: args.name,
          priority: args.priority,
          description: args.description ?? null,
          issueNumber: args.issueNumber ?? null,
        });
        if (!input) return fail("Datos inválidos");

        const project = await createFeature(args.projectId, input);
        if (!project) return fail("No existe el proyecto");

        // createFeature devuelve el proyecto entero; la feature nueva es la del label más alto.
        const created = project.features.reduce((a, b) => (labelNumber("F", b.id) > labelNumber("F", a.id) ? b : a));
        return json(featureView(created));
      }),
  );

  server.registerTool(
    "update_feature",
    {
      title: "Editar feature",
      description:
        "Edita una feature: solo cambian los campos que se envían. El estado (PENDIENTE, EN_PROGRESO, HECHO) es manual: no se deriva de sus tareas.",
      inputSchema: z.object({
        projectId,
        featureId: z.string().describe("Label de la feature (F-01)"),
        labelsToken,
        name: z.string().min(1).optional(),
        priority: z.enum(Priority).optional(),
        status: z.enum(FeatureStatus).optional(),
        description: z.string().nullable().optional().describe("Markdown (GFM), o null para quitarla"),
      }),
    },
    (args) =>
      run(async () => {
        // Igual que update_task: lo omitido se completa con lo actual, y updateFeature
        // rechaza un labelsToken viejo antes de escribir.
        const current = await getProject(args.projectId);
        if (!current) return fail("No existe el proyecto");
        const feature = current.features.find((f) => f.id === args.featureId);
        if (!feature) return fail(`No existe la feature ${args.featureId}`);

        const input = parseUpdateFeatureInput({
          name: args.name ?? feature.name,
          priority: args.priority ?? feature.priorityValue,
          status: args.status ?? feature.statusValue,
          description: args.description !== undefined ? args.description : feature.description,
        });
        if (!input) return fail("Datos inválidos");

        const project = await updateFeature(args.projectId, args.featureId, input, args.labelsToken);
        const updated = project?.features.find((f) => f.id === args.featureId);
        if (!updated) return fail(`No existe la feature ${args.featureId}`);
        return json(featureView(updated));
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
