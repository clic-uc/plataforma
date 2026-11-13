import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { FeatureStatus, KanbanColumn, Priority, TaskDifficulty, TaskType } from "@/generated/prisma/enums";
import {
  createActa,
  createFeature,
  createProjectDoc,
  createTask,
  getAssignedTasks,
  getProject,
  getProjectDoc,
  getProjectDocComments,
  getProjects,
  parseCreateActaInput,
  parseCreateFeatureInput,
  parseCreateTaskInput,
  parseUpdateFeatureInput,
  parseUpdateTaskInput,
  resolveProjectDocComment,
  updateFeature,
  updateProjectDoc,
  updateTask,
} from "@/lib/api/projects.server";
import type { ProjectDetail, ProjectFeature, ProjectTask } from "@/lib/api/projects";
import { labelNumber } from "@/lib/api/labels";
import { MAX_ENTRY_MINUTES, MINUTES_STEP, isValidEntryMinutes } from "@/lib/tiempo";
import { fail, json, orNull, run } from "@/lib/mcp/result";

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

/**
 * Fila de tarea de get_project: sin descripción ni historial. Esas dos partes son las
 * que hacían crecer la respuesta sin tope (una descripción es Markdown libre), y se
 * piden por tarea con get_task.
 */
function taskRowView(task: ProjectTask) {
  return {
    id: task.id,
    featureId: task.featureId,
    name: task.name,
    type: task.typeValue,
    column: task.columnValue,
    active: task.active,
    assignee: task.assignee ? { id: task.assignee.id, name: task.assignee.name } : null,
    difficulty: task.difficulty,
    issues: task.issues,
  };
}

