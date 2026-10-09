import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FeatureStatus, KanbanColumn, Priority, ProjectStatus, TaskType } from "@/generated/prisma/enums";
import { kanbanColumnLabel, type BadgeColor } from "@/lib/api/status";
import { ApiRequestError, assertOk } from "@/lib/api/http";
import { membersKeys } from "@/lib/api/members";

export interface ProjectTeamMember {
  id: string;
  name: string;
  initials: string;
  role: string;
}

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
  team: ProjectTeamMember[];
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
  description: string | null;
  taskCount: number;
}

export interface ProjectTask {
  id: string;
  featureId: string | null;
  name: string;
  type: "feature" | "spike" | "fix" | "refactor" | "chore" | "docs";
  typeValue: TaskType;
  done: boolean;
  assignee: { id: string; name: string; initials: string } | null;
  column: "pendiente" | "progreso" | "revisar" | "revision" | "listo";
  columnValue: KanbanColumn;
  active: boolean;
  description: string | null;
}

export interface ProjectDetail extends ProjectListItem {
  /**
   * Huella de qué entidad hay detrás de cada label (F-01, T-01) en este snapshot.
   * Los labels se renumeran al borrar, así que toda mutación que direcciona por
   * label la manda en If-Match y el servidor responde 412 si ya no coincide.
   */
  labelsToken: string;
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
  description: string | null;
}

export interface CreateTaskInput {
  featureId: string | null;
  /** Member.id; tiene que ser parte del equipo del proyecto. */
  assigneeId: string | null;
  name: string;
  type: TaskType;
  column: KanbanColumn;
}

export interface UpdateTaskInput extends CreateTaskInput {
  active: boolean;
  description: string | null;
}

export interface CreateActaInput {
  title: string;
  date: string;
}

export interface AddProjectMemberInput {
  memberId: string;
  role: string;
}

/** Input completo de PATCH para una tarea, partiendo de su estado actual. */
export function taskToUpdateInput(task: ProjectTask): UpdateTaskInput {
  return {
    featureId: task.featureId,
    assigneeId: task.assignee?.id ?? null,
    name: task.name,
    type: task.typeValue,
    column: task.columnValue,
    active: task.active,
    description: task.description,
  };
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

/** Precondición de las mutaciones que direccionan por label; ver ProjectDetail.labelsToken. */
function labelsHeaders(labelsToken: string): Record<string, string> {
  return { "If-Match": `"${labelsToken}"` };
}

async function updateFeatureRequest(
  id: string,
  featureId: string,
  input: UpdateFeatureInput,
  labelsToken: string,
): Promise<ProjectDetail> {
  const res = await fetch(`/api/projects/${id}/features/${featureId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...labelsHeaders(labelsToken) },
    body: JSON.stringify(input),
  });
  await assertOk(res, "No se pudo guardar la feature");
  return res.json();
}

async function deleteFeatureRequest(id: string, featureId: string, labelsToken: string): Promise<ProjectDetail> {
  const res = await fetch(`/api/projects/${id}/features/${featureId}`, {
    method: "DELETE",
    headers: labelsHeaders(labelsToken),
  });
  await assertOk(res, "No se pudo eliminar la feature");
  return res.json();
}

async function createTaskRequest(id: string, input: CreateTaskInput, labelsToken: string): Promise<ProjectDetail> {
  const res = await fetch(`/api/projects/${id}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...labelsHeaders(labelsToken) },
    body: JSON.stringify(input),
  });
  await assertOk(res, "No se pudo crear la tarea");
  return res.json();
}

