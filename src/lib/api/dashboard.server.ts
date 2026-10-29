import "server-only";

import { EventKind, IssueStatus, KanbanColumn, TimeEntryKind } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth/guards";
import { docSlotName, issueCloseReasonLabel, projectStatusColor, projectStatusLabel } from "@/lib/api/status";
import { isIssueReviewed } from "@/lib/api/issues";
import { instantToZonedTime } from "@/lib/calendar";
import { currentWeekStart, dateToDayKey, dayKeyToDate, shiftWeek } from "@/lib/tiempo";
import { ACTIVITY_WINDOW_DAYS, buildActivityFeed, standupStreak, type ActivityItem } from "@/lib/dashboard";
import { PENDING_HOURS_WINDOW_DAYS, pendingPeriods } from "@/lib/pending-hours";
import { WORK_COLUMNS } from "@/lib/api/projects";
import type { DashboardProject, DashboardSummary, NextMeeting, PendingHours } from "@/lib/api/dashboard";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Filas que se leen de cada fuente del feed antes de mezclarlas. */
const ACTIVITY_SOURCE_TAKE = 20;

/** Semanas de StandUp que se leen para la racha; más atrás no cambia nada que se muestre. */
const STREAK_LOOKBACK_WEEKS = 104;

const REVIEW_COLUMNS: KanbanColumn[] = [KanbanColumn.REVISAR, KanbanColumn.REVISION];

/**
 * Columnas desde las que llegar a LISTO es completar una tarea. Deja fuera fromColumn
 * null (la fila de creación, y la inicial que la migración escribió para las tareas que
 * ya existían) y LISTO -> LISTO (un cambio de asignado en una tarea ya terminada).
 */
const NOT_DONE_COLUMNS = Object.values(KanbanColumn).filter((c) => c !== KanbanColumn.LISTO);

const projectRef = { select: { id: true, name: true } } as const;
const personRef = { select: { id: true, name: true } } as const;

/** Día ("YYYY-MM-DD") de un evento: UTC si es de día completo, Chile si tiene hora (ver lib/calendar.ts). */
function eventDay(event: { allDay: boolean; startsAt: Date }): string {
  return event.allDay ? dateToDayKey(event.startsAt) : instantToZonedTime(event.startsAt).date;
}

async function getMyProjects(memberId: string): Promise<DashboardProject[]> {
  const openTask = { assigneeId: memberId, column: { not: KanbanColumn.LISTO } };
  const projects = await prisma.project.findMany({
    where: {
      archived: false,
      // Las tareas solo se asignan a gente del equipo, pero una asignación previa a esa regla
      // o una salida del equipo no deberían esconder una tarea abierta.
      OR: [{ members: { some: { memberId } } }, { tasks: { some: openTask } }],
    },
    orderBy: { name: "asc" },
    include: {
      tasks: { where: openTask, orderBy: { label: "asc" }, select: { label: true, name: true, column: true } },
      issues: {
        where: { status: IssueStatus.ABIERTO },
        select: { lastActivityAt: true, reviews: { where: { memberId }, select: { reviewedAt: true } } },
      },
    },
  });

  return projects
    .map((project) => ({
      id: project.id,
      name: project.name,
      status: projectStatusLabel[project.status],
      statusColor: projectStatusColor[project.status],
      tasks: project.tasks,
      issues: {
        open: project.issues.length,
        unreviewed: project.issues.filter((i) => !isIssueReviewed(i.reviews[0]?.reviewedAt, i.lastActivityAt)).length,
      },
    }))
    .sort((a, b) => Number(b.tasks.length > 0) - Number(a.tasks.length > 0));
}

async function getNextMeeting(now: Date): Promise<NextMeeting | null> {
  // endsAt y no startsAt: una reunión en curso sigue siendo "la próxima".
  const event = await prisma.calendarEvent.findFirst({
    where: { kind: EventKind.REUNION, endsAt: { gt: now } },
    orderBy: [{ startsAt: "asc" }, { endsAt: "asc" }],
    include: { project: projectRef },
  });
  if (!event) return null;

  return {
    id: event.id,
    title: event.title,
    allDay: event.allDay,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
    day: eventDay(event),
    time: event.allDay ? null : instantToZonedTime(event.startsAt).time,
    project: event.project,
  };
}

