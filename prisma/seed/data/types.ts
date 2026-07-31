import type { BadgeColor } from "@/lib/api/status";

export interface DocSlot {
  key: string;
  name: string;
  filled: boolean;
  author?: string;
  date?: string;
  icon: "clock" | "file" | "code" | "decision";
}

export interface Acta {
  id: string;
  title: string;
  date: string;
}

export interface Feature {
  id: string;
  name: string;
  priority: "alta" | "media" | "baja";
  status: "Hecho" | "En progreso" | "Pendiente";
  statusColor: BadgeColor;
  taskCount: number;
}

export type TaskType = "feature" | "spike" | "fix" | "refactor" | "chore" | "docs";
export type KanbanColumn = "pendiente" | "progreso" | "revisar" | "revision" | "listo";

export interface ProjectTask {
  id: string;
  featureId: string;
  name: string;
  type: TaskType;
  done: boolean;
  assigneeAccent: boolean;
  column: KanbanColumn;
}

export interface Project {
  id: string;
  name: string;
  client: string;
  area: string;
  description: string;
  status: string;
  statusColor: BadgeColor;
  progress: number;
  prCount: number;
  color: string;
  teamLabel: string;
  clientLabel: string;
  teamSize: number;
  startDate: string;
  docs: DocSlot[];
  actas: Acta[];
  features: Feature[];
  tasks: ProjectTask[];
  archived?: boolean;
}

export interface MemberProject {
  projectId: string;
  projectName: string;
  role: string;
  status: string;
  statusColor: BadgeColor;
}

export interface Achievement {
  id: string;
  name: string;
  unlocked: boolean;
  color?: string;
  icon: "star" | "speech" | "bolt" | "file" | "lock";
}

export interface Standup {
  date: string;
  text: string;
}

export interface Member {
  id: string;
  name: string;
  initials: string;
  color: string;
  role: string;
  area: string;
  areaLabel: string;
  email: string;
  telegram: string;
  bday: string;
  joined: string;
  status: string;
  statusColor: BadgeColor;
  rankFilled: number;
  rankNumber: number;
  projectChips: { projectId: string; projectName: string; color: string }[];
  skills: string[];
  projects: MemberProject[];
  level: number;
  ranking: number;
  streak: number;
  achievements: Achievement[];
  standups: Standup[];
}