/** En get_task: la tarea completa, con quién la trabajó y la revisó y las horas dedicadas (totales del equipo). */
function taskDetailView(task: ProjectTask) {
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

function featureRowView(feature: ProjectFeature) {
  return {
    id: feature.id,
    name: feature.name,
    priority: feature.priorityValue,
    status: feature.statusValue,
    taskCount: feature.taskCount,
    issues: feature.issues,
  };
}

/** Una feature completa, con su descripción. Sin taskCount: en get_feature las tareas vienen en `tasks`. */
function featureView(feature: ProjectFeature) {
  return {
    id: feature.id,
    name: feature.name,
    priority: feature.priorityValue,
    status: feature.statusValue,
    description: feature.description,
    issues: feature.issues,
  };
}

export interface TaskFilter {
  /** Incluir las que están en LISTO. Pedir una `column` explícita lo anula. */
  includeDone: boolean;
  column?: KanbanColumn;
  assigneeId?: string;
  /** Label de la feature (F-01). */
  featureId?: string;
}

/** Las tareas que get_project devuelve. Es solo lo que se muestra: el labelsToken sale del proyecto entero. */
export function filterTasks(tasks: ProjectTask[], filter: TaskFilter): ProjectTask[] {
  return tasks.filter((t) => {
    if (filter.column) {
      if (t.columnValue !== filter.column) return false;
    } else if (!filter.includeDone && t.columnValue === KanbanColumn.LISTO) {
      return false;
    }
    if (filter.assigneeId && t.assignee?.id !== filter.assigneeId) return false;
    if (filter.featureId && t.featureId !== filter.featureId) return false;
    return true;
  });
}

function projectView(project: ProjectDetail, filter: TaskFilter) {
  const tasks = filterTasks(project.tasks, filter);
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
    features: project.features.map(featureRowView),
    // total vs. shown: sin esto, un proyecto con las terminadas ocultas parecería tener menos tareas.
    taskCounts: { total: project.tasks.length, shown: tasks.length },
    tasks: tasks.map(taskRowView),
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
        "Índice de un proyecto: equipo, features (F-01…), tareas (T-01…), documentos y actas. Es liviano a propósito: las features y tareas vienen sin descripción y las tareas sin historial; para eso, get_task y get_feature. Por defecto omite las tareas en LISTO (taskCounts dice cuántas hay y cuántas se muestran): includeDone las incluye, y column, assigneeId y featureId filtran. Devuelve el labelsToken que piden las tools que editan tareas y features; no depende de los filtros.",
      inputSchema: z.object({
        projectId,
        includeDone: z.boolean().default(false).describe("Incluir las tareas en LISTO"),
        column: z.enum(KanbanColumn).optional().describe("Solo las tareas de esta columna (con LISTO incluye las terminadas)"),
        assigneeId: z.string().optional().describe("Solo las tareas de este miembro (id de list_members o del equipo)"),
        featureId: z.string().optional().describe("Solo las tareas de esta feature (label, F-01)"),
      }),
      annotations: { readOnlyHint: true },
    },
    ({ projectId, includeDone, ...filter }) =>
      run(async () => {
        const project = await getProject(projectId);
        if (!project) return fail("No existe el proyecto");
        return json(projectView(project, { includeDone: includeDone ?? false, ...filter }));
      }),
  );

  server.registerTool(
    "get_task",
    {
      title: "Ver tarea",
      description:
        "Una tarea con su descripción completa, su dificultad, quién la trabajó (workedBy: asignados mientras estuvo En progreso), quién la revisó (reviewedBy: asignados mientras estuvo En revisión) y los minutos dedicados registrados por todo el equipo (minutesWorked, minutesReviewed). Devuelve el labelsToken de ese momento, el que piden update_task y link_issue.",
      inputSchema: z.object({ projectId, taskId: z.string().describe("Label de la tarea (T-01)") }),
      annotations: { readOnlyHint: true },
    },
    ({ projectId, taskId }) =>
      run(async () => {
        const project = await getProject(projectId);
        if (!project) return fail("No existe el proyecto");
        const task = project.tasks.find((t) => t.id === taskId);
        if (!task) return fail(`No existe la tarea ${taskId}`);
        return json({ ...taskDetailView(task), labelsToken: project.labelsToken });
      }),
  );

  server.registerTool(
    "get_feature",
    {
      title: "Ver feature",
      description:
        "Una feature con su descripción completa (Markdown) y las tareas que tiene (sin descripción: get_task). Devuelve el labelsToken de ese momento, el que piden update_feature y link_issue.",
      inputSchema: z.object({ projectId, featureId: z.string().describe("Label de la feature (F-01)") }),
      annotations: { readOnlyHint: true },
    },
    ({ projectId, featureId }) =>
      run(async () => {
        const project = await getProject(projectId);
        if (!project) return fail("No existe el proyecto");
        const feature = project.features.find((f) => f.id === featureId);
        if (!feature) return fail(`No existe la feature ${featureId}`);
        return json({
          ...featureView(feature),
          labelsToken: project.labelsToken,
          tasks: project.tasks.filter((t) => t.featureId === featureId).map(taskRowView),
        });
      }),
  );

  server.registerTool(
    "list_my_tasks",
    {
      title: "Mis tareas",
      description:
        "Tareas asignadas a la persona conectada, en todos los proyectos. Sin descripción: para leerla, get_task con el id del proyecto y el label.",
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
        "Crea una tarea en un proyecto. Solo el equipo del proyecto o coordinación. Solo se puede asignar a miembros del equipo del proyecto. Para crearla en PROGRESO o REVISION hay que asignarla. Una tarea queda terminada cuando está en la columna LISTO.",
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
        "Edita una tarea (solo el equipo del proyecto o coordinación): solo cambian los campos que se envían. Sirve para moverla de columna, asignarla o desasignarla. PROGRESO y REVISION exigen asignado: al moverla ahí sin asignado, envía también assigneeId. Al sacarla de PROGRESO o REVISION, si la persona conectada la tenía asignada, puede registrar en minutesSpent el tiempo que le dedicó (queda en sus horas, vinculado a la tarea); es opcional.",
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
      description: "Crea una feature en un proyecto (solo el equipo del proyecto o coordinación). Nace en estado PENDIENTE. Descripción en Markdown (GFM).",
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
        "Edita una feature (solo el equipo del proyecto o coordinación): solo cambian los campos que se envían. El estado (PENDIENTE, EN_PROGRESO, HECHO) es manual: no se deriva de sus tareas.",
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
        "Contenido Markdown de un documento o acta de un proyecto, con sus comentarios. Devuelve `version`, que update_document exige. Cada comentario cita un fragmento (quote) tal como se lee en la vista previa, sin la sintaxis Markdown; occurrence dice cuál de sus repeticiones es (0 = la primera).",
      inputSchema: z.object({ projectId, docId }),
      annotations: { readOnlyHint: true },
    },
    ({ projectId, docId }) =>
      run(async () => {
        const doc = await getProjectDoc(projectId, docId);
        if (!doc) return fail("No existe el documento (los que no están creados se crean con create_document)");
        const comments = (await getProjectDocComments(projectId, docId)) ?? [];
        return json({
          title: doc.title,
          type: doc.type,
          author: doc.author,
          date: doc.date,
          version: contentVersion(doc.content),
          content: doc.content,
          comments: comments.map((c) => ({ ...c, author: orNull(c.author) })),
        });
      }),
  );

  server.registerTool(
    "create_document",
    {
      title: "Crear documento",
      description:
        "Crea uno de los documentos fijos de un proyecto que todavía está vacío (lo mismo que hacer clic en su fila en la app; solo el equipo del proyecto o coordinación), con contenido inicial opcional en Markdown (GFM, sin HTML ni listas de tareas). Los que ya existen se editan con update_document.",
      inputSchema: z.object({
        projectId,
        slot: z.enum(["kickoff", "requerimientos", "tecnico", "decisiones", "informe"]),
        content: z.string().optional(),
      }),
    },
    ({ projectId, slot, content }) =>
      run(async () => {
        if (await getProjectDoc(projectId, slot)) {
          return fail("El documento ya existe: léelo con get_document y edítalo con update_document.");
        }
        if (!(await createProjectDoc(projectId, slot))) return fail("No existe el proyecto");

        const doc = content?.trim() ? await updateProjectDoc(projectId, slot, content) : await getProjectDoc(projectId, slot);
        if (!doc) return fail("No existe el documento");
        return json({ docId: slot, title: doc.title, version: contentVersion(doc.content) });
      }),
  );

  server.registerTool(
    "create_acta",
    {
      title: "Crear acta",
      description:
        "Crea un acta en un proyecto (solo el equipo del proyecto o coordinación), con contenido inicial opcional en Markdown (GFM, sin HTML ni listas de tareas). Devuelve su docId para get_document y update_document.",
      inputSchema: z.object({
        projectId,
        title: z.string().min(1),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato "YYYY-MM-DD"').describe("Fecha de la reunión"),
        content: z.string().optional(),
      }),
    },
    ({ projectId, title, date, content }) =>
      run(async () => {
        const input = parseCreateActaInput({ title, date });
        if (!input) return fail("Datos inválidos");

        // createActa devuelve el proyecto entero; el acta nueva es la que no estaba antes,
        // como lo resuelve CreateActaModal.
        const before = await getProject(projectId);
        if (!before) return fail("No existe el proyecto");
        const existing = new Set(before.actas.map((a) => a.id));
        const project = await createActa(projectId, input);
        const created = project?.actas.find((a) => !existing.has(a.id));
        if (!created) return fail("No existe el proyecto");

        const doc = content?.trim()
          ? await updateProjectDoc(projectId, created.id, content)
          : await getProjectDoc(projectId, created.id);
        if (!doc) return fail("No existe el acta");
        return json({ docId: created.id, title: doc.title, date, version: contentVersion(doc.content) });
      }),
  );

  server.registerTool(
    "resolve_document_comment",
    {
      title: "Resolver comentario de documento",
      description:
        "Resuelve un comentario de un documento o acta, como el botón «Resolver» de la app: lo borra y no queda registro. Solo el equipo del proyecto o coordinación. Antes, muéstrale a la persona qué comentarios vas a resolver y espera su confirmación.",
      inputSchema: z.object({
        projectId,
        docId,
        commentId: z.string().describe("id del comentario (de get_document)"),
      }),
      annotations: { destructiveHint: true },
    },
    ({ projectId, docId, commentId }) =>
      run(async () => {
        if (!(await resolveProjectDocComment(projectId, docId, commentId))) return fail("No existe el comentario");
        return json({ resolved: commentId });
      }),
  );

  server.registerTool(
    "update_document",
    {
      title: "Editar documento",
      description:
        "Reemplaza el contenido completo de un documento o acta (solo el equipo del proyecto o coordinación): envía el texto entero, no solo lo que cambia. Cada guardado con cambios queda en el historial de versiones. Formato Markdown (GFM) sin HTML ni listas de tareas (- [ ]): las tareas viven en el kanban.",
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