async function getStreakWeeks(memberId: string, week: string): Promise<string[]> {
  const standups = await prisma.standup.findMany({
    where: { memberId, weekStart: { gte: dayKeyToDate(shiftWeek(week, -STREAK_LOOKBACK_WEEKS)) } },
    select: { weekStart: true },
  });
  return standups.map((s) => dateToDayKey(s.weekStart));
}

function docHref(projectId: string, docKey: string): string {
  return `/proyectos/${projectId}/docs/${docKey}`;
}

function issueHref(projectId: string, number: number): string {
  return `/proyectos/${projectId}/issues/${number}`;
}

/**
 * Actividad reciente de mis proyectos (los mismos de "Mis proyectos"), derivada de las
 * filas con fecha que ya existen: no hay un modelo de actividad. Lo que no cuelga de un
 * proyecto (StandUps, miembros nuevos, eventos sin proyecto) no entra. Las horas son
 * personales, así que de ellas entran únicamente las propias. Completar una tarea sale
 * del historial del kanban (TaskTransition a LISTO), con quien la movió como autor.
 */
async function getActivity(memberId: string, projectIds: string[], now: Date): Promise<ActivityItem[]> {
  if (projectIds.length === 0) return [];

  const window = { gte: new Date(now.getTime() - ACTIVITY_WINDOW_DAYS * DAY_MS), lte: now };
  const take = ACTIVITY_SOURCE_TAKE;
  const recent = { createdAt: window };
  const newestFirst = { createdAt: "desc" } as const;
  const inMyProjects = { projectId: { in: projectIds } };
  const docInMyProjects = { OR: [{ document: inMyProjects }, { acta: inMyProjects }] };

  const [versions, docComments, openedIssues, closedIssues, issueComments, completedTasks, events, hours] =
    await Promise.all([
      // Las versiones sin autor son de la migración inicial o de alguien que ya no está.
      prisma.docVersion.findMany({
        where: { ...recent, ...docInMyProjects, authorId: { not: null } },
        orderBy: newestFirst,
        // Varias versiones de un mismo día se juntan en una: se leen más.
        take: take * 2,
        select: {
          id: true,
          createdAt: true,
          author: personRef,
          document: { select: { slot: true, project: projectRef } },
          acta: { select: { id: true, title: true, project: projectRef } },
        },
      }),
      prisma.docComment.findMany({
        where: { ...recent, ...docInMyProjects },
        orderBy: newestFirst,
        take,
        select: {
          id: true,
          createdAt: true,
          author: personRef,
          document: { select: { slot: true, project: projectRef } },
          acta: { select: { id: true, title: true, project: projectRef } },
        },
      }),
      prisma.issue.findMany({
        where: { ...recent, ...inMyProjects },
        orderBy: newestFirst,
        take,
        select: { id: true, number: true, title: true, createdAt: true, author: personRef, project: projectRef },
      }),
      prisma.issue.findMany({
        where: { ...inMyProjects, status: IssueStatus.CERRADO, closedAt: window },
        orderBy: { closedAt: "desc" },
        take,
        select: { id: true, number: true, title: true, closedAt: true, closeReason: true, closedBy: personRef, project: projectRef },
      }),
      prisma.issueComment.findMany({
        where: { ...recent, issue: inMyProjects },
        orderBy: newestFirst,
        take,
        select: {
          id: true,
          createdAt: true,
          author: personRef,
          issue: { select: { number: true, title: true, project: projectRef } },
        },
      }),
      prisma.taskTransition.findMany({
        where: {
          at: window,
          toColumn: KanbanColumn.LISTO,
          fromColumn: { in: NOT_DONE_COLUMNS },
          task: inMyProjects,
        },
        orderBy: { at: "desc" },
        take,
        select: { id: true, at: true, by: personRef, task: { select: { label: true, name: true, project: projectRef } } },
      }),
      // "Repetir semanalmente" crea varias filas a la vez; se lee de más y se deja una por serie.
      prisma.calendarEvent.findMany({
        where: { ...recent, ...inMyProjects },
        orderBy: newestFirst,
        take: take * 2,
        select: { id: true, title: true, createdAt: true, seriesId: true, allDay: true, startsAt: true, createdBy: personRef, project: projectRef },
      }),
      prisma.timeEntry.findMany({
        where: { ...recent, ...inMyProjects, memberId },
        orderBy: newestFirst,
        take,
        select: { id: true, createdAt: true, minutes: true, project: projectRef },
      }),
    ]);

  const actor = (person: { id: string; name: string } | null) => ({ actor: person, self: person?.id === memberId });
  const items: ActivityItem[] = [];

  for (const v of versions) {
    const target = v.document
      ? { doc: docSlotName[v.document.slot], project: v.document.project, href: docHref(v.document.project.id, v.document.slot.toLowerCase()) }
      : v.acta
        ? { doc: v.acta.title, project: v.acta.project, href: docHref(v.acta.project.id, v.acta.id) }
        : null;
    if (!target) continue;
    items.push({ id: `version-${v.id}`, at: v.createdAt.toISOString(), ...actor(v.author), kind: "doc_edit", count: 1, ...target });
  }

  for (const c of docComments) {
    const target = c.document
      ? { doc: docSlotName[c.document.slot], project: c.document.project, href: docHref(c.document.project.id, c.document.slot.toLowerCase()) }
      : c.acta
        ? { doc: c.acta.title, project: c.acta.project, href: docHref(c.acta.project.id, c.acta.id) }
        : null;
    if (!target) continue;
    items.push({ id: `doc-comment-${c.id}`, at: c.createdAt.toISOString(), ...actor(c.author), kind: "doc_comment", ...target });
  }

  for (const i of openedIssues) {
    items.push({
      id: `issue-open-${i.id}`,
      at: i.createdAt.toISOString(),
      ...actor(i.author),
      project: i.project,
      href: issueHref(i.project.id, i.number),
      kind: "issue_open",
      number: i.number,
      title: i.title,
    });
  }

  for (const i of closedIssues) {
    if (!i.closedAt || !i.closeReason) continue;
    items.push({
      id: `issue-close-${i.id}`,
      at: i.closedAt.toISOString(),
      ...actor(i.closedBy),
      project: i.project,
      href: issueHref(i.project.id, i.number),
      kind: "issue_close",
      number: i.number,
      title: i.title,
      reason: issueCloseReasonLabel[i.closeReason],
    });
  }

  for (const c of issueComments) {
    items.push({
      id: `issue-comment-${c.id}`,
      at: c.createdAt.toISOString(),
      ...actor(c.author),
      project: c.issue.project,
      href: issueHref(c.issue.project.id, c.issue.number),
      kind: "issue_comment",
      number: c.issue.number,
      title: c.issue.title,
    });
  }

  for (const t of completedTasks) {
    items.push({
      id: `task-done-${t.id}`,
      at: t.at.toISOString(),
      ...actor(t.by),
      project: t.task.project,
      href: `/proyectos/${t.task.project.id}`,
      kind: "task_done",
      label: t.task.label,
      name: t.task.name,
    });
  }

  const seenSeries = new Set<string>();
  for (const e of events) {
    if (e.seriesId) {
      if (seenSeries.has(e.seriesId)) continue;
      seenSeries.add(e.seriesId);
    }
    items.push({
      id: `event-${e.id}`,
      at: e.createdAt.toISOString(),
      ...actor(e.createdBy),
      project: e.project,
      href: `/calendario?${new URLSearchParams({ vista: "semana", fecha: eventDay(e) })}`,
      kind: "event",
      title: e.title,
    });
  }

  for (const h of hours) {
    items.push({
      id: `hours-${h.id}`,
      at: h.createdAt.toISOString(),
      actor: null,
      self: true,
      project: h.project,
      href: "/tiempo",
      kind: "hours",
      minutes: h.minutes,
    });
  }

  return buildActivityFeed(items);
}