async function updateTaskRequest(
  id: string,
  taskId: string,
  input: UpdateTaskInput,
  labelsToken: string,
): Promise<ProjectDetail> {
  const res = await fetch(`/api/projects/${id}/tasks/${taskId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...labelsHeaders(labelsToken) },
    body: JSON.stringify(input),
  });
  await assertOk(res, "No se pudo guardar la tarea");
  return res.json();
}

async function deleteTaskRequest(id: string, taskId: string, labelsToken: string): Promise<ProjectDetail> {
  const res = await fetch(`/api/projects/${id}/tasks/${taskId}`, {
    method: "DELETE",
    headers: labelsHeaders(labelsToken),
  });
  await assertOk(res, "No se pudo eliminar la tarea");
  return res.json();
}

async function addProjectMemberRequest(id: string, input: AddProjectMemberInput): Promise<ProjectDetail> {
  const res = await fetch(`/api/projects/${id}/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  await assertOk(res, "No se pudo agregar al miembro");
  return res.json();
}

async function updateProjectMemberRequest(id: string, memberId: string, role: string): Promise<ProjectDetail> {
  const res = await fetch(`/api/projects/${id}/members/${memberId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
  await assertOk(res, "No se pudo guardar el rol");
  return res.json();
}

async function removeProjectMemberRequest(id: string, memberId: string): Promise<ProjectDetail> {
  const res = await fetch(`/api/projects/${id}/members/${memberId}`, { method: "DELETE" });
  await assertOk(res, "No se pudo quitar al miembro");
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

export function useProject(id: string, options?: { enabled?: boolean }) {
  return useQuery({ queryKey: projectsKeys.detail(id), queryFn: () => fetchProject(id), ...options });
}

export function useProjectDoc(id: string, docId: string, options?: { enabled?: boolean }) {
  return useQuery({ queryKey: projectsKeys.doc(id, docId), queryFn: () => fetchProjectDoc(id, docId), ...options });
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

/**
 * Las mutaciones que direccionan features o tareas por label reciben el
 * labelsToken del snapshot del que salieron esos labels, no el del cache al
 * ejecutarse: un modal abierto antes de una renumeración tiene que fallar con
 * 412, no escribir sobre la entidad que ahora ocupa ese label. Cuando el
 * servidor responde LABELS_CHANGED se recarga el proyecto.
 */
function useLabelledMutationSupport(id: string) {
  const queryClient = useQueryClient();
  const key = projectsKeys.detail(id);
  return {
    queryClient,
    key,
    onLabelsError: (error: Error) => {
      if (error instanceof ApiRequestError && error.code === "LABELS_CHANGED") {
        queryClient.invalidateQueries({ queryKey: key });
      }
    },
  };
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
  const { queryClient, key, onLabelsError } = useLabelledMutationSupport(id);
  return useMutation({
    mutationFn: ({ featureId, input, labelsToken }: { featureId: string; input: UpdateFeatureInput; labelsToken: string }) =>
      updateFeatureRequest(id, featureId, input, labelsToken),
    onError: onLabelsError,
    onSuccess: (updated) => {
      queryClient.setQueryData(key, updated);
    },
  });
}

export function useDeleteFeature(id: string) {
  const { queryClient, key, onLabelsError } = useLabelledMutationSupport(id);
  return useMutation({
    mutationFn: ({ featureId, labelsToken }: { featureId: string; labelsToken: string }) =>
      deleteFeatureRequest(id, featureId, labelsToken),
    onError: onLabelsError,
    onSuccess: (updated) => {
      queryClient.setQueryData(key, updated);
    },
  });
}

export function useCreateTask(id: string) {
  const { queryClient, key, onLabelsError } = useLabelledMutationSupport(id);
  return useMutation({
    mutationFn: ({ input, labelsToken }: { input: CreateTaskInput; labelsToken: string }) =>
      createTaskRequest(id, input, labelsToken),
    onError: onLabelsError,
    onSuccess: (updated) => {
      queryClient.setQueryData(key, updated);
    },
  });
}

export function useUpdateTask(id: string) {
  const { queryClient, key, onLabelsError } = useLabelledMutationSupport(id);
  return useMutation({
    mutationFn: ({ taskId, input, labelsToken }: { taskId: string; input: UpdateTaskInput; labelsToken: string }) =>
      updateTaskRequest(id, taskId, input, labelsToken),
    onError: onLabelsError,
    onSuccess: (updated) => {
      queryClient.setQueryData(key, updated);
    },
  });
}

/** Moves a task between kanban columns, reflecting the change immediately and rolling back on failure. */
export function useMoveTask(id: string) {
  const { queryClient, key, onLabelsError } = useLabelledMutationSupport(id);
  return useMutation({
    mutationFn: ({ task, column, labelsToken }: { task: ProjectTask; column: KanbanColumn; labelsToken: string }) =>
      updateTaskRequest(id, task.id, { ...taskToUpdateInput(task), column }, labelsToken),
    onMutate: async ({ task, column }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ProjectDetail | null>(key);
      if (previous) {
        queryClient.setQueryData<ProjectDetail>(key, {
          ...previous,
          tasks: previous.tasks.map((t) =>
            t.id === task.id
              ? { ...t, columnValue: column, column: kanbanColumnLabel[column], done: column === "LISTO" }
              : t,
          ),
        });
      }
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      onLabelsError(error);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(key, updated);
    },
  });
}

export function useDeleteTask(id: string) {
  const { queryClient, key, onLabelsError } = useLabelledMutationSupport(id);
  return useMutation({
    mutationFn: ({ taskId, labelsToken }: { taskId: string; labelsToken: string }) =>
      deleteTaskRequest(id, taskId, labelsToken),
    onError: onLabelsError,
    onSuccess: (updated) => {
      queryClient.setQueryData(key, updated);
    },
  });
}

/** El equipo también se muestra en la lista de proyectos y en el perfil de cada miembro. */
function useTeamMutationSuccess(id: string) {
  const queryClient = useQueryClient();
  return (updated: ProjectDetail) => {
    queryClient.setQueryData(projectsKeys.detail(id), updated);
    queryClient.invalidateQueries({ queryKey: projectsKeys.list() });
    queryClient.invalidateQueries({ queryKey: membersKeys.all });
  };
}

export function useAddProjectMember(id: string) {
  const onSuccess = useTeamMutationSuccess(id);
  return useMutation({
    mutationFn: (input: AddProjectMemberInput) => addProjectMemberRequest(id, input),
    onSuccess,
  });
}

export function useUpdateProjectMember(id: string) {
  const onSuccess = useTeamMutationSuccess(id);
  return useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: string }) =>
      updateProjectMemberRequest(id, memberId, role),
    onSuccess,
  });
}

export function useRemoveProjectMember(id: string) {
  const onSuccess = useTeamMutationSuccess(id);
  return useMutation({
    mutationFn: (memberId: string) => removeProjectMemberRequest(id, memberId),
    onSuccess,
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
