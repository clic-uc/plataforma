import "server-only";

import {
  DocSlotType,
  FeatureStatus,
  KanbanColumn,
  Priority,
  ProjectStatus,
  TaskDifficulty,
  TaskType,
  TimeEntryKind,
} from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireMember, requireCoordinacion } from "@/lib/auth/guards";
import { ApiError } from "@/lib/api/errors";
import { ownActivity } from "@/lib/api/issues.server";
import { MAX_COMMENT_LENGTH, MAX_QUOTE_LENGTH } from "@/lib/comments";
import { formatLabel, labelNumber, labelsToken, matchesLabelsToken, nextLabel } from "@/lib/api/labels";
import { summarizeTaskHistory, type TaskTransitionRow } from "@/lib/task-history";
import { MAX_DESCRIPTION_LENGTH, dayKeyToDate, isValidEntryMinutes, todayKey } from "@/lib/tiempo";
import {
  formatDateTime,
  formatDayMonth,
  formatDayMonthYear,
  formatMonthYear,
  getInitials,
  parseISODateInput,
  toISODateInput,
} from "@/lib/api/format";
import {
  docSlotBadgeColor,
  docSlotIcon,
  docSlotName,
  featureStatusColor,
  featureStatusLabel,
  kanbanColumnLabel,
  priorityLabel,
  projectStatusColor,
  projectStatusLabel,
  taskTypeLabel,
} from "@/lib/api/status";
import type {
  AddProjectMemberInput,
  AssignedTask,
  CreateActaInput,
  CreateDocCommentInput,
  CreateFeatureInput,
  CreateProjectInput,
  CreateTaskInput,
  ProjectDetail,
  ProjectDocComment,
  ProjectDocDetail,
  ProjectDocVersion,
  ProjectListItem,
  ProjectTaskHistory,
  ProjectTeamMember,
  UpdateFeatureInput,
  UpdateProjectInput,
  UpdateTaskInput,
} from "@/lib/api/projects";
import { WORK_COLUMNS } from "@/lib/api/projects";

const SLOT_ORDER: DocSlotType[] = [
  DocSlotType.KICKOFF,
  DocSlotType.REQUERIMIENTOS,
  DocSlotType.TECNICO,
  DocSlotType.DECISIONES,
  DocSlotType.INFORME,
];

function parseDocSlot(value: string): DocSlotType | null {
  const upper = value.toUpperCase();
  return (Object.values(DocSlotType) as string[]).includes(upper) ? (upper as DocSlotType) : null;
}

function progressFromTasks(tasks: { column: KanbanColumn }[]): number {
  if (tasks.length === 0) return 0;
  const done = tasks.filter((t) => t.column === "LISTO").length;
  return Math.round((done / tasks.length) * 100);
}

const teamInclude = {
  orderBy: { member: { name: "asc" } },
  include: { member: { select: { id: true, name: true } } },
} satisfies Prisma.Project$membersArgs;

function toTeam(members: Prisma.ProjectMemberGetPayload<{ include: typeof teamInclude.include }>[]): ProjectTeamMember[] {
  return members.map((pm) => ({
    id: pm.member.id,
    name: pm.member.name,
    initials: getInitials(pm.member.name),
  }));
}

const issueNumbersArgs = {
  select: { number: true },
  orderBy: { number: "asc" },
} satisfies Prisma.Feature$issuesArgs;

/**
 * Campo opcional issueNumber de los body de creación: null si no viene, undefined si
 * es inválido (y con él todo el body).
 */
