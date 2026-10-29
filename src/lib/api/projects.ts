import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FeatureStatus, KanbanColumn, Priority, ProjectStatus, TaskDifficulty, TaskType } from "@/generated/prisma/enums";
import { kanbanColumnLabel, type BadgeColor } from "@/lib/api/status";
import { ApiRequestError, assertOk, errorMessage, LABELS_TOKEN_HEADER } from "@/lib/api/http";
import { membersKeys } from "@/lib/api/members";
import { timeEntriesKeys } from "@/lib/api/tiempo";
import { dashboardKeys } from "@/lib/api/dashboard";

export interface ProjectTeamMember {
  id: string;
  name: string;
  initials: string;
}

export interface ProjectListItem {
  id: string;
  name: string;
  client: string;
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
  /** Números de los issues vinculados (#12), de menor a mayor. */
  issues: number[];
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
  /** Números de los issues vinculados (#12), de menor a mayor. */
  issues: number[];
  /** null = sin estimar. */
  difficulty: TaskDifficulty | null;
  /** Resumen de TaskTransition (src/lib/task-history.ts). Duraciones de calendario, no esfuerzo. */
  history: ProjectTaskHistory;
}

export interface ProjectTaskHistory {
  createdAt: string;
  /** Asignados mientras estuvo En progreso / En revisión, en orden de aparición. */
  workedBy: { id: string; name: string }[];
  reviewedBy: { id: string; name: string }[];
  /** Milisegundos acumulados por columna; la columna actual cuenta hasta el momento de la lectura. */
  columnMs: Partial<Record<KanbanColumn, number>>;
  /** Última llegada a Listo, si sigue ahí. */
  completedAt: string | null;
  /** Primera entrada a En progreso → llegada a Listo (summarizeTaskHistory), si terminó. */
  cycleMs: number | null;
  /** Horas dedicadas registradas desde esta tarea (TimeEntry.taskId), de todas las personas. */
  minutesWorked: number;
  minutesReviewed: number;
}

/**
 * Columnas en las que una tarea tiene que tener asignado: entrar a ellas sin asignado
 * responde 422 ASSIGNEE_REQUIRED. Quien la tiene asignada al salir de una de ellas puede
 * registrar las horas que le dedicó (UpdateTaskInput.timeSpent).
 */
export const WORK_COLUMNS: readonly KanbanColumn[] = ["PROGRESO", "REVISION"];

/** Tarea asignada al miembro actual, con el proyecto al que pertenece. */
export interface AssignedTask {
  project: { id: string; name: string };
  id: string;
  featureId: string | null;
  name: string;
  typeValue: TaskType;
  columnValue: KanbanColumn;
  active: boolean;
  description: string | null;
  /** null = sin estimar. */
  difficulty: TaskDifficulty | null;
}

export interface ProjectDetail extends ProjectListItem {
  /**
   * Huella de qué entidad hay detrás de cada label (F-01, T-01) en este snapshot.
   * Los labels se renumeran al borrar, así que toda mutación que direcciona por
   * label la manda en X-Labels-Token y el servidor responde 412 si ya no coincide.
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

export interface ProjectDocVersion {
  id: string;
  /** Vacío en una versión sin autor: la inicial de un acta o la de un miembro eliminado. */
  author: string;
  date: string;
  content: string;
}

export interface ProjectDocComment {
  id: string;
  /** Vacío si el autor ya no existe. */
  author: string;
  date: string;
  /** Texto de la vista previa al que se ancla; ver src/lib/comments.ts. */
  quote: string;
  occurrence: number;
  body: string;
}

export interface CreateDocCommentInput {
  quote: string;
  occurrence: number;
  body: string;
}

export interface UpdateProjectInput {
  name: string;
  client: string;
  description: string;
  status: ProjectStatus;
  startDate: string;
  archived: boolean;
}

export interface CreateProjectInput {
  name: string;
  client: string;
  description: string;
  status: ProjectStatus;
  startDate: string;
}

export interface CreateFeatureInput {
  name: string;
  priority: Priority;
  description: string | null;
  /** Issue del que sale; queda vinculado. */
  issueNumber: number | null;
}

export interface UpdateFeatureInput {
  name: string;
  priority: Priority;
  status: FeatureStatus;
  description: string | null;
}

interface TaskFields {
  featureId: string | null;
  /** Member.id; tiene que ser parte del equipo del proyecto. */
  assigneeId: string | null;
  name: string;
  type: TaskType;
  column: KanbanColumn;
  description: string | null;
  /** Obligatorio aunque sea null, como assigneeId. */
  difficulty: TaskDifficulty | null;
}

export interface CreateTaskInput extends TaskFields {
  /** Issue del que sale; queda vinculado. */
  issueNumber: number | null;
}

