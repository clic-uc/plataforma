import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { IssueCloseReason, IssueStatus, IssueType } from "@/generated/prisma/enums";
import { assertOk } from "@/lib/api/http";
import { dashboardKeys } from "@/lib/api/dashboard";
import { projectsKeys } from "@/lib/api/projects";

export const MAX_ISSUE_TITLE_LENGTH = 200;
export const MAX_ISSUE_BODY_LENGTH = 20000;
export const MAX_ISSUE_COMMENT_LENGTH = 10000;

/** Fila de la lista de issues de un proyecto. */
export interface IssueListItem {
  /** #12: correlativo por proyecto, nunca se renumera. */
  number: number;
  title: string;
  type: IssueType;
  status: IssueStatus;
  closeReason: IssueCloseReason | null;
  /** Vacío si el autor ya no existe. */
  author: string;
  createdAt: string;
  lastActivityAt: string;
  commentCount: number;
  /**
   * Si quien mira lo revisó después de su última actividad. Lo nuevo de cualquiera lo
   * desmarca; lo propio no (ver isIssueReviewed).
   */
  reviewedByMe: boolean;
}

/**
 * Revisado por una persona: su marca es de la última actividad del issue o posterior.
 * Comentar, editar, cerrar, reabrir o vincular mueve lastActivityAt, así que lo
 * desmarca para todos; quien lo hace actualiza su propia marca en la misma escritura.
 */
export function isIssueReviewed(reviewedAt: Date | null | undefined, lastActivityAt: Date): boolean {
  return reviewedAt != null && reviewedAt.getTime() >= lastActivityAt.getTime();
}

export interface IssueComment {
  id: string;
  /** Vacío si el autor ya no existe. */
  author: string;
  date: string;
  edited: boolean;
  body: string;
  /** Solo quien lo escribió lo edita. Únicamente oculta botones: el servidor valida. */
  canEdit: boolean;
}

export interface IssueDetail extends IssueListItem {
  body: string;
  /** Vacío si sigue abierto o si quien lo cerró ya no existe. */
  closedBy: string;
  /** Vacío si sigue abierto. */
  closedAt: string;
  /** Autor o coordinación: editar título, cuerpo y tipo. Únicamente oculta botones. */
  canEdit: boolean;
  /** Coordinación: eliminar el issue. Únicamente oculta botones. */
  canDelete: boolean;
  comments: IssueComment[];
}

export interface IssueInput {
  title: string;
  body: string;
  type: IssueType;
}

/** Cerrar exige motivo; reabrir no lleva. */
export type IssueStatusInput = { status: "CERRADO"; closeReason: IssueCloseReason } | { status: "ABIERTO" };

/** Filtro de la lista: abiertos, cerrados o todos. */
export type IssueFilter = IssueStatus | "TODOS";

async function fetchIssues(projectId: string): Promise<IssueListItem[]> {
  const res = await fetch(`/api/projects/${projectId}/issues`);
  await assertOk(res, "No se pudieron cargar los issues");
  return res.json();
}

async function fetchIssue(projectId: string, number: number): Promise<IssueDetail | null> {
  const res = await fetch(`/api/projects/${projectId}/issues/${number}`);
  if (res.status === 404) return null;
  await assertOk(res, "No se pudo cargar el issue");
  return res.json();
}