function parseOptionalIssueNumber(value: unknown): number | null | undefined {
  if (value === undefined || value === null) return null;
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

/** id del issue #number del proyecto, para vincularlo al crear. 422 si no existe. */
/** Vincular algo a un issue es actividad del issue (mueve lastActivityAt y renueva mi revisión). */
function linkedIssueActivity(issueId: string, memberId: string) {
  return prisma.issue.update({ where: { id: issueId }, data: ownActivity(issueId, memberId, new Date()) });
}

async function requireIssueId(projectId: string, number: number): Promise<string> {
  const issue = await prisma.issue.findUnique({
    where: { projectId_number: { projectId, number } },
    select: { id: true },
  });
  if (!issue) throw new ApiError(422, "INVALID_ISSUE", `El issue #${number} no existe en este proyecto`);
  return issue.id;
}

// ─── Labels ───
//
// El porqué del labelsToken está en lib/api/labels.ts.

interface ResolvedLabels {
  featureId: (label: string) => string | undefined;
  taskId: (label: string) => string | undefined;
}

/**
 * Verifica el token de labels (encabezado X-Labels-Token) de una mutación y devuelve la resolución label→id vigente.
 * Quien llama debe escribir por id, no por label: así, si otro borrado renumera
 * entre esta lectura y la escritura, la escritura sigue cayendo en la entidad
 * que el cliente vio.
 */
export async function resolveLabels(projectId: string, token: string | null): Promise<ResolvedLabels> {
  if (!token) {
    throw new ApiError(428, "PRECONDITION_REQUIRED", "Falta el encabezado X-Labels-Token con el labelsToken del proyecto");
  }

  const [features, tasks] = await Promise.all([
    prisma.feature.findMany({ where: { projectId }, select: { id: true, label: true } }),
    prisma.task.findMany({ where: { projectId }, select: { id: true, label: true } }),
  ]);

  if (!matchesLabelsToken(token, features, tasks)) {
    throw new ApiError(
      412,
      "LABELS_CHANGED",
      "Alguien eliminó features o tareas y sus identificadores cambiaron. Se recargó el proyecto: vuelve a abrir lo que estabas editando e inténtalo de nuevo.",
    );
  }

  const featureIds = new Map(features.map((f) => [f.label, f.id]));
  const taskIds = new Map(tasks.map((t) => [t.label, t.id]));
  return { featureId: (label) => featureIds.get(label), taskId: (label) => taskIds.get(label) };
}

/**
 * Las tareas solo se asignan a miembros del equipo del proyecto. Se valida al
 * asignar, no en cada edición: una asignación previa a esta regla no debe
 * bloquear, por ejemplo, mover la tarea en el kanban.
 */
async function assertAssignable(projectId: string, assigneeId: string | null): Promise<void> {
  if (!assigneeId) return;
  const membership = await prisma.projectMember.findUnique({
    where: { projectId_memberId: { projectId, memberId: assigneeId } },
    select: { memberId: true },
  });
  if (!membership) {
    throw new ApiError(422, "NOT_PROJECT_MEMBER", "Solo se puede asignar a miembros del equipo del proyecto");
  }
}

export async function getProjects(): Promise<ProjectListItem[]> {
  await requireMember();

  const projects = await prisma.project.findMany({
    orderBy: { startDate: "desc" },
    include: {
      members: teamInclude,
      tasks: true,
    },
  });

  return projects.map((project) => ({
    id: project.id,
    name: project.name,
    client: project.client,
    description: project.description,
    status: projectStatusLabel[project.status],
    statusColor: projectStatusColor[project.status],
    statusValue: project.status,
    progress: progressFromTasks(project.tasks),
    teamSize: project.members.length,
    team: toTeam(project.members),
    startDate: formatMonthYear(project.startDate),
    startDateISO: toISODateInput(project.startDate),
    archived: project.archived,
  }));
}

interface TaskHistoryData {
  transitions: Map<string, TaskTransitionRow[]>;
  memberNames: Map<string, string>;
  minutes: Map<string, { worked: number; reviewed: number }>;
}

/**
 * Historial (TaskTransition) y horas dedicadas (TimeEntry.taskId) de todas las tareas de un
 * proyecto, en dos queries en vez de una por tarea. Las horas se suman de todas las personas:
 * en la tarea se muestran totales, el detalle personal sigue siendo solo de cada uno.
 */
async function loadTaskHistoryData(projectId: string): Promise<TaskHistoryData> {
  const [transitions, minutes] = await Promise.all([
    prisma.taskTransition.findMany({
      where: { task: { projectId } },
      orderBy: { at: "asc" },
      select: {
        taskId: true,
        fromColumn: true,
        toColumn: true,
        assigneeId: true,
        at: true,
        assignee: { select: { id: true, name: true } },
      },
    }),
    prisma.timeEntry.groupBy({
      by: ["taskId", "kind"],
      where: { projectId, taskId: { not: null } },
      _sum: { minutes: true },
    }),
  ]);

  const data: TaskHistoryData = { transitions: new Map(), memberNames: new Map(), minutes: new Map() };
  for (const { taskId, assignee, ...row } of transitions) {
    const list = data.transitions.get(taskId) ?? [];
    list.push(row);
    data.transitions.set(taskId, list);
    if (assignee) data.memberNames.set(assignee.id, assignee.name);
  }
  for (const group of minutes) {
    if (!group.taskId) continue;
    const total = data.minutes.get(group.taskId) ?? { worked: 0, reviewed: 0 };
    const sum = group._sum.minutes ?? 0;
    if (group.kind === TimeEntryKind.TRABAJO) total.worked += sum;
    if (group.kind === TimeEntryKind.REVISION) total.reviewed += sum;
    data.minutes.set(group.taskId, total);
  }
  return data;
}

function toTaskHistory(
  task: { id: string; column: KanbanColumn; assigneeId: string | null; createdAt: Date },
  data: TaskHistoryData,
  now: Date,
): ProjectTaskHistory {
  // Toda tarea tiene al menos su fila de creación (la migración la agregó a las existentes);
  // si faltara, se asume que está donde está desde que se creó.
  const rows = data.transitions.get(task.id) ?? [
    { fromColumn: null, toColumn: task.column, assigneeId: task.assigneeId, at: task.createdAt },
  ];
  const summary = summarizeTaskHistory(rows, task.createdAt, now);
  // Quien ya no es miembro (SetNull) no aparece en los ids; un id sin nombre no debería ocurrir.
  const named = (ids: string[]) => ids.map((id) => ({ id, name: data.memberNames.get(id) ?? "" }));
  const minutes = data.minutes.get(task.id);

  return {
    createdAt: task.createdAt.toISOString(),
    workedBy: named(summary.workerIds),
    reviewedBy: named(summary.reviewerIds),
    columnMs: summary.columnMs,
    completedAt: summary.completedAt?.toISOString() ?? null,
    cycleMs: summary.cycleMs,
    minutesWorked: minutes?.worked ?? 0,
    minutesReviewed: minutes?.reviewed ?? 0,
  };
}

/** `now` es el "ahora" del servidor con que se cuenta el tiempo en la columna actual. */
export async function getProject(id: string, now: Date = new Date()): Promise<ProjectDetail | null> {
  await requireMember();

  const [project, historyData] = await Promise.all([
    prisma.project.findUnique({
      where: { id },
      include: {
        members: teamInclude,
        features: { orderBy: { label: "asc" }, include: { issues: issueNumbersArgs } },
        tasks: {
          orderBy: { label: "asc" },
          include: { assignee: { select: { id: true, name: true } }, issues: issueNumbersArgs },
        },
        documents: { include: { author: true } },
        actas: { orderBy: { date: "asc" } },
      },
    }),
    loadTaskHistoryData(id),
  ]);
  if (!project) return null;

  const featureLabelById = new Map(project.features.map((f) => [f.id, f.label]));
  const taskCountByFeatureId = new Map<string, number>();
  for (const task of project.tasks) {
    if (!task.featureId) continue;
    taskCountByFeatureId.set(task.featureId, (taskCountByFeatureId.get(task.featureId) ?? 0) + 1);
  }

  return {
    id: project.id,
    name: project.name,
    client: project.client,
    description: project.description,
    status: projectStatusLabel[project.status],
    statusColor: projectStatusColor[project.status],
    statusValue: project.status,
    progress: progressFromTasks(project.tasks),
    teamSize: project.members.length,
    team: toTeam(project.members),
    startDate: formatMonthYear(project.startDate),
    startDateISO: toISODateInput(project.startDate),
    archived: project.archived,
    labelsToken: labelsToken(project.features, project.tasks),
    docs: [...project.documents]
      .sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot))
      .map((doc) => ({
        key: doc.slot.toLowerCase(),
        name: docSlotName[doc.slot],
        filled: doc.filled,
        author: doc.author?.name,
        date: doc.date ? formatDayMonthYear(doc.date) : undefined,
        icon: docSlotIcon[doc.slot],
      })),
    actas: project.actas.map((acta) => ({
      id: acta.id,
      title: acta.title,
      date: formatDayMonth(acta.date),
    })),
    features: project.features.map((feature) => ({
      id: feature.label,
      name: feature.name,
      priority: priorityLabel[feature.priority],
      priorityValue: feature.priority,
      status: featureStatusLabel[feature.status],
      statusColor: featureStatusColor[feature.status],
      statusValue: feature.status,
      description: feature.description,
      taskCount: taskCountByFeatureId.get(feature.id) ?? 0,
      issues: feature.issues.map((issue) => issue.number),
    })),
    tasks: project.tasks.map((task) => ({
      id: task.label,
      featureId: task.featureId ? (featureLabelById.get(task.featureId) ?? null) : null,
      name: task.name,
      type: taskTypeLabel[task.type],
      typeValue: task.type,
      done: task.column === "LISTO",
      assignee: task.assignee
        ? { id: task.assignee.id, name: task.assignee.name, initials: getInitials(task.assignee.name) }
        : null,
      column: kanbanColumnLabel[task.column],
      columnValue: task.column,
      active: task.active,
      description: task.description,
      issues: task.issues.map((issue) => issue.number),
      difficulty: task.difficulty,
      history: toTaskHistory(task, historyData, now),
    })),
  };
}

