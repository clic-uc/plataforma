import { DocSlotType } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { formatDayMonth, formatDayMonthYear, formatMonthYear } from "@/lib/api/format";
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
import type { ProjectDetail, ProjectDocDetail, ProjectListItem } from "@/lib/api/projects";

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
    progress: progressFromFeatures(project.features),
    teamSize: project.members.length,
    startDate: formatMonthYear(project.startDate),
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
    progress: progressFromFeatures(project.features),
    teamSize: project.members.length,
    startDate: formatMonthYear(project.startDate),
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
      status: featureStatusLabel[feature.status],
      statusColor: featureStatusColor[feature.status],
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
        title: `${docSlotName[slot]} — ${project.name}`,
        type: docSlotName[slot],
        badgeColor: docSlotBadgeColor[slot],
        author: doc.author?.name ?? "",
        date: doc.date ? formatDayMonthYear(doc.date) : "",
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
    };
  }

  return null;
}
