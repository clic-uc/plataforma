import {
  DocSlotType,
  EventKind,
  FeatureStatus,
  IssueCloseReason,
  IssueStatus,
  IssueType,
  KanbanColumn,
  MemberRole,
  MemberStatus,
  Priority,
  ProjectStatus,
  TaskType,
} from "@/generated/prisma/enums";
export type BadgeColor = "green" | "amber" | "gray" | "blue";

export const memberRoleLabel: Record<MemberRole, string> = {
  COORDINACION: "Coordinación",
  EQUIPO: "Equipo",
  ROOKIE: "Rookie",
};

export const memberStatusLabel: Record<MemberStatus, string> = {
  ACTIVO: "Activo",
  HIATUS: "Hiatus",
};

export const memberStatusColor: Record<MemberStatus, BadgeColor> = {
  ACTIVO: "green",
  HIATUS: "gray",
};

export const MEMBER_ROLE_OPTIONS: { value: MemberRole; label: string }[] = [
  { value: "ROOKIE", label: "Rookie" },
  { value: "EQUIPO", label: "Equipo" },
  { value: "COORDINACION", label: "Coordinación" },
];

export const MEMBER_STATUS_OPTIONS: { value: MemberStatus; label: string }[] = (
  Object.entries(memberStatusLabel) as [MemberStatus, string][]
).map(([value, label]) => ({ value, label }));

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

export const PROJECT_STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = (
  Object.entries(projectStatusLabel) as [ProjectStatus, string][]
).map(([value, label]) => ({ value, label }));

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

export const FEATURE_STATUS_OPTIONS: { value: FeatureStatus; label: string }[] = [
  { value: "PENDIENTE", label: "Pendiente" },
  { value: "EN_PROGRESO", label: "En progreso" },
  { value: "HECHO", label: "Hecho" },
];

export const priorityLabel: Record<Priority, "alta" | "media" | "baja"> = {
  ALTA: "alta",
  MEDIA: "media",
  BAJA: "baja",
};

export const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: "ALTA", label: "Alta" },
  { value: "MEDIA", label: "Media" },
  { value: "BAJA", label: "Baja" },
];

export const priorityColor: Record<"alta" | "media" | "baja", string> = {
  alta: "#dc4e2a",
  media: "#d4a853",
  baja: "#a09080",
};

export const taskTypeLabel: Record<TaskType, "feature" | "spike" | "fix" | "refactor" | "chore" | "docs"> = {
  FEATURE: "feature",
  SPIKE: "spike",
  FIX: "fix",
  REFACTOR: "refactor",
  CHORE: "chore",
  DOCS: "docs",
};

export const TASK_TYPE_OPTIONS: { value: TaskType; label: string }[] = [
  { value: "FEATURE", label: "Feature" },
  { value: "SPIKE", label: "Spike" },
  { value: "FIX", label: "Fix" },
  { value: "REFACTOR", label: "Refactor" },
  { value: "CHORE", label: "Chore" },
  { value: "DOCS", label: "Docs" },
];

export const kanbanColumnLabel: Record<KanbanColumn, "pendiente" | "progreso" | "revisar" | "revision" | "listo"> = {
  PENDIENTE: "pendiente",
  PROGRESO: "progreso",
  REVISAR: "revisar",
  REVISION: "revision",
  LISTO: "listo",
};

export const kanbanColumnValue: Record<"pendiente" | "progreso" | "revisar" | "revision" | "listo", KanbanColumn> = {
  pendiente: "PENDIENTE",
  progreso: "PROGRESO",
  revisar: "REVISAR",
  revision: "REVISION",
  listo: "LISTO",
};

export const KANBAN_COLUMN_OPTIONS: { value: KanbanColumn; label: string }[] = [
  { value: "PENDIENTE", label: "Pendiente" },
  { value: "PROGRESO", label: "En progreso" },
  { value: "REVISAR", label: "Por revisar" },
  { value: "REVISION", label: "En revisión" },
  { value: "LISTO", label: "Listo" },
];

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

/// Color de los eventos del calendario. Sin color libre, igual que proyectos: el
/// tipo decide, con la paleta de las badges más el acento (clases .cal-ev-*).
export type EventColor = "accent" | "green" | "amber" | "gray";

export const eventKindLabel: Record<EventKind, string> = {
  REUNION: "Reunión",
  ENTREGA: "Entrega",
  HITO: "Hito",
  OTRO: "Otro",
};

export const eventKindColor: Record<EventKind, EventColor> = {
  REUNION: "accent",
  ENTREGA: "amber",
  HITO: "green",
  OTRO: "gray",
};

export const EVENT_KIND_OPTIONS: { value: EventKind; label: string }[] = [
  { value: "REUNION", label: "Reunión" },
  { value: "ENTREGA", label: "Entrega" },
  { value: "HITO", label: "Hito" },
  { value: "OTRO", label: "Otro" },
];

export const issueStatusLabel: Record<IssueStatus, string> = {
  ABIERTO: "Abierto",
  CERRADO: "Cerrado",
};

export const issueStatusColor: Record<IssueStatus, BadgeColor> = {
  ABIERTO: "green",
  CERRADO: "gray",
};

export const issueTypeLabel: Record<IssueType, string> = {
  BUG: "Bug",
  IDEA: "Idea",
  PREGUNTA: "Pregunta",
};

export const ISSUE_TYPE_OPTIONS: { value: IssueType; label: string }[] = [
  { value: "BUG", label: "Bug" },
  { value: "IDEA", label: "Idea" },
  { value: "PREGUNTA", label: "Pregunta" },
];

export const issueCloseReasonLabel: Record<IssueCloseReason, string> = {
  RESUELTO: "Resuelto",
  DESCARTADO: "Descartado",
  DUPLICADO: "Duplicado",
};

export const ISSUE_CLOSE_REASON_OPTIONS: { value: IssueCloseReason; label: string }[] = [
  { value: "RESUELTO", label: "Resuelto" },
  { value: "DESCARTADO", label: "Descartado" },
  { value: "DUPLICADO", label: "Duplicado" },
];