/** Tareas asignadas al miembro actual en todos los proyectos. Sin includeDone, omite las de LISTO. */
export async function getAssignedTasks(includeDone: boolean): Promise<AssignedTask[]> {
  const member = await requireMember();

  const tasks = await prisma.task.findMany({
    where: { assigneeId: member.id, ...(includeDone ? {} : { column: { not: KanbanColumn.LISTO } }) },
    orderBy: [{ project: { name: "asc" } }, { label: "asc" }],
    include: { project: { select: { id: true, name: true } }, feature: { select: { label: true } } },
  });

  return tasks.map((task) => ({
    project: task.project,
    id: task.label,
    featureId: task.feature?.label ?? null,
    name: task.name,
    typeValue: task.type,
    columnValue: task.column,
    active: task.active,
    description: task.description,
    difficulty: task.difficulty,
  }));
}

export function parseCreateProjectInput(body: unknown): CreateProjectInput | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;

  const name = typeof b.name === "string" ? b.name.trim() : "";
  const client = typeof b.client === "string" ? b.client.trim() : "";
  const description = typeof b.description === "string" ? b.description.trim() : "";
  if (!name || !client || !description) return null;

  const status = typeof b.status === "string" ? b.status : "";
  if (!(Object.values(ProjectStatus) as string[]).includes(status)) return null;

  const startDate = typeof b.startDate === "string" ? b.startDate : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return null;

  return { name, client, description, status: status as ProjectStatus, startDate };
}

export async function createProject(input: CreateProjectInput): Promise<ProjectDetail> {
  await requireCoordinacion();

  const project = await prisma.project.create({
    data: {
      name: input.name,
      client: input.client,
      description: input.description,
      status: input.status,
      startDate: parseISODateInput(input.startDate),
      archived: false,
    },
  });

  await prisma.document.createMany({
    data: SLOT_ORDER.map((slot) => ({ projectId: project.id, slot, filled: false })),
  });

  const detail = await getProject(project.id);
  if (!detail) throw new Error("No se pudo cargar el proyecto recién creado");
  return detail;
}

