import "server-only";

import { IssueCloseReason, IssueType } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { AuthError, requireCoordinacion, requireMember } from "@/lib/auth/guards";
import type { CurrentMember } from "@/lib/auth/current-member";
import { formatDateTime } from "@/lib/api/format";
import {
  MAX_ISSUE_BODY_LENGTH,
  MAX_ISSUE_COMMENT_LENGTH,
  MAX_ISSUE_TITLE_LENGTH,
  type IssueComment,
  type IssueDetail,
  type IssueInput,
  type IssueListItem,
  type IssueStatusInput,
} from "@/lib/api/issues";

// ─── Issues ───
//
// Un issue se direcciona por (projectId, number). number es correlativo por proyecto
// y no se renumera, así que estas mutaciones no llevan labelsToken. Cualquier miembro
// aprobado abre, comenta, cierra y reabre issues en cualquier proyecto; título, cuerpo
// y tipo los edita el autor o coordinación; cada comentario, solo su autor; eliminar
// es de coordinación.

/** Cuántas veces se reintenta tomar el siguiente número si otro issue lo ocupó en paralelo. */
const CREATE_ATTEMPTS = 3;

const listInclude = {
  author: { select: { name: true } },
  _count: { select: { comments: true } },
} satisfies Prisma.IssueInclude;

const detailInclude = {
  ...listInclude,
  closedBy: { select: { name: true } },
  comments: { orderBy: { createdAt: "asc" }, include: { author: { select: { name: true } } } },
} satisfies Prisma.IssueInclude;

type IssueListRow = Prisma.IssueGetPayload<{ include: typeof listInclude }>;
type IssueDetailRow = Prisma.IssueGetPayload<{ include: typeof detailInclude }>;

function toListItem(issue: IssueListRow): IssueListItem {
  return {
    number: issue.number,
    title: issue.title,
    type: issue.type,
    status: issue.status,
    closeReason: issue.closeReason,
    author: issue.author?.name ?? "",
    createdAt: formatDateTime(issue.createdAt),
    lastActivityAt: formatDateTime(issue.lastActivityAt),
    commentCount: issue._count.comments,
  };
}

function canEditIssue(member: CurrentMember, authorId: string | null): boolean {
  return member.role === "COORDINACION" || (authorId !== null && authorId === member.id);
}

function toDetail(issue: IssueDetailRow, member: CurrentMember): IssueDetail {
  return {
    ...toListItem(issue),
    body: issue.body,
    closedBy: issue.closedBy?.name ?? "",
    closedAt: issue.closedAt ? formatDateTime(issue.closedAt) : "",
    canEdit: canEditIssue(member, issue.authorId),
    canDelete: member.role === "COORDINACION",
    comments: issue.comments.map(
      (comment): IssueComment => ({
        id: comment.id,
        author: comment.author?.name ?? "",
        date: formatDateTime(comment.createdAt),
        edited: comment.editedAt !== null,
        body: comment.body,
        canEdit: comment.authorId !== null && comment.authorId === member.id,
      }),
    ),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

/** "12" → 12. null si no es un entero positivo (los handlers lo traducen a 404). */
export function parseIssueNumber(value: string): number | null {
  if (!/^\d{1,9}$/.test(value)) return null;
  const number = Number(value);
  return number > 0 ? number : null;
}

export function parseIssueInput(body: unknown): IssueInput | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;

  const title = typeof b.title === "string" ? b.title.trim() : "";
  if (!title || title.length > MAX_ISSUE_TITLE_LENGTH) return null;

  // El cuerpo puede ir vacío: a veces el título basta para abrir la conversación.
  const text = typeof b.body === "string" ? b.body.trim() : "";
  if (text.length > MAX_ISSUE_BODY_LENGTH) return null;

  const type = typeof b.type === "string" ? b.type : "";
  if (!(Object.values(IssueType) as string[]).includes(type)) return null;

  return { title, body: text, type: type as IssueType };
}

export function parseIssueStatusInput(body: unknown): IssueStatusInput | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;

  if (b.status === "ABIERTO") return { status: "ABIERTO" };
  if (b.status !== "CERRADO") return null;

  const closeReason = typeof b.closeReason === "string" ? b.closeReason : "";
  if (!(Object.values(IssueCloseReason) as string[]).includes(closeReason)) return null;

  return { status: "CERRADO", closeReason: closeReason as IssueCloseReason };
}

export function parseIssueCommentInput(body: unknown): { body: string } | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;

  const text = typeof b.body === "string" ? b.body.trim() : "";
  if (!text || text.length > MAX_ISSUE_COMMENT_LENGTH) return null;
  return { body: text };
}

