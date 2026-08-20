import { DocSlotType, FeatureStatus, KanbanColumn, Priority, ProjectStatus, TaskType } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { formatDayMonth, formatDayMonthYear, formatMonthYear, parseISODateInput, toISODateInput } from "@/lib/api/format";
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
  CreateActaInput,
  CreateFeatureInput,
  CreateProjectInput,
  CreateTaskInput,
  ProjectDetail,
  ProjectDocDetail,
  ProjectListItem,
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

export async function getProjects(): Promise<ProjectListItem[]> {
  const projects = await prisma.project.findMany({
    orderBy: { startDate: "desc" },
    include: {
      members: true,
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
    startDate: formatMonthYear(project.startDate),
    startDateISO: toISODateInput(project.startDate),
    archived: project.archived,
  }));
}

export async function getProject(id: string): Promise<ProjectDetail | null> {
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      members: true,
      features: { orderBy: { label: "asc" } },
      tasks: { orderBy: { label: "asc" } },
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
    startDate: formatMonthYear(project.startDate),
    startDateISO: toISODateInput(project.startDate),
    archived: project.archived,
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
      hasAssignee: task.assigneeId !== null,
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
  const exists = await prisma.project.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return false;

  await prisma.$transaction([
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

export async function updateProjectDoc(projectId: string, docId: string, content: string): Promise<ProjectDocDetail | null> {
  const slot = parseDocSlot(docId);
  if (slot) {
    const existing = await prisma.document.findUnique({ where: { projectId_slot: { projectId, slot } } });
    if (existing?.filled) {
      await prisma.document.update({ where: { projectId_slot: { projectId, slot } }, data: { content } });
      return getProjectDoc(projectId, docId);
    }
  }

  const acta = await prisma.acta.findFirst({ where: { id: docId, projectId } });
  if (acta) {
    await prisma.acta.update({ where: { id: docId }, data: { content } });
    return getProjectDoc(projectId, docId);
  }

  return null;
}

export async function createProjectDoc(projectId: string, slotKey: string): Promise<ProjectDetail | null> {
  const slot = parseDocSlot(slotKey);
  if (!slot) return null;

  const existing = await prisma.document.findUnique({ where: { projectId_slot: { projectId, slot } } });
  if (!existing || existing.filled) return null;

  await prisma.document.update({
    where: { projectId_slot: { projectId, slot } },
    data: { filled: true, date: new Date() },
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

function labelNumber(prefix: string, label: string): number {
  const match = new RegExp(`^${prefix}-(\\d+)$`).exec(label);
  return match ? Number(match[1]) : 0;
}

function nextFeatureLabel(existingLabels: string[]): string {
  const nextNumber = existingLabels.reduce((max, label) => Math.max(max, labelNumber("F", label)), 0) + 1;
  return `F-${String(nextNumber).padStart(2, "0")}`;
}

async function renumberFeatureLabels(tx: Prisma.TransactionClient, projectId: string): Promise<void> {
  const remaining = await tx.feature.findMany({ where: { projectId }, select: { id: true, label: true } });
  remaining.sort((a, b) => labelNumber("F", a.label) - labelNumber("F", b.label));

  for (let i = 0; i < remaining.length; i++) {
    const label = `F-${String(i + 1).padStart(2, "0")}`;
    if (remaining[i].label !== label) {
      await tx.feature.update({ where: { id: remaining[i].id }, data: { label } });
    }
  }
}

export async function createFeature(projectId: string, input: CreateFeatureInput): Promise<ProjectDetail | null> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) return null;

  const existing = await prisma.feature.findMany({ where: { projectId }, select: { label: true } });
  const label = nextFeatureLabel(existing.map((f) => f.label));

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

export async function updateFeature(projectId: string, label: string, input: UpdateFeatureInput): Promise<ProjectDetail | null> {
  const existing = await prisma.feature.findUnique({ where: { projectId_label: { projectId, label } } });
  if (!existing) return null;

  await prisma.feature.update({
    where: { projectId_label: { projectId, label } },
    data: { name: input.name, priority: input.priority, status: input.status, description: input.description },
  });

  return getProject(projectId);
}

export async function deleteFeature(projectId: string, label: string): Promise<ProjectDetail | null> {
  const existing = await prisma.feature.findUnique({ where: { projectId_label: { projectId, label } } });
  if (!existing) return null;

  await prisma.$transaction(async (tx) => {
    await tx.task.deleteMany({ where: { featureId: existing.id } });
    await tx.feature.delete({ where: { projectId_label: { projectId, label } } });
    await renumberTaskLabels(tx, projectId);
    await renumberFeatureLabels(tx, projectId);
  });

  return getProject(projectId);
}

export function parseCreateTaskInput(body: unknown): CreateTaskInput | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;

  const featureId = typeof b.featureId === "string" ? b.featureId.trim() || null : null;

  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) return null;

  const type = typeof b.type === "string" ? b.type : "";
  if (!(Object.values(TaskType) as string[]).includes(type)) return null;

  const column = typeof b.column === "string" ? b.column : "";
  if (!(Object.values(KanbanColumn) as string[]).includes(column)) return null;

  return { featureId, name, type: type as TaskType, column: column as KanbanColumn };
}

function nextTaskLabel(existingLabels: string[]): string {
  const nextNumber = existingLabels.reduce((max, label) => Math.max(max, labelNumber("T", label)), 0) + 1;
  return `T-${String(nextNumber).padStart(2, "0")}`;
}

async function renumberTaskLabels(tx: Prisma.TransactionClient, projectId: string): Promise<void> {
  const remaining = await tx.task.findMany({ where: { projectId }, select: { id: true, label: true } });
  remaining.sort((a, b) => labelNumber("T", a.label) - labelNumber("T", b.label));

  for (let i = 0; i < remaining.length; i++) {
    const label = `T-${String(i + 1).padStart(2, "0")}`;
    if (remaining[i].label !== label) {
      await tx.task.update({ where: { id: remaining[i].id }, data: { label } });
    }
  }
}

export async function createTask(projectId: string, input: CreateTaskInput): Promise<ProjectDetail | null> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) return null;

  let featureId: string | null = null;
  if (input.featureId) {
    const feature = await prisma.feature.findUnique({
      where: { projectId_label: { projectId, label: input.featureId } },
    });
    if (!feature) return null;
    featureId = feature.id;
  }

  const existing = await prisma.task.findMany({
    where: { projectId },
    select: { label: true },
  });
  const label = nextTaskLabel(existing.map((t) => t.label));

  await prisma.task.create({
    data: {
      label,
      projectId,
      featureId,
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

export async function updateTask(projectId: string, label: string, input: UpdateTaskInput): Promise<ProjectDetail | null> {
  const existing = await prisma.task.findUnique({ where: { projectId_label: { projectId, label } } });
  if (!existing) return null;

  let featureId: string | null = null;
  if (input.featureId) {
    const feature = await prisma.feature.findUnique({
      where: { projectId_label: { projectId, label: input.featureId } },
    });
    if (!feature) return null;
    featureId = feature.id;
  }

  await prisma.task.update({
    where: { projectId_label: { projectId, label } },
    data: {
      featureId,
      name: input.name,
      type: input.type,
      column: input.column,
      active: input.active,
      description: input.description,
    },
  });

  return getProject(projectId);
}

export async function deleteTask(projectId: string, label: string): Promise<ProjectDetail | null> {
  const existing = await prisma.task.findUnique({ where: { projectId_label: { projectId, label } } });
  if (!existing) return null;

  await prisma.$transaction(async (tx) => {
    await tx.task.delete({ where: { projectId_label: { projectId, label } } });
    await renumberTaskLabels(tx, projectId);
  });

  return getProject(projectId);
}