export async function deleteProject(id: string): Promise<boolean> {
  await requireCoordinacion();

  const exists = await prisma.project.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return false;

  await prisma.$transaction([
    prisma.timeEntry.deleteMany({ where: { projectId: id } }),
    // Sus comentarios caen en cascada.
    prisma.issue.deleteMany({ where: { projectId: id } }),
    prisma.task.deleteMany({ where: { projectId: id } }),
    prisma.feature.deleteMany({ where: { projectId: id } }),
    prisma.document.deleteMany({ where: { projectId: id } }),
    prisma.acta.deleteMany({ where: { projectId: id } }),
    prisma.projectMember.deleteMany({ where: { projectId: id } }),
    prisma.project.delete({ where: { id } }),
  ]);

  return true;
}

export function parseUpdateProjectInput(body: unknown): UpdateProjectInput | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;

  const name = typeof b.name === "string" ? b.name.trim() : "";
  const client = typeof b.client === "string" ? b.client.trim() : "";
  const description = typeof b.description === "string" ? b.description.trim() : "";
  if (!name || !client || !description) return null;

  const status = typeof b.status === "string" ? b.status : "";
  if (!(Object.values(ProjectStatus) as string[]).includes(status)) return null;

  const startDate = typeof b.startDate === "string" ? b.startDate : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return null;

  if (typeof b.archived !== "boolean") return null;

  return { name, client, description, status: status as ProjectStatus, startDate, archived: b.archived };
}

export async function updateProject(id: string, input: UpdateProjectInput): Promise<ProjectDetail | null> {
  await requireCoordinacion();

  const exists = await prisma.project.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return null;

  await prisma.project.update({
    where: { id },
    data: {
      name: input.name,
      client: input.client,
      description: input.description,
      status: input.status,
      startDate: parseISODateInput(input.startDate),
      archived: input.archived,
    },
  });

  return getProject(id);
}

export async function getProjectDoc(projectId: string, docId: string): Promise<ProjectDocDetail | null> {
  await requireMember();

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { name: true } });
  if (!project) return null;

  const slot = parseDocSlot(docId);
  if (slot) {
    const doc = await prisma.document.findUnique({
      where: { projectId_slot: { projectId, slot } },
      include: { author: true },
    });
    if (doc?.filled) {
      return {
        title: docSlotName[slot],
        type: docSlotName[slot],
        badgeColor: docSlotBadgeColor[slot],
        author: doc.author?.name ?? "",
        date: doc.date ? formatDayMonthYear(doc.date) : "",
        content: doc.content ?? "",
      };
    }
  }

  const acta = await prisma.acta.findUnique({ where: { id: docId } });
  if (acta && acta.projectId === projectId) {
    return {
      title: acta.title,
      type: "Acta",
      badgeColor: "amber",
      author: "",
      date: formatDayMonth(acta.date),
      content: acta.content ?? "",
    };
  }

  return null;
}

// Un documento fijo se direcciona por su slot y un acta por su id, igual que en
// getProjectDoc. parent es de quién cuelgan sus versiones en DocVersion.
type DocTarget = {
  parent: { documentId: string } | { actaId: string };
  content: string;
  // Autor y fecha con que se registra el contenido actual si todavía no tiene versión.
  baseline: { authorId: string | null; date: Date };
};

async function findDocTarget(projectId: string, docId: string): Promise<DocTarget | null> {
  const slot = parseDocSlot(docId);
  if (slot) {
    const doc = await prisma.document.findUnique({ where: { projectId_slot: { projectId, slot } } });
    if (doc?.filled) {
      return {
        parent: { documentId: doc.id },
        content: doc.content ?? "",
        baseline: { authorId: doc.authorId, date: doc.date ?? new Date() },
      };
    }
  }

  const acta = await prisma.acta.findFirst({ where: { id: docId, projectId } });
  if (acta) {
    return { parent: { actaId: acta.id }, content: acta.content ?? "", baseline: { authorId: null, date: acta.date } };
  }

  return null;
}

export async function updateProjectDoc(projectId: string, docId: string, content: string): Promise<ProjectDocDetail | null> {
  const member = await requireMember();

  const target = await findDocTarget(projectId, docId);
  if (!target) return null;
  // Cada guardado con cambios es una versión; guardar lo mismo no registra nada.
  if (content === target.content) return getProjectDoc(projectId, docId);

  await prisma.$transaction(async (tx) => {
    if ("documentId" in target.parent) {
      await tx.document.update({ where: { id: target.parent.documentId }, data: { content } });
    } else {
      await tx.acta.update({ where: { id: target.parent.actaId }, data: { content } });
    }

    // Contenido que llegó sin pasar por aquí (el seed) queda como versión inicial, para que
    // este cambio tenga contra qué compararse. La migración hizo lo mismo con lo existente.
    const hasVersions = (await tx.docVersion.count({ where: target.parent })) > 0;
    if (!hasVersions && target.content.trim()) {
      const { authorId, date } = target.baseline;
      await tx.docVersion.create({ data: { ...target.parent, authorId, content: target.content, createdAt: date } });
    }

    await tx.docVersion.create({ data: { ...target.parent, authorId: member.id, content } });
  });

  return getProjectDoc(projectId, docId);
}

