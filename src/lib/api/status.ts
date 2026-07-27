import {
  DocSlotType,
  FeatureStatus,
  KanbanColumn,
  MemberStatus,
  Priority,
  ProjectStatus,
  TaskType,
} from "@/generated/prisma/enums";
import type { BadgeColor } from "@/lib/types";

export const memberStatusLabel: Record<MemberStatus, string> = {
  ACTIVO: "Activo",
  HIATUS: "Hiatus",
};

export const memberStatusColor: Record<MemberStatus, BadgeColor> = {
  ACTIVO: "green",
  HIATUS: "gray",
};

export const projectStatusLabel: Record<ProjectStatus, string> = {
  ACTIVO: "Activo",
  EN_PAUSA: "En pausa",
  PLANIFICACION: "Planificación",
  DESARROLLO: "Desarrollo",
  TRASPASO: "Traspaso",
};

export const projectStatusColor: Record<ProjectStatus, BadgeColor> = {
  ACTIVO: "green",
  EN_PAUSA: "amber",
  PLANIFICACION: "gray",
  DESARROLLO: "blue",
  TRASPASO: "blue",
};

export const featureStatusLabel: Record<FeatureStatus, string> = {
  HECHO: "Hecho",
  EN_PROGRESO: "En progreso",
  PENDIENTE: "Pendiente",
};

export const featureStatusColor: Record<FeatureStatus, BadgeColor> = {
  HECHO: "green",
  EN_PROGRESO: "blue",
  PENDIENTE: "gray",
};

export const priorityLabel: Record<Priority, "alta" | "media" | "baja"> = {
  ALTA: "alta",
  MEDIA: "media",
  BAJA: "baja",
};

export const taskTypeLabel: Record<TaskType, "feature" | "spike" | "fix" | "refactor" | "chore" | "docs"> = {
  FEATURE: "feature",
  SPIKE: "spike",
  FIX: "fix",
  REFACTOR: "refactor",
  CHORE: "chore",
  DOCS: "docs",
};

export const kanbanColumnLabel: Record<KanbanColumn, "pendiente" | "progreso" | "revisar" | "revision" | "listo"> = {
  PENDIENTE: "pendiente",
  PROGRESO: "progreso",
  REVISAR: "revisar",
  REVISION: "revision",
  LISTO: "listo",
};

export const docSlotName: Record<DocSlotType, string> = {
  KICKOFF: "Kickoff",
  REQUERIMIENTOS: "Requerimientos",
  TECNICO: "Técnico",
  DECISIONES: "Decisiones",
  INFORME: "Informe",
};

export const docSlotIcon: Record<DocSlotType, "clock" | "file" | "code" | "decision"> = {
  KICKOFF: "clock",
  REQUERIMIENTOS: "file",
  TECNICO: "code",
  DECISIONES: "decision",
  INFORME: "file",
};

export const docSlotBadgeColor: Record<DocSlotType, BadgeColor> = {
  KICKOFF: "blue",
  REQUERIMIENTOS: "green",
  TECNICO: "blue",
  DECISIONES: "gray",
  INFORME: "gray",
};
