import "server-only";

import { DocSlotType, FeatureStatus, KanbanColumn, Priority, ProjectStatus, TaskType } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireMember, requireCoordinacion } from "@/lib/auth/guards";
import { ApiError } from "@/lib/api/errors";
import { MAX_COMMENT_LENGTH, MAX_QUOTE_LENGTH } from "@/lib/comments";
import { formatLabel, labelNumber, labelsToken, matchesLabelsToken, nextLabel } from "@/lib/api/labels";
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
  ProjectTeamMember,
  UpdateFeatureInput,
  UpdateProjectInput,
  UpdateTaskInput,
} from "@/lib/api/projects";

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
    role: pm.role,
  }));
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
async function resolveLabels(projectId: string, token: string | null): Promise<ResolvedLabels> {
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
    area: project.area,
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

export async function getProject(id: string): Promise<ProjectDetail | null> {
  await requireMember();

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      members: teamInclude,
      features: { orderBy: { label: "asc" } },
      tasks: { orderBy: { label: "asc" }, include: { assignee: { select: { id: true, name: true } } } },
      documents: { include: { author: true } },
      actas: { orderBy: { date: "asc" } },
    },
  });
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
    area: project.area,
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
    })),
  };
}

export function parseCreateProjectInput(body: unknown): CreateProjectInput | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;

  const name = typeof b.name === "string" ? b.name.trim() : "";
  const client = typeof b.client === "string" ? b.client.trim() : "";
  const area = typeof b.area === "string" ? b.area.trim() : "";
  const description = typeof b.description === "string" ? b.description.trim() : "";
  if (!name || !client || !area || !description) return null;

  const status = typeof b.status === "string" ? b.status : "";
  if (!(Object.values(ProjectStatus) as string[]).includes(status)) return null;

  const startDate = typeof b.startDate === "string" ? b.startDate : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return null;

  return { name, client, area, description, status: status as ProjectStatus, startDate };
}

export async function createProject(input: CreateProjectInput): Promise<ProjectDetail> {
  await requireCoordinacion();

  const project = await prisma.project.create({
    data: {
      name: input.name,
      client: input.client,
      area: input.area,
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
  const area = typeof b.area === "string" ? b.area.trim() : "";
  const description = typeof b.description === "string" ? b.description.trim() : "";
  if (!name || !client || !area || !description) return null;

  const status = typeof b.status === "string" ? b.status : "";
  if (!(Object.values(ProjectStatus) as string[]).includes(status)) return null;

  const startDate = typeof b.startDate === "string" ? b.startDate : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return null;

  if (typeof b.archived !== "boolean") return null;

  return { name, client, area, description, status: status as ProjectStatus, startDate, archived: b.archived };
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
      area: input.area,
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

  return { name, priority: priority as Priority };
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
  await requireMember();

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) return null;

  const existing = await prisma.feature.findMany({ where: { projectId }, select: { label: true } });
  const label = nextLabel("F", existing.map((f) => f.label));

  await prisma.feature.create({
    data: { projectId, label, name: input.name, priority: input.priority, status: "PENDIENTE" },
  });

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

  return { featureId, assigneeId, name, type: type as TaskType, column: column as KanbanColumn };
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

export async function createTask(
  projectId: string,
  input: CreateTaskInput,
  token: string | null,
): Promise<ProjectDetail | null> {
  await requireMember();

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) return null;

  // Solo una tarea con feature referencia un label; sin feature no hay nada que validar.
  let featureId: string | null = null;
  if (input.featureId) {
    const resolved = (await resolveLabels(projectId, token)).featureId(input.featureId);
    if (!resolved) return null;
    featureId = resolved;
  }
  await assertAssignable(projectId, input.assigneeId);

  const existing = await prisma.task.findMany({
    where: { projectId },
    select: { label: true },
  });
  const label = nextLabel("T", existing.map((t) => t.label));

  await prisma.task.create({
    data: {
      label,
      projectId,
      featureId,
      assigneeId: input.assigneeId,
      name: input.name,
      type: input.type,
      active: true,
      column: input.column,
    },
  });

  return getProject(projectId);
}

export function parseUpdateTaskInput(body: unknown): UpdateTaskInput | null {
  const base = parseCreateTaskInput(body);
  if (!base) return null;

  const b = body as Record<string, unknown>;
  const active = typeof b.active === "boolean" ? b.active : true;
  const description = typeof b.description === "string" ? b.description.trim() || null : null;

  return { ...base, active, description };
}

export async function updateTask(
  projectId: string,
  label: string,
  input: UpdateTaskInput,
  token: string | null,
): Promise<ProjectDetail | null> {
  await requireMember();

  const labels = await resolveLabels(projectId, token);
  const id = labels.taskId(label);
  if (!id) return null;

  let featureId: string | null = null;
  if (input.featureId) {
    const resolved = labels.featureId(input.featureId);
    if (!resolved) return null;
    featureId = resolved;
  }

  const current = await prisma.task.findUnique({ where: { id }, select: { assigneeId: true } });
  if (!current) return null;
  if (input.assigneeId !== current.assigneeId) await assertAssignable(projectId, input.assigneeId);

  const { count } = await prisma.task.updateMany({
    where: { id },
    data: {
      featureId,
      assigneeId: input.assigneeId,
      name: input.name,
      type: input.type,
      column: input.column,
      active: input.active,
      description: input.description,
    },
  });
  if (count === 0) return null;

  return getProject(projectId);
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

// ─── Equipo ───
//
// Componer el equipo es una decisión de proyecto, igual que editarlo: solo
// coordinación. La asignación de tareas, en cambio, la puede hacer cualquier
// miembro, pero restringida a quienes están en el equipo (assertAssignable).

const MAX_ROLE_LENGTH = 60;

function parseRole(value: unknown): string | null {
  const role = typeof value === "string" ? value.trim() : "";
  return role && role.length <= MAX_ROLE_LENGTH ? role : null;
}

export function parseAddProjectMemberInput(body: unknown): AddProjectMemberInput | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;

  const memberId = typeof b.memberId === "string" ? b.memberId.trim() : "";
  const role = parseRole(b.role);
  if (!memberId || !role) return null;

  return { memberId, role };
}

export function parseUpdateProjectMemberInput(body: unknown): { role: string } | null {
  if (typeof body !== "object" || body === null) return null;
  const role = parseRole((body as Record<string, unknown>).role);
  return role ? { role } : null;
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

  await prisma.projectMember.create({ data: { projectId, memberId: input.memberId, role: input.role } });

  return getProject(projectId);
}

export async function updateProjectMemberRole(
  projectId: string,
  memberId: string,
  role: string,
): Promise<ProjectDetail | null> {
  await requireCoordinacion();

  const { count } = await prisma.projectMember.updateMany({ where: { projectId, memberId }, data: { role } });
  if (count === 0) return null;

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