export async function getProjectDocVersions(projectId: string, docId: string): Promise<ProjectDocVersion[] | null> {
  await requireMember();

  const target = await findDocTarget(projectId, docId);
  if (!target) return null;

  const versions = await prisma.docVersion.findMany({
    where: target.parent,
    orderBy: { createdAt: "desc" },
    include: { author: { select: { name: true } } },
  });

  return versions.map((version) => ({
    id: version.id,
    author: version.author?.name ?? "",
    date: formatDateTime(version.createdAt),
    content: version.content,
  }));
}

type DocCommentRow = Prisma.DocCommentGetPayload<{ include: { author: { select: { name: true } } } }>;

function toDocComment(comment: DocCommentRow): ProjectDocComment {
  return {
    id: comment.id,
    author: comment.author?.name ?? "",
    date: formatDateTime(comment.createdAt),
    quote: comment.quote,
    occurrence: comment.occurrence,
    body: comment.body,
  };
}

export function parseCreateDocCommentInput(body: unknown): CreateDocCommentInput | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;

  // El fragmento se guarda tal cual: lo que se busca en el texto es justamente lo que se seleccionó.
  const quote = typeof b.quote === "string" ? b.quote : "";
  if (!quote.trim() || quote.length > MAX_QUOTE_LENGTH) return null;

  const occurrence = b.occurrence;
  if (typeof occurrence !== "number" || !Number.isInteger(occurrence) || occurrence < 0) return null;

  const text = typeof b.body === "string" ? b.body.trim() : "";
  if (!text || text.length > MAX_COMMENT_LENGTH) return null;

  return { quote, occurrence, body: text };
}

export async function getProjectDocComments(projectId: string, docId: string): Promise<ProjectDocComment[] | null> {
  await requireMember();

  const target = await findDocTarget(projectId, docId);
  if (!target) return null;

  const comments = await prisma.docComment.findMany({
    where: target.parent,
    orderBy: { createdAt: "asc" },
    include: { author: { select: { name: true } } },
  });

  return comments.map(toDocComment);
}

export async function createProjectDocComment(
  projectId: string,
  docId: string,
  input: CreateDocCommentInput,
): Promise<ProjectDocComment | null> {
  const member = await requireMember();

  const target = await findDocTarget(projectId, docId);
  if (!target) return null;

  const comment = await prisma.docComment.create({
    data: { ...target.parent, authorId: member.id, quote: input.quote, occurrence: input.occurrence, body: input.body },
    include: { author: { select: { name: true } } },
  });

  return toDocComment(comment);
}

/** Resolver un comentario es borrar su fila. false si no existe o es de otro documento. */
export async function resolveProjectDocComment(projectId: string, docId: string, commentId: string): Promise<boolean> {
  await requireMember();

  const target = await findDocTarget(projectId, docId);
  if (!target) return false;

  const { count } = await prisma.docComment.deleteMany({ where: { id: commentId, ...target.parent } });
  return count > 0;
}

export async function createProjectDoc(projectId: string, slotKey: string): Promise<ProjectDetail | null> {
  const member = await requireMember();

  const slot = parseDocSlot(slotKey);
  if (!slot) return null;

  const existing = await prisma.document.findUnique({ where: { projectId_slot: { projectId, slot } } });
  if (!existing || existing.filled) return null;

  await prisma.document.update({
    where: { projectId_slot: { projectId, slot } },
    data: { filled: true, date: new Date(), authorId: member.id },
  });

  return getProject(projectId);
}

export function parseCreateActaInput(body: unknown): CreateActaInput | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;

  const title = typeof b.title === "string" ? b.title.trim() : "";
  if (!title) return null;

  const date = typeof b.date === "string" ? b.date : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  return { title, date };
}

export async function createActa(projectId: string, input: CreateActaInput): Promise<ProjectDetail | null> {
  await requireMember();

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) return null;

  await prisma.acta.create({
    data: { projectId, title: input.title, date: parseISODateInput(input.date) },
  });

  return getProject(projectId);
}

export function parseCreateFeatureInput(body: unknown): CreateFeatureInput | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;

  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) return null;

  const priority = typeof b.priority === "string" ? b.priority : "";
  if (!(Object.values(Priority) as string[]).includes(priority)) return null;

  const description = typeof b.description === "string" ? b.description.trim() || null : null;

  const issueNumber = parseOptionalIssueNumber(b.issueNumber);
  if (issueNumber === undefined) return null;

  return { name, priority: priority as Priority, description, issueNumber };
}

async function renumberFeatureLabels(tx: Prisma.TransactionClient, projectId: string): Promise<void> {
  const remaining = await tx.feature.findMany({ where: { projectId }, select: { id: true, label: true } });
  remaining.sort((a, b) => labelNumber("F", a.label) - labelNumber("F", b.label));

  for (let i = 0; i < remaining.length; i++) {
    const label = formatLabel("F", i + 1);
    if (remaining[i].label !== label) {
      await tx.feature.update({ where: { id: remaining[i].id }, data: { label } });
    }
  }
}