async function createIssueRequest(projectId: string, input: IssueInput): Promise<IssueDetail> {
  const res = await fetch(`/api/projects/${projectId}/issues`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  await assertOk(res, "No se pudo crear el issue");
  return res.json();
}

async function updateIssueRequest(projectId: string, number: number, input: IssueInput): Promise<IssueDetail> {
  const res = await fetch(`/api/projects/${projectId}/issues/${number}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  await assertOk(res, "No se pudo guardar el issue");
  return res.json();
}

async function setIssueStatusRequest(projectId: string, number: number, input: IssueStatusInput): Promise<IssueDetail> {
  const res = await fetch(`/api/projects/${projectId}/issues/${number}/status`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  await assertOk(res, input.status === "CERRADO" ? "No se pudo cerrar el issue" : "No se pudo reabrir el issue");
  return res.json();
}

async function setIssueReviewedRequest(projectId: string, number: number, reviewed: boolean): Promise<IssueDetail> {
  const res = await fetch(`/api/projects/${projectId}/issues/${number}/review`, { method: reviewed ? "PUT" : "DELETE" });
  await assertOk(res, reviewed ? "No se pudo marcar como revisado" : "No se pudo desmarcar");
  return res.json();
}

async function deleteIssueRequest(projectId: string, number: number): Promise<void> {
  const res = await fetch(`/api/projects/${projectId}/issues/${number}`, { method: "DELETE" });
  await assertOk(res, "No se pudo eliminar el issue");
}

async function createIssueCommentRequest(projectId: string, number: number, body: string): Promise<IssueDetail> {
  const res = await fetch(`/api/projects/${projectId}/issues/${number}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
  await assertOk(res, "No se pudo agregar el comentario");
  return res.json();
}

async function updateIssueCommentRequest(
  projectId: string,
  number: number,
  commentId: string,
  body: string,
): Promise<IssueDetail> {
  const res = await fetch(`/api/projects/${projectId}/issues/${number}/comments/${commentId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
  await assertOk(res, "No se pudo guardar el comentario");
  return res.json();
}

export function useProjectIssues(projectId: string) {
  return useQuery({ queryKey: projectsKeys.issues(projectId), queryFn: () => fetchIssues(projectId) });
}

export function useIssue(projectId: string, number: number, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: projectsKeys.issue(projectId, number),
    queryFn: () => fetchIssue(projectId, number),
    ...options,
  });
}

/**
 * Toda mutación de un issue devuelve su detalle actualizado; la lista se refresca por su
 * orden y contadores, y el Dashboard por los issues sin revisar.
 */
function useIssueMutationSuccess(projectId: string) {
  const queryClient = useQueryClient();
  return (updated: IssueDetail) => {
    queryClient.setQueryData(projectsKeys.issue(projectId, updated.number), updated);
    queryClient.invalidateQueries({ queryKey: projectsKeys.issues(projectId), exact: true });
    queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
  };
}

export function useCreateIssue(projectId: string) {
  const onSuccess = useIssueMutationSuccess(projectId);
  return useMutation({
    mutationFn: (input: IssueInput) => createIssueRequest(projectId, input),
    onSuccess,
  });
}

export function useUpdateIssue(projectId: string, number: number) {
  const onSuccess = useIssueMutationSuccess(projectId);
  return useMutation({
    mutationFn: (input: IssueInput) => updateIssueRequest(projectId, number, input),
    onSuccess,
  });
}

export function useSetIssueStatus(projectId: string, number: number) {
  const onSuccess = useIssueMutationSuccess(projectId);
  return useMutation({
    mutationFn: (input: IssueStatusInput) => setIssueStatusRequest(projectId, number, input),
    onSuccess,
  });
}

/** Marcar (true) o desmarcar (false) el issue como revisado por quien mira. */
export function useSetIssueReviewed(projectId: string, number: number) {
  const onSuccess = useIssueMutationSuccess(projectId);
  return useMutation({
    mutationFn: (reviewed: boolean) => setIssueReviewedRequest(projectId, number, reviewed),
    onSuccess,
  });
}

export function useDeleteIssue(projectId: string, number: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => deleteIssueRequest(projectId, number),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: projectsKeys.issue(projectId, number) });
      queryClient.invalidateQueries({ queryKey: projectsKeys.issues(projectId), exact: true });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
    },
  });
}

export function useCreateIssueComment(projectId: string, number: number) {
  const onSuccess = useIssueMutationSuccess(projectId);
  return useMutation({
    mutationFn: (body: string) => createIssueCommentRequest(projectId, number, body),
    onSuccess,
  });
}

export function useUpdateIssueComment(projectId: string, number: number) {
  const onSuccess = useIssueMutationSuccess(projectId);
  return useMutation({
    mutationFn: ({ commentId, body }: { commentId: string; body: string }) =>
      updateIssueCommentRequest(projectId, number, commentId, body),
    onSuccess,
  });
}