/**
 * Horas por registrar (ver lib/pending-hours.ts). Candidatas: tareas de proyectos no
 * archivados donde alguna vez fui el asignado en una columna de trabajo y que tuvieron
 * algún cambio dentro de la ventana (el fin de un período es siempre una fila nueva). De
 * esas se lee el historial completo, porque un período que termina en la ventana pudo
 * empezar antes, y mis registros vinculados a ellas.
 */
async function getPendingHours(memberId: string, now: Date): Promise<PendingHours[]> {
  const windowStart = new Date(now.getTime() - PENDING_HOURS_WINDOW_DAYS * DAY_MS);
  const workColumns = [...WORK_COLUMNS];

  const tasks = await prisma.task.findMany({
    where: {
      project: { archived: false },
      AND: [
        { transitions: { some: { at: { gte: windowStart } } } },
        { transitions: { some: { assigneeId: memberId, toColumn: { in: workColumns } } } },
      ],
    },
    select: {
      id: true,
      label: true,
      name: true,
      project: projectRef,
      transitions: {
        orderBy: { at: "asc" },
        select: { id: true, toColumn: true, assigneeId: true, at: true, hoursDismissedAt: true },
      },
    },
  });
  if (tasks.length === 0) return [];

  const entries = await prisma.timeEntry.findMany({
    where: {
      memberId,
      taskId: { in: tasks.map((t) => t.id) },
      kind: { in: [TimeEntryKind.TRABAJO, TimeEntryKind.REVISION] },
    },
    select: { taskId: true, kind: true, createdAt: true },
  });
  const linked = entries.flatMap((e) => (e.taskId ? [{ taskId: e.taskId, kind: e.kind, createdAt: e.createdAt }] : []));

  return tasks
    .flatMap((task) =>
      pendingPeriods(task.id, task.transitions, linked, memberId, now).map((period) => ({ task, period })),
    )
    .sort((a, b) => b.period.to.getTime() - a.period.to.getTime())
    .map(({ task, period }) => ({
      transitionId: period.transitionId,
      taskId: task.id,
      label: task.label,
      name: task.name,
      project: task.project,
      kind: period.kind,
      from: period.from.toISOString(),
      to: period.to.toISOString(),
      suggestedDate: period.suggestedDate,
    }));
}