export async function createFeature(projectId: string, input: CreateFeatureInput): Promise<ProjectDetail | null> {
  const member = await requireMember();

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) return null;

  const issueId = input.issueNumber ? await requireIssueId(projectId, input.issueNumber) : null;

  const existing = await prisma.feature.findMany({ where: { projectId }, select: { label: true } });
  const label = nextLabel("F", existing.map((f) => f.label));

  const create = prisma.feature.create({
    data: {
      projectId,
      label,
      name: input.name,
      priority: input.priority,
      status: "PENDIENTE",
      description: input.description,
      ...(issueId && { issues: { connect: { id: issueId } } }),
    },
  });
  // Crear ya vinculado a un issue es vincular: cuenta como actividad del issue.
  if (issueId) await prisma.$transaction([create, linkedIssueActivity(issueId, member.id)]);
  else await create;

  return getProject(projectId);
}

export function parseUpdateFeatureInput(body: unknown): UpdateFeatureInput | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;

  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) return null;

  const priority = typeof b.priority === "string" ? b.priority : "";
  if (!(Object.values(Priority) as string[]).includes(priority)) return null;

  const status = typeof b.status === "string" ? b.status : "";
  if (!(Object.values(FeatureStatus) as string[]).includes(status)) return null;

  const description = typeof b.description === "string" ? b.description.trim() || null : null;

  return { name, priority: priority as Priority, status: status as FeatureStatus, description };
}

export async function updateFeature(
  projectId: string,
  label: string,
  input: UpdateFeatureInput,
  token: string | null,
): Promise<ProjectDetail | null> {
  await requireMember();

  const id = (await resolveLabels(projectId, token)).featureId(label);
  if (!id) return null;

  const { count } = await prisma.feature.updateMany({
    where: { id },
    data: { name: input.name, priority: input.priority, status: input.status, description: input.description },
  });
  if (count === 0) return null;

  return getProject(projectId);
}

export async function deleteFeature(projectId: string, label: string, token: string | null): Promise<ProjectDetail | null> {
  await requireMember();

  const id = (await resolveLabels(projectId, token)).featureId(label);
  if (!id) return null;

  const deleted = await prisma.$transaction(async (tx) => {
    await tx.task.deleteMany({ where: { featureId: id } });
    const { count } = await tx.feature.deleteMany({ where: { id } });
    if (count === 0) return false;
    await renumberTaskLabels(tx, projectId);
    await renumberFeatureLabels(tx, projectId);
    return true;
  });
  if (!deleted) return null;

  return getProject(projectId);
}

export function parseCreateTaskInput(body: unknown): CreateTaskInput | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;

  const featureId = typeof b.featureId === "string" ? b.featureId.trim() || null : null;

  // Obligatorio aunque sea null: un PATCH de un cliente que no conoce el campo
  // desasignaría la tarea sin querer.
  const rawAssigneeId = b.assigneeId;
  if (rawAssigneeId !== null && typeof rawAssigneeId !== "string") return null;
  const assigneeId = rawAssigneeId?.trim() || null;

  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) return null;

  const type = typeof b.type === "string" ? b.type : "";
  if (!(Object.values(TaskType) as string[]).includes(type)) return null;

  const column = typeof b.column === "string" ? b.column : "";
  if (!(Object.values(KanbanColumn) as string[]).includes(column)) return null;

  const description = typeof b.description === "string" ? b.description.trim() || null : null;

  // Obligatoria aunque sea null (sin estimar), por lo mismo que assigneeId: un cliente que
  // no conoce el campo borraría la estimación al editar.
  const difficulty = b.difficulty;
  if (difficulty !== null && !(Object.values(TaskDifficulty) as unknown[]).includes(difficulty)) return null;

  const issueNumber = parseOptionalIssueNumber(b.issueNumber);
  if (issueNumber === undefined) return null;

  return {
    featureId,
    assigneeId,
    name,
    type: type as TaskType,
    column: column as KanbanColumn,
    description,
    difficulty: difficulty as TaskDifficulty | null,
    issueNumber,
  };
}

async function renumberTaskLabels(tx: Prisma.TransactionClient, projectId: string): Promise<void> {
  const remaining = await tx.task.findMany({ where: { projectId }, select: { id: true, label: true } });
  remaining.sort((a, b) => labelNumber("T", a.label) - labelNumber("T", b.label));

  for (let i = 0; i < remaining.length; i++) {
    const label = formatLabel("T", i + 1);
    if (remaining[i].label !== label) {
      await tx.task.update({ where: { id: remaining[i].id }, data: { label } });
    }
  }
}

// ─── Flujo de tareas ───
//
// En progreso y En revisión (WORK_COLUMNS) son las columnas en que alguien trabaja la tarea:
// para entrar a ellas tiene que tener asignado. Cada creación, cambio de columna o cambio de
// asignado queda en TaskTransition (src/lib/task-history.ts saca de ahí quién la trabajó y
// quién la revisó), y al sacarla de una de esas columnas quien la tenía puede registrar las
// horas que le dedicó.

function isWorkColumn(column: KanbanColumn): boolean {
  return WORK_COLUMNS.includes(column);
}

const ASSIGNEE_REQUIRED_MESSAGE = "Una tarea En progreso o En revisión tiene que tener a alguien asignado";

