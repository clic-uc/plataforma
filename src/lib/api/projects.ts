import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FeatureStatus, KanbanColumn, Priority, ProjectStatus, TaskType } from "@/generated/prisma/enums";
import type { BadgeColor } from "@/lib/api/status";
import { assertOk } from "@/lib/api/http";

export interface ProjectListItem {
  id: string;
  name: string;
  client: string;
  area: string;
  description: string;
  status: string;
  statusColor: BadgeColor;
  statusValue: ProjectStatus;
  progress: number;
  teamSize: number;
  startDate: string;
  startDateISO: string;
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
  priorityValue: Priority;
  status: string;
  statusColor: BadgeColor;
  statusValue: FeatureStatus;
  taskCount: number;
}

export interface ProjectTask {
  id: string;
  featureId: string | null;
  name: string;
  type: "feature" | "spike" | "fix" | "refactor" | "chore" | "docs";
  typeValue: TaskType;
  done: boolean;
  hasAssignee: boolean;
  column: "pendiente" | "progreso" | "revisar" | "revision" | "listo";
  columnValue: KanbanColumn;
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
  content: string;
}

export interface UpdateProjectInput {
  name: string;
  client: string;
  area: string;
  description: string;
  status: ProjectStatus;
  startDate: string;
  archived: boolean;
}

export interface CreateProjectInput {
  name: string;
  client: string;
  area: string;
  description: string;
  status: ProjectStatus;
  startDate: string;
}

export interface CreateFeatureInput {
  name: string;
  priority: Priority;
}

export interface UpdateFeatureInput {
  name: string;
  priority: Priority;
  status: FeatureStatus;
}

export interface CreateTaskInput {
  featureId: string | null;
  name: string;
  type: TaskType;
  column: KanbanColumn;
}

export type UpdateTaskInput = CreateTaskInput;

export interface CreateActaInput {
  title: string;
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
  await assertOk(res, "No se pudo cargar la lista de proyectos");
  return res.json();
}

async function fetchProject(id: string): Promise<ProjectDetail | null> {
  const res = await fetch(`/api/projects/${id}`);
  if (res.status === 404) return null;
  await assertOk(res, "No se pudo cargar el proyecto");
  return res.json();
}

async function fetchProjectDoc(id: string, docId: string): Promise<ProjectDocDetail | null> {
  const res = await fetch(`/api/projects/${id}/docs/${docId}`);
  if (res.status === 404) return null;
  await assertOk(res, "No se pudo cargar el documento");
  return res.json();
}

async function createProjectRequest(input: CreateProjectInput): Promise<ProjectDetail> {
  const res = await fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  await assertOk(res, "No se pudo crear el proyecto");
  return res.json();
}

