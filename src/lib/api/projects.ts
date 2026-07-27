import { useQuery } from "@tanstack/react-query";
import type { BadgeColor } from "@/lib/types";

export interface ProjectListItem {
  id: string;
  name: string;
  client: string;
  area: string;
  description: string;
  status: string;
  statusColor: BadgeColor;
  progress: number;
  teamSize: number;
  startDate: string;
  archived: boolean;
}

export interface ProjectDoc {
  key: string;
  name: string;
  filled: boolean;
  author?: string;
  date?: string;
  icon: "clock" | "file" | "code" | "decision";
}

export interface ProjectActa {
  id: string;
  title: string;
  date: string;
}

export interface ProjectFeature {
  id: string;
  name: string;
  priority: "alta" | "media" | "baja";
  status: string;
  statusColor: BadgeColor;
  taskCount: number;
}

export interface ProjectTask {
  id: string;
  featureId: string;
  name: string;
  type: "feature" | "spike" | "fix" | "refactor" | "chore" | "docs";
  done: boolean;
  hasAssignee: boolean;
  column: "pendiente" | "progreso" | "revisar" | "revision" | "listo";
}

export interface ProjectDetail extends ProjectListItem {
  docs: ProjectDoc[];
  actas: ProjectActa[];
  features: ProjectFeature[];
  tasks: ProjectTask[];
}

export interface ProjectDocDetail {
  title: string;
  type: string;
  badgeColor: BadgeColor;
  author: string;
  date: string;
}

export const projectsKeys = {
  all: ["projects"] as const,
  list: () => [...projectsKeys.all, "list"] as const,
  detail: (id: string) => [...projectsKeys.all, "detail", id] as const,
  doc: (id: string, docId: string) => [...projectsKeys.all, "detail", id, "doc", docId] as const,
};

async function fetchProjects(): Promise<ProjectListItem[]> {
  const res = await fetch("/api/projects");
  if (!res.ok) throw new Error("No se pudo cargar la lista de proyectos");
  return res.json();
}

async function fetchProject(id: string): Promise<ProjectDetail | null> {
  const res = await fetch(`/api/projects/${id}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("No se pudo cargar el proyecto");
  return res.json();
}

async function fetchProjectDoc(id: string, docId: string): Promise<ProjectDocDetail | null> {
  const res = await fetch(`/api/projects/${id}/docs/${docId}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("No se pudo cargar el documento");
  return res.json();
}

export function useProjects() {
  return useQuery({ queryKey: projectsKeys.list(), queryFn: fetchProjects });
}

export function useProject(id: string) {
  return useQuery({ queryKey: projectsKeys.detail(id), queryFn: () => fetchProject(id) });
}

export function useProjectDoc(id: string, docId: string) {
  return useQuery({ queryKey: projectsKeys.doc(id, docId), queryFn: () => fetchProjectDoc(id, docId) });
}