export async function createTask(
  projectId: string,
  input: CreateTaskInput,
  token: string | null,
): Promise<ProjectDetail | null> {
  const member = await requireMember();

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) return null;

  if (isWorkColumn(input.column) && !input.assigneeId) {
    throw new ApiError(422, "ASSIGNEE_REQUIRED", ASSIGNEE_REQUIRED_MESSAGE);
  }

  // Solo una tarea con feature referencia un label; sin feature no hay nada que validar.
  let featureId: string | null = null;
  if (input.featureId) {
    const resolved = (await resolveLabels(projectId, token)).featureId(input.featureId);
    if (!resolved) return null;
    featureId = resolved;
  }
  await assertAssignable(projectId, input.assigneeId);
  const issueId = input.issueNumber ? await requireIssueId(projectId, input.issueNumber) : null;

  const existing = await prisma.task.findMany({
    where: { projectId },
    select: { label: true },
  });
  const label = nextLabel("T", existing.map((t) => t.label));

  // La fila inicial del historial va como escritura anidada: Prisma la hace en la misma
  // transacción que la tarea.
  const create = prisma.task.create({
    data: {
      label,
      projectId,
      featureId,
      assigneeId: input.assigneeId,
      name: input.name,
      type: input.type,
      active: true,
      column: input.column,
      description: input.description,
      difficulty: input.difficulty,
      transitions: {
        create: { fromColumn: null, toColumn: input.column, assigneeId: input.assigneeId, byId: member.id },
      },
      ...(issueId && { issues: { connect: { id: issueId } } }),
    },
  });
  if (issueId) await prisma.$transaction([create, linkedIssueActivity(issueId, member.id)]);
  else await create;

  return getProject(projectId);
}

export function parseUpdateTaskInput(body: unknown): UpdateTaskInput | null {
  const base = parseCreateTaskInput(body);
  if (!base) return null;

  // El vínculo con issues no se edita por PATCH: tiene su propia ruta (setIssueLink).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { issueNumber, ...fields } = base;
  const b = body as Record<string, unknown>;
  const active = typeof b.active === "boolean" ? b.active : true;

  // Opcional. Si viene, con la misma validación que cualquier registro de horas.
  let timeSpent: UpdateTaskInput["timeSpent"] = null;
  if (b.timeSpent !== undefined && b.timeSpent !== null) {
    if (typeof b.timeSpent !== "object") return null;
    const minutes = (b.timeSpent as Record<string, unknown>).minutes;
    if (!isValidEntryMinutes(minutes)) return null;
    timeSpent = { minutes };
  }

  return { ...fields, active, timeSpent };
}

/**
 * Reglas del flujo para un cambio de `current` a `input` hecho por `memberId`. El asignado
 * que cuenta para las horas es el de antes del cambio: quien la tenía es quien la trabajó,
 * aunque al moverla se la pase a otra persona o la deje sin asignar.
 */
function assertTaskFlow(
  current: { column: KanbanColumn; assigneeId: string | null },
  input: UpdateTaskInput,
  memberId: string,
): void {
  const columnChanged = input.column !== current.column;
  const assigneeChanged = input.assigneeId !== current.assigneeId;

  // Una tarea antigua que ya estaba en una columna de trabajo sin asignado no se rechaza
  // mientras no cambie de columna ni de asignado.
  if ((columnChanged || assigneeChanged) && isWorkColumn(input.column) && !input.assigneeId) {
    throw new ApiError(422, "ASSIGNEE_REQUIRED", ASSIGNEE_REQUIRED_MESSAGE);
  }

  if (input.timeSpent) {
    if (!columnChanged || !isWorkColumn(current.column)) {
      throw new ApiError(
        422,
        "TIME_NOT_ALLOWED",
        "Las horas dedicadas se registran al sacar la tarea de En progreso o En revisión",
      );
    }
    if (current.assigneeId !== memberId) {
      throw new ApiError(422, "TIME_NOT_ALLOWED", "Solo quien tenía asignada la tarea puede registrar sus horas al moverla");
    }
  }
}