async function updateProjectRequest(id: string, input: UpdateProjectInput): Promise<ProjectDetail> {
  const res = await fetch(`/api/projects/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  await assertOk(res, "No se pudo guardar el proyecto");
  return res.json();
}

async function deleteProjectRequest(id: string): Promise<void> {
  const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
  await assertOk(res, "No se pudo eliminar el proyecto");
}

async function updateProjectDocRequest(id: string, docId: string, content: string): Promise<ProjectDocDetail> {
  const res = await fetch(`/api/projects/${id}/docs/${docId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  await assertOk(res, "No se pudo guardar el documento");
  return res.json();
}

async function createProjectDocRequest(id: string, docId: string): Promise<ProjectDetail> {
  const res = await fetch(`/api/projects/${id}/docs/${docId}`, { method: "POST" });
  await assertOk(res, "No se pudo crear el documento");
  return res.json();
}

async function createFeatureRequest(id: string, input: CreateFeatureInput): Promise<ProjectDetail> {
  const res = await fetch(`/api/projects/${id}/features`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  await assertOk(res, "No se pudo crear la feature");
  return res.json();
}

async function updateFeatureRequest(id: string, featureId: string, input: UpdateFeatureInput): Promise<ProjectDetail> {
  const res = await fetch(`/api/projects/${id}/features/${featureId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  await assertOk(res, "No se pudo guardar la feature");
  return res.json();
}

async function deleteFeatureRequest(id: string, featureId: string): Promise<ProjectDetail> {
  const res = await fetch(`/api/projects/${id}/features/${featureId}`, { method: "DELETE" });
  await assertOk(res, "No se pudo eliminar la feature");
  return res.json();
}

async function createTaskRequest(id: string, input: CreateTaskInput): Promise<ProjectDetail> {
  const res = await fetch(`/api/projects/${id}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  await assertOk(res, "No se pudo crear la tarea");
  return res.json();
}

async function updateTaskRequest(id: string, taskId: string, input: UpdateTaskInput): Promise<ProjectDetail> {
  const res = await fetch(`/api/projects/${id}/tasks/${taskId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  await assertOk(res, "No se pudo guardar la tarea");
  return res.json();
}

async function deleteTaskRequest(id: string, taskId: string): Promise<ProjectDetail> {
  const res = await fetch(`/api/projects/${id}/tasks/${taskId}`, { method: "DELETE" });
  await assertOk(res, "No se pudo eliminar la tarea");
  return res.json();
}

async function createActaRequest(id: string, input: CreateActaInput): Promise<ProjectDetail> {
  const res = await fetch(`/api/projects/${id}/actas`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  await assertOk(res, "No se pudo crear el acta");
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

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProjectInput) => createProjectRequest(input),
    onSuccess: (created) => {
      queryClient.setQueryData(projectsKeys.detail(created.id), created);
      queryClient.invalidateQueries({ queryKey: projectsKeys.list() });
    },
  });
}

export function useUpdateProject(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProjectInput) => updateProjectRequest(id, input),
    onSuccess: (updated) => {
      queryClient.setQueryData(projectsKeys.detail(id), updated);
      queryClient.invalidateQueries({ queryKey: projectsKeys.list() });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteProjectRequest(id),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: projectsKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: projectsKeys.list() });
    },
  });
}

export function useUpdateProjectDoc(id: string, docId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => updateProjectDocRequest(id, docId, content),
    onSuccess: (updated) => {
      queryClient.setQueryData(projectsKeys.doc(id, docId), updated);
    },
  });
}

export function useCreateProjectDoc(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (docId: string) => createProjectDocRequest(id, docId),
    onSuccess: (updated) => {
      queryClient.setQueryData(projectsKeys.detail(id), updated);
    },
  });
}

export function useCreateFeature(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateFeatureInput) => createFeatureRequest(id, input),
    onSuccess: (updated) => {
      queryClient.setQueryData(projectsKeys.detail(id), updated);
    },
  });
}

export function useUpdateFeature(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ featureId, input }: { featureId: string; input: UpdateFeatureInput }) =>
      updateFeatureRequest(id, featureId, input),
    onSuccess: (updated) => {
      queryClient.setQueryData(projectsKeys.detail(id), updated);
    },
  });
}

export function useDeleteFeature(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (featureId: string) => deleteFeatureRequest(id, featureId),
    onSuccess: (updated) => {
      queryClient.setQueryData(projectsKeys.detail(id), updated);
    },
  });
}

export function useCreateTask(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTaskInput) => createTaskRequest(id, input),
    onSuccess: (updated) => {
      queryClient.setQueryData(projectsKeys.detail(id), updated);
    },
  });
}

export function useUpdateTask(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, input }: { taskId: string; input: UpdateTaskInput }) =>
      updateTaskRequest(id, taskId, input),
    onSuccess: (updated) => {
      queryClient.setQueryData(projectsKeys.detail(id), updated);
    },
  });
}

export function useDeleteTask(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => deleteTaskRequest(id, taskId),
    onSuccess: (updated) => {
      queryClient.setQueryData(projectsKeys.detail(id), updated);
    },
  });
}

export function useCreateActa(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateActaInput) => createActaRequest(id, input),
    onSuccess: (updated) => {
      queryClient.setQueryData(projectsKeys.detail(id), updated);
    },
  });
}
