import { DocSlotType, FeatureStatus, Priority, ProjectStatus } from "@/generated/prisma/enums";
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
  CreateFeatureInput,
  ProjectDetail,
  ProjectDocDetail,
  ProjectListItem,
  UpdateFeatureInput,
  UpdateProjectInput,
} from "@/lib/api/projects";

const SLOT_ORDER: DocSlotType[] = [
  DocSlotType.KICKOFF,
  DocSlotType.REQUERIMIENTOS,
  DocSlotType.TECNICO,
  DocSlotType.DECISIONES,
  DocSlotType.INFORME,
];

function progressFromFeatures(features: { tasks: { done: boolean }[] }[]): number {
  const tasks = features.flatMap((f) => f.tasks);
  if (tasks.length === 0) return 0;
  const done = tasks.filter((t) => t.done).length;
  return Math.round((done / tasks.length) * 100);
}

export async function getProjects(): Promise<ProjectListItem[]> {
  const projects = await prisma.project.findMany({
    orderBy: { startDate: "desc" },
    include: {
      members: true,
      features: { include: { tasks: true } },
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
    progress: progressFromFeatures(project.features),
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
      features: { include: { tasks: { orderBy: { label: "asc" } } }, orderBy: { label: "asc" } },
      documents: { include: { author: true } },
      actas: { orderBy: { date: "asc" } },
    },
  });
  if (!project) return null;

  return {
    id: project.id,
    name: project.name,
    client: project.client,
    area: project.area,
    description: project.description,
    status: projectStatusLabel[project.status],
    statusColor: projectStatusColor[project.status],
    statusValue: project.status,
    progress: progressFromFeatures(project.features),
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
      taskCount: feature.tasks.length,
    })),
    tasks: project.features.flatMap((feature) =>
      feature.tasks.map((task) => ({
        id: task.label,
        featureId: feature.label,
        name: task.name,
        type: taskTypeLabel[task.type],
        done: task.done,
        hasAssignee: task.assigneeId !== null,
        column: kanbanColumnLabel[task.column],
      })),
    ),
  };
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

  const upperDocId = docId.toUpperCase();
  if ((Object.values(DocSlotType) as string[]).includes(upperDocId)) {
    const slot = upperDocId as DocSlotType;
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
  const upperDocId = docId.toUpperCase();
  if ((Object.values(DocSlotType) as string[]).includes(upperDocId)) {
    const slot = upperDocId as DocSlotType;
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
  const upperSlot = slotKey.toUpperCase();
  if (!(Object.values(DocSlotType) as string[]).includes(upperSlot)) return null;
  const slot = upperSlot as DocSlotType;

  const existing = await prisma.document.findUnique({ where: { projectId_slot: { projectId, slot } } });
  if (!existing || existing.filled) return null;

  await prisma.document.update({
    where: { projectId_slot: { projectId, slot } },
    data: { filled: true, date: new Date() },
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

function nextFeatureLabel(existingLabels: string[]): string {
  const nextNumber = existingLabels.reduce((max, label) => {
    const match = /^F-(\d+)$/.exec(label);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0) + 1;
  return `F-${String(nextNumber).padStart(2, "0")}`;
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

  return { name, priority: priority as Priority, status: status as FeatureStatus };
}

export async function updateFeature(projectId: string, label: string, input: UpdateFeatureInput): Promise<ProjectDetail | null> {
  const existing = await prisma.feature.findUnique({ where: { projectId_label: { projectId, label } } });
  if (!existing) return null;

  await prisma.feature.update({
    where: { projectId_label: { projectId, label } },
    data: { name: input.name, priority: input.priority, status: input.status },
  });

  return getProject(projectId);
}

export async function deleteFeature(projectId: string, label: string): Promise<ProjectDetail | null> {
  const existing = await prisma.feature.findUnique({ where: { projectId_label: { projectId, label } } });
  if (!existing) return null;

  await prisma.task.deleteMany({ where: { featureId: existing.id } });
  await prisma.feature.delete({ where: { projectId_label: { projectId, label } } });

  return getProject(projectId);
}