export async function updateTask(
  projectId: string,
  label: string,
  input: UpdateTaskInput,
  token: string | null,
  now: Date = new Date(),
): Promise<ProjectDetail | null> {
  const member = await requireMember();

  const labels = await resolveLabels(projectId, token);
  const id = labels.taskId(label);
  if (!id) return null;

  let featureId: string | null = null;
  if (input.featureId) {
    const resolved = labels.featureId(input.featureId);
    if (!resolved) return null;
    featureId = resolved;
  }

  // La columna y el asignado actuales deciden el historial y las horas: se leen y se
  // escriben en la misma transacción que el cambio.
  const updated = await prisma.$transaction(async (tx) => {
    const current = await tx.task.findUnique({ where: { id }, select: { column: true, assigneeId: true } });
    if (!current) return false;

    assertTaskFlow(current, input, member.id);
    const columnChanged = input.column !== current.column;
    const assigneeChanged = input.assigneeId !== current.assigneeId;
    if (assigneeChanged) await assertAssignable(projectId, input.assigneeId);

    await tx.task.update({
      where: { id },
      data: {
        featureId,
        assigneeId: input.assigneeId,
        name: input.name,
        type: input.type,
        column: input.column,
        active: input.active,
        description: input.description,
        difficulty: input.difficulty,
      },
    });

    if (columnChanged || assigneeChanged) {
      // Un cambio solo de asignado queda con fromColumn === toColumn.
      await tx.taskTransition.create({
        data: {
          taskId: id,
          fromColumn: current.column,
          toColumn: input.column,
          assigneeId: input.assigneeId,
          byId: member.id,
          at: now,
        },
      });
    }

    if (input.timeSpent) {
      await tx.timeEntry.create({
        data: {
          memberId: member.id,
          projectId,
          taskId: id,
          kind: current.column === KanbanColumn.PROGRESO ? TimeEntryKind.TRABAJO : TimeEntryKind.REVISION,
          date: dayKeyToDate(todayKey(now)),
          minutes: input.timeSpent.minutes,
          // El label de la descripción es el de este momento; /tiempo muestra el vigente (taskId).
          description: `${label} · ${input.name}`.slice(0, MAX_DESCRIPTION_LENGTH),
        },
      });
    }

    return true;
  });
  if (!updated) return null;

  return getProject(projectId, now);
}

export async function deleteTask(projectId: string, label: string, token: string | null): Promise<ProjectDetail | null> {
  await requireMember();

  const id = (await resolveLabels(projectId, token)).taskId(label);
  if (!id) return null;

  const deleted = await prisma.$transaction(async (tx) => {
    const { count } = await tx.task.deleteMany({ where: { id } });
    if (count === 0) return false;
    await renumberTaskLabels(tx, projectId);
    return true;
  });
  if (!deleted) return null;

  return getProject(projectId);
}

// ─── Vínculos con issues ───
//
// Muchos a muchos: una feature o tarea puede responder a varios issues y un issue
// originar varias. La feature o tarea se direcciona por label, así que exige el
// labelsToken como el resto; el issue va por número, que no se renumera.

/**
 * Vincula (linked = true) o desvincula una feature o tarea con el issue #issueNumber
 * del mismo proyecto. Vincular algo ya vinculado, o desvincular algo que no lo está,
 * no cambia nada. null si no existe la feature/tarea o el issue.
 */
export async function setIssueLink(
  projectId: string,
  kind: "feature" | "task",
  label: string,
  issueNumber: number,
  linked: boolean,
  token: string | null,
): Promise<ProjectDetail | null> {
  const member = await requireMember();

  const labels = await resolveLabels(projectId, token);
  const id = kind === "feature" ? labels.featureId(label) : labels.taskId(label);
  if (!id) return null;

  const issue = await prisma.issue.findUnique({
    where: { projectId_number: { projectId, number: issueNumber } },
    select: { id: true },
  });
  if (!issue) return null;

  const issues = linked ? { connect: { id: issue.id } } : { disconnect: { id: issue.id } };
  await prisma.$transaction([
    kind === "feature"
      ? prisma.feature.update({ where: { id }, data: { issues } })
      : prisma.task.update({ where: { id }, data: { issues } }),
    // Vincular o desvincular cuenta como actividad del issue (y lo deja revisado por quien lo hace).
    prisma.issue.update({ where: { id: issue.id }, data: ownActivity(issue.id, member.id, new Date()) }),
  ]);

  return getProject(projectId);
}

// ─── Equipo ───
//
// Componer el equipo es una decisión de proyecto, igual que editarlo: solo
// coordinación. La asignación de tareas, en cambio, la puede hacer cualquier
// miembro, pero restringida a quienes están en el equipo (assertAssignable).

export function parseAddProjectMemberInput(body: unknown): AddProjectMemberInput | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;

  const memberId = typeof b.memberId === "string" ? b.memberId.trim() : "";
  return memberId ? { memberId } : null;
}

export async function addProjectMember(projectId: string, input: AddProjectMemberInput): Promise<ProjectDetail | null> {
  await requireCoordinacion();

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) return null;

  const member = await prisma.member.findUnique({
    where: { id: input.memberId },
    select: { isVerifiedByCoordinator: true },
  });
  if (!member?.isVerifiedByCoordinator) {
    throw new ApiError(422, "INVALID_MEMBER", "El miembro no existe o su cuenta no está aprobada");
  }

  const existing = await prisma.projectMember.findUnique({
    where: { projectId_memberId: { projectId, memberId: input.memberId } },
    select: { memberId: true },
  });
  if (existing) throw new ApiError(409, "ALREADY_PROJECT_MEMBER", "Esa persona ya es parte del equipo");

  await prisma.projectMember.create({ data: { projectId, memberId: input.memberId } });

  return getProject(projectId);
}

/** Quitar a alguien del equipo también lo desasigna de las tareas de ese proyecto. */
export async function removeProjectMember(projectId: string, memberId: string): Promise<ProjectDetail | null> {
  await requireCoordinacion();

  const removed = await prisma.$transaction(async (tx) => {
    const { count } = await tx.projectMember.deleteMany({ where: { projectId, memberId } });
    if (count === 0) return false;
    await tx.task.updateMany({ where: { projectId, assigneeId: memberId }, data: { assigneeId: null } });
    return true;
  });
  if (!removed) return null;

  return getProject(projectId);
}