export interface UpdateTaskInput extends TaskFields {
  active: boolean;
  /**
   * Horas dedicadas por quien hace el cambio, al sacar la tarea de En progreso (TRABAJO) o
   * En revisión (REVISION). Solo se aceptan si la columna cambia desde una de esas dos y quien
   * envía es el asignado en ese momento (si no, 422 TIME_NOT_ALLOWED). Crea un TimeEntry suyo
   * con fecha de hoy (Chile), vinculado a la tarea, en la misma transacción. Minutos en pasos
   * de 15, entre 15 y 24 h, como cualquier TimeEntry.
   */
  timeSpent?: { minutes: number } | null;
}

export interface CreateActaInput {
  title: string;
  date: string;
}

export interface AddProjectMemberInput {
  memberId: string;
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
    difficulty: task.difficulty,
  };
}

export const projectsKeys = {
  all: ["projects"] as const,
  list: () => [...projectsKeys.all, "list"] as const,
  detail: (id: string) => [...projectsKeys.all, "detail", id] as const,
  doc: (id: string, docId: string) => [...projectsKeys.all, "detail", id, "doc", docId] as const,
  docVersions: (id: string, docId: string) => [...projectsKeys.doc(id, docId), "versions"] as const,
  docComments: (id: string, docId: string) => [...projectsKeys.doc(id, docId), "comments"] as const,
  issues: (id: string) => [...projectsKeys.detail(id), "issues"] as const,
  issue: (id: string, number: number) => [...projectsKeys.issues(id), number] as const,
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

async function fetchProjectDocVersions(id: string, docId: string): Promise<ProjectDocVersion[]> {
  const res = await fetch(`/api/projects/${id}/docs/${docId}/versions`);
  await assertOk(res, "No se pudo cargar el historial");
  return res.json();
}

async function fetchProjectDocComments(id: string, docId: string): Promise<ProjectDocComment[]> {
  const res = await fetch(`/api/projects/${id}/docs/${docId}/comments`);
  await assertOk(res, "No se pudieron cargar los comentarios");
  return res.json();
}

async function createDocCommentRequest(id: string, docId: string, input: CreateDocCommentInput): Promise<ProjectDocComment> {
  const res = await fetch(`/api/projects/${id}/docs/${docId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  await assertOk(res, "No se pudo agregar el comentario");
  return res.json();
}

async function resolveDocCommentRequest(id: string, docId: string, commentId: string): Promise<void> {
  const res = await fetch(`/api/projects/${id}/docs/${docId}/comments/${commentId}`, { method: "DELETE" });
  await assertOk(res, "No se pudo resolver el comentario");
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
  return { [LABELS_TOKEN_HEADER]: labelsToken };
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

/** Vincula (PUT) o desvincula (DELETE) una feature o tarea con un issue del proyecto. */
async function issueLinkRequest(id: string, variables: IssueLinkVariables): Promise<ProjectDetail> {
  const { kind, label, issueNumber, linked, labelsToken } = variables;
  const res = await fetch(`/api/projects/${id}/${kind}/${label}/issues/${issueNumber}`, {
    method: linked ? "PUT" : "DELETE",
    headers: labelsHeaders(labelsToken),
  });
  await assertOk(res, linked ? "No se pudo vincular el issue" : "No se pudo desvincular el issue");
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

export function useProjectDocVersions(id: string, docId: string) {
  return useQuery({ queryKey: projectsKeys.docVersions(id, docId), queryFn: () => fetchProjectDocVersions(id, docId) });
}

export function useProjectDocComments(id: string, docId: string) {
  return useQuery({ queryKey: projectsKeys.docComments(id, docId), queryFn: () => fetchProjectDocComments(id, docId) });
}

export function useCreateDocComment(id: string, docId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDocCommentInput) => createDocCommentRequest(id, docId, input),
    // Se devuelve la promesa para que el formulario siga "pendiente" hasta que el comentario ya esté en la lista.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectsKeys.docComments(id, docId) }),
  });
}

// Resolver es borrar el comentario. Si otra persona ya lo resolvió la respuesta es 404;
// onSettled refresca la lista en ambos casos.
export function useResolveDocComment(id: string, docId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) => resolveDocCommentRequest(id, docId, commentId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: projectsKeys.docComments(id, docId) }),
  });
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
      // Se devuelve la promesa para que el guardado siga "pendiente" hasta que el historial
      // ya muestre la versión nueva, en vez de marcar "Guardado ✓" antes de que aparezca.
      return queryClient.invalidateQueries({ queryKey: projectsKeys.docVersions(id, docId) });
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
  const invalidateAfterChange = useInvalidateAfterTaskChange();
  return useMutation({
    mutationFn: ({ taskId, input, labelsToken }: { taskId: string; input: UpdateTaskInput; labelsToken: string }) =>
      updateTaskRequest(id, taskId, input, labelsToken),
    onError: onLabelsError,
    onSuccess: (updated, { input }) => {
      queryClient.setQueryData(key, updated);
      invalidateAfterChange(input.timeSpent);
    },
  });
}

export interface MoveTaskVariables {
  task: ProjectTask;
  column: KanbanColumn;
  /** Fijado al empezar la interacción (al iniciar el arrastre o abrir el modal), no al enviar. */
  labelsToken: string;
  /** Nuevo asignado (Member.id, del equipo) o null para dejarla sin asignar; sin el campo no cambia. */
  assigneeId?: string | null;
  /** Horas de quien la tenía asignada al sacarla de En progreso o En revisión; ver UpdateTaskInput. */
  timeSpent?: { minutes: number } | null;
}

/**
 * Lo que cambia fuera del proyecto al mover o editar una tarea: el Dashboard (mis tareas, "X
 * completó T-03") y, si se registraron horas, /tiempo, porque son un TimeEntry más.
 */
function useInvalidateAfterTaskChange() {
  const queryClient = useQueryClient();
  return (timeSpent: UpdateTaskInput["timeSpent"]) => {
    queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
    if (timeSpent) queryClient.invalidateQueries({ queryKey: timeEntriesKeys.all });
  };
}

/**
 * Mueve una tarea de columna (y, si viene, cambia el asignado) reflejando el cambio al tiro
 * y deshaciéndolo si el servidor lo rechaza.
 */
export function useMoveTask(id: string) {
  const { queryClient, key, onLabelsError } = useLabelledMutationSupport(id);
  const invalidateAfterChange = useInvalidateAfterTaskChange();
  return useMutation({
    mutationFn: ({ task, column, labelsToken, assigneeId, timeSpent }: MoveTaskVariables) =>
      updateTaskRequest(
        id,
        task.id,
        {
          ...taskToUpdateInput(task),
          column,
          ...(assigneeId !== undefined ? { assigneeId } : {}),
          ...(timeSpent ? { timeSpent } : {}),
        },
        labelsToken,
      ),
    onMutate: async ({ task, column, assigneeId }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ProjectDetail | null>(key);
      if (previous) {
        const member = assigneeId ? previous.team.find((m) => m.id === assigneeId) : undefined;
        const assignee =
          assigneeId === undefined ? undefined : member ? { id: member.id, name: member.name, initials: member.initials } : null;
        queryClient.setQueryData<ProjectDetail>(key, {
          ...previous,
          tasks: previous.tasks.map((t) =>
            t.id === task.id
              ? {
                  ...t,
                  columnValue: column,
                  column: kanbanColumnLabel[column],
                  done: column === "LISTO",
                  ...(assignee !== undefined ? { assignee } : {}),
                }
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
    onSuccess: (updated, { timeSpent }) => {
      queryClient.setQueryData(key, updated);
      invalidateAfterChange(timeSpent);
    },
  });
}

/**
 * Mensaje para un cambio de columna o de asignado rechazado. Las reglas del flujo las anticipa
 * el diálogo de movimiento; si igual llegan (otra persona cambió la tarea entre medio), se
 * explica qué hacer en vez del texto genérico.
 */
export function taskMoveErrorMessage(error: Error | null, fallback: string): string {
  if (error instanceof ApiRequestError) {
    if (error.code === "ASSIGNEE_REQUIRED") {
      return "En progreso y En revisión necesitan a alguien asignado. Asígnala a una persona del equipo y vuelve a moverla.";
    }
    if (error.code === "TIME_NOT_ALLOWED") {
      return "Solo quien tenía la tarea asignada puede registrar horas al sacarla de En progreso o En revisión. Muévela sin registrar horas o regístralas en Tiempo.";
    }
  }
  return errorMessage(error, fallback);
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

export interface IssueLinkVariables {
  kind: "features" | "tasks";
  /** Label de la feature o tarea (F-01, T-01). */
  label: string;
  issueNumber: number;
  /** true vincula, false desvincula. */
  linked: boolean;
  labelsToken: string;
}

export function useIssueLink(id: string) {
  const { queryClient, key, onLabelsError } = useLabelledMutationSupport(id);
  return useMutation({
    mutationFn: (variables: IssueLinkVariables) => issueLinkRequest(id, variables),
    onError: onLabelsError,
    onSuccess: (updated, { issueNumber }) => {
      queryClient.setQueryData(key, updated);
      // Vincular cuenta como actividad del issue: cambia el orden de la lista, el detalle del
      // issue y lo que queda sin revisar en el Dashboard.
      queryClient.invalidateQueries({ queryKey: projectsKeys.issues(id), exact: true });
      queryClient.invalidateQueries({ queryKey: projectsKeys.issue(id, issueNumber) });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
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