/**
 * Descarta un período pendiente marcando la fila que lo abrió. Solo la propia (yo era el
 * asignado) y de una columna de trabajo; cualquier otra responde false (404), igual que
 * una que no existe. Descartar dos veces conserva la primera fecha.
 */
export async function dismissPendingHours(transitionId: string, now: Date = new Date()): Promise<boolean> {
  const member = await requireMember();
  const row = await prisma.taskTransition.findFirst({
    where: { id: transitionId, assigneeId: member.id, toColumn: { in: [...WORK_COLUMNS] } },
    select: { hoursDismissedAt: true },
  });
  if (!row) return false;
  if (!row.hoursDismissedAt) {
    await prisma.taskTransition.update({ where: { id: transitionId }, data: { hoursDismissedAt: now } });
  }
  return true;
}

/** Todo lo del Dashboard salvo horas y eventos de la semana, que tienen sus propias queries. */
export async function getDashboard(now: Date = new Date()): Promise<DashboardSummary> {
  const member = await requireMember();
  const week = currentWeekStart(now);

  const [projects, streakWeeks, nextMeeting, pendingHours] = await Promise.all([
    getMyProjects(member.id),
    getStreakWeeks(member.id, week),
    getNextMeeting(now),
    getPendingHours(member.id, now),
  ]);
  const activity = await getActivity(member.id, projects.map((p) => p.id), now);

  const tasks = projects.flatMap((p) => p.tasks);
  return {
    tasks: { open: tasks.length, inReview: tasks.filter((t) => REVIEW_COLUMNS.includes(t.column)).length },
    issues: {
      open: projects.reduce((sum, p) => sum + p.issues.open, 0),
      unreviewed: projects.reduce((sum, p) => sum + p.issues.unreviewed, 0),
    },
    streak: standupStreak(streakWeeks, week),
    nextMeeting,
    projects,
    activity,
    pendingHours,
  };
}