/** Issues del proyecto, del de actividad más reciente al más antiguo. null si el proyecto no existe. */
export async function getProjectIssues(projectId: string): Promise<IssueListItem[] | null> {
  await requireMember();

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) return null;

  const issues = await prisma.issue.findMany({
    where: { projectId },
    orderBy: { lastActivityAt: "desc" },
    include: listInclude,
  });

  return issues.map(toListItem);
}

async function loadDetail(projectId: string, number: number, member: CurrentMember): Promise<IssueDetail | null> {
  const issue = await prisma.issue.findUnique({
    where: { projectId_number: { projectId, number } },
    include: detailInclude,
  });
  return issue ? toDetail(issue, member) : null;
}

export async function getIssue(projectId: string, number: number): Promise<IssueDetail | null> {
  const member = await requireMember();
  return loadDetail(projectId, number, member);
}

export async function createIssue(projectId: string, input: IssueInput): Promise<IssueDetail | null> {
  const member = await requireMember();

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) return null;

  // Siguiente número = máximo + 1. Si dos se crean a la vez, el unique (projectId, number)
  // rechaza al segundo y se vuelve a leer el máximo.
  for (let attempt = 1; ; attempt++) {
    const last = await prisma.issue.findFirst({
      where: { projectId },
      orderBy: { number: "desc" },
      select: { number: true },
    });
    const number = (last?.number ?? 0) + 1;
    try {
      await prisma.issue.create({
        data: { projectId, number, title: input.title, body: input.body, type: input.type, authorId: member.id },
      });
      return loadDetail(projectId, number, member);
    } catch (error) {
      if (!isUniqueViolation(error) || attempt >= CREATE_ATTEMPTS) throw error;
    }
  }
}

export async function updateIssue(projectId: string, number: number, input: IssueInput): Promise<IssueDetail | null> {
  const member = await requireMember();

  const issue = await prisma.issue.findUnique({
    where: { projectId_number: { projectId, number } },
    select: { id: true, authorId: true },
  });
  if (!issue) return null;
  if (!canEditIssue(member, issue.authorId)) {
    throw new AuthError(403, "FORBIDDEN_ROLE", "Solo quien abrió el issue o coordinación puede editarlo");
  }

  await prisma.issue.update({
    where: { id: issue.id },
    data: { title: input.title, body: input.body, type: input.type, lastActivityAt: new Date() },
  });

  return loadDetail(projectId, number, member);
}

/** Cerrar (con motivo) o reabrir. Cerrar uno ya cerrado cambia su motivo y quién lo cerró. */
export async function setIssueStatus(
  projectId: string,
  number: number,
  input: IssueStatusInput,
): Promise<IssueDetail | null> {
  const member = await requireMember();

  const now = new Date();
  const data =
    input.status === "CERRADO"
      ? { status: input.status, closeReason: input.closeReason, closedAt: now, closedById: member.id, lastActivityAt: now }
      : { status: input.status, closeReason: null, closedAt: null, closedById: null, lastActivityAt: now };

  const { count } = await prisma.issue.updateMany({ where: { projectId, number }, data });
  if (count === 0) return null;

  return loadDetail(projectId, number, member);
}

/** Borra el issue y su hilo. Lo normal es cerrarlo; esto queda para coordinación. */
export async function deleteIssue(projectId: string, number: number): Promise<boolean> {
  await requireCoordinacion();

  const { count } = await prisma.issue.deleteMany({ where: { projectId, number } });
  return count > 0;
}

export async function createIssueComment(projectId: string, number: number, body: string): Promise<IssueDetail | null> {
  const member = await requireMember();

  const issue = await prisma.issue.findUnique({
    where: { projectId_number: { projectId, number } },
    select: { id: true },
  });
  if (!issue) return null;

  const now = new Date();
  await prisma.$transaction([
    prisma.issueComment.create({ data: { issueId: issue.id, authorId: member.id, body, createdAt: now } }),
    prisma.issue.update({ where: { id: issue.id }, data: { lastActivityAt: now } }),
  ]);

  return loadDetail(projectId, number, member);
}

/** Solo el autor edita su comentario; ni coordinación reescribe lo que dijo otra persona. */
export async function updateIssueComment(
  projectId: string,
  number: number,
  commentId: string,
  body: string,
): Promise<IssueDetail | null> {
  const member = await requireMember();

  const comment = await prisma.issueComment.findFirst({
    where: { id: commentId, issue: { projectId, number } },
    select: { authorId: true, body: true },
  });
  if (!comment) return null;
  if (comment.authorId !== member.id) {
    throw new AuthError(403, "FORBIDDEN_ROLE", "Solo quien escribió el comentario puede editarlo");
  }

  // Guardar el mismo texto no lo marca como editado.
  if (comment.body !== body) {
    await prisma.issueComment.update({ where: { id: commentId }, data: { body, editedAt: new Date() } });
  }

  return loadDetail(projectId, number, member);
}
