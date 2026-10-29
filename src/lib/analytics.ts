import type { FeatureStatus, KanbanColumn, MemberRole, MemberStatus, ProjectStatus } from "@/generated/prisma/enums";
import { AVAILABILITY_BLOCKS, AVAILABILITY_DAYS, availabilitySlot, sanitizeAvailability, type AvailabilitySlot } from "@/lib/api/member-fields";
import { memberRoleLabel } from "@/lib/api/status";
import { assignProjectSeries, recentWeeks, shiftWeek, weekStartOf, type ChartSeries } from "@/lib/tiempo";

// Agregaciones de /analiticas, sin React ni Prisma. El servidor hace pocas
// consultas agregadas (groupBy) y estas funciones arman lo que la vista muestra.
//
// Semanas: lunes a domingo en America/Santiago, como claves "YYYY-MM-DD" (ver
// src/lib/tiempo.ts). Las listas de semanas van de la más antigua a la más
// reciente: la última es la semana en curso.

/** Rangos que ofrece el selector, en semanas. */
export const RANGE_OPTIONS = [4, 8, 12] as const;
export type RangeWeeks = (typeof RANGE_OPTIONS)[number];
export const DEFAULT_RANGE: RangeWeeks = 8;

/** Ventana con que se calcula la racha de StandUps, más allá del rango visible. */
export const STREAK_WINDOW_WEEKS = 52;

export function isRangeWeeks(value: unknown): value is RangeWeeks {
  return RANGE_OPTIONS.includes(value as RangeWeeks);
}

/** Las `count` semanas que terminan en `currentWeek`, de la más antigua a la más reciente. */
export function rangeWeeks(currentWeek: string, count: number): string[] {
  return recentWeeks(currentWeek, count).reverse();
}

// ─── Personas ───

export interface AnalyticsMember {
  id: string;
  name: string;
  initials: string;
  image: string | null;
  role: MemberRole;
  status: MemberStatus;
}

/** Solo los campos de AnalyticsMember, sin lo que traiga de más la fila. */
export function toAnalyticsMember(m: AnalyticsMember): AnalyticsMember {
  return { id: m.id, name: m.name, initials: m.initials, image: m.image, role: m.role, status: m.status };
}

/** Activos primero y luego Hiatus, cada grupo por nombre. */
export function compareMembers(a: Pick<AnalyticsMember, "name" | "status">, b: Pick<AnalyticsMember, "name" | "status">): number {
  if (a.status !== b.status) return a.status === "ACTIVO" ? -1 : 1;
  return a.name.localeCompare(b.name, "es");
}

// ─── Horas y StandUps por semana ───

export interface ActivityMemberInput extends AnalyticsMember {
  /** Lunes de la semana en que coordinación lo aprobó (Member.joinedAt). */
  joinedWeek: string;
}

export interface ActivityEntryInput {
  memberId: string;
  /** "YYYY-MM-DD" */
  date: string;
  minutes: number;
  project: { id: string; name: string };
}

export interface ActivityStandupInput {
  memberId: string;
  weekStart: string;
}

/** "na": la persona todavía no era miembro esa semana. */
export type StandupCell = "sent" | "missing" | "na";

export interface ActivityRow {
  member: AnalyticsMember;
  /** Minutos por semana, alineados con `weeks`. */
  minutes: number[];
  totalMinutes: number;
  standups: StandupCell[];
  /** Semanas seguidas con StandUp hasta la última cerrada (o la actual, si ya lo envió). */
  streak: number;
}

export interface ProjectHours extends ChartSeries {
  /** Personas distintas que registraron horas en el proyecto (o en "Otros"). */
  people: number;
}

export interface ActivityReport {
  weeks: string[];
  currentWeek: string;
  rows: ActivityRow[];
  /** Minutos del equipo por semana. */
  weekTotals: number[];
  totalMinutes: number;
  /** StandUps enviados y esperados por semana (esperados: activos que ya eran miembros). */
  standupTotals: { sent: number; expected: number }[];
  /** Horas del rango por proyecto, de más a menos, con el color de src/lib/tiempo.ts. */
  projects: ProjectHours[];
  /** Activos sin horas esta semana. */
  missingHours: AnalyticsMember[];
  /** Activos sin StandUp esta semana. */
  missingStandups: AnalyticsMember[];
}

/** Semanas seguidas con StandUp, contando hacia atrás. La semana en curso solo suma si ya está enviada. */
export function standupStreak(sentWeeks: ReadonlySet<string>, currentWeek: string, maxWeeks = STREAK_WINDOW_WEEKS): number {
  let week = sentWeeks.has(currentWeek) ? currentWeek : shiftWeek(currentWeek, -1);
  let streak = 0;
  while (streak < maxWeeks && sentWeeks.has(week)) {
    streak++;
    week = shiftWeek(week, -1);
  }
  return streak;
}

/**
 * Grilla persona × semana de horas y StandUps. `standups` puede cubrir más
 * semanas que el rango (para la racha); `entries` solo se cuentan si caen en él.
 * Las personas que no están en `members` (cuentas pendientes) se ignoran.
 */
export function buildActivityReport(input: {
  weeks: string[];
  members: ActivityMemberInput[];
  entries: ActivityEntryInput[];
  standups: ActivityStandupInput[];
}): ActivityReport {
  const { weeks } = input;
  const currentWeek = weeks[weeks.length - 1];
  const weekIndex = new Map(weeks.map((w, i) => [w, i]));

  const members = [...input.members].sort(compareMembers);
  const known = new Set(members.map((m) => m.id));
  const entries = input.entries.filter((e) => known.has(e.memberId) && weekIndex.has(weekStartOf(e.date)));

  const minutes = new Map(members.map((m) => [m.id, weeks.map(() => 0)]));
  for (const e of entries) minutes.get(e.memberId)![weekIndex.get(weekStartOf(e.date))!] += e.minutes;

  const sent = new Map(members.map((m) => [m.id, new Set<string>()]));
  for (const s of input.standups) sent.get(s.memberId)?.add(s.weekStart);

  const rows: ActivityRow[] = members.map((m) => {
    const member = toAnalyticsMember(m);
    const perWeek = minutes.get(member.id)!;
    const memberSent = sent.get(member.id)!;
    return {
      member,
      minutes: perWeek,
      totalMinutes: perWeek.reduce((a, b) => a + b, 0),
      standups: weeks.map((w) => (memberSent.has(w) ? "sent" : w < m.joinedWeek ? "na" : "missing")),
      streak: standupStreak(memberSent, currentWeek),
    };
  });

  const active = rows.filter((r) => r.member.status === "ACTIVO");
  const last = weeks.length - 1;

  const { series, seriesKey } = assignProjectSeries(entries);
  const people = new Map<string, Set<string>>();
  for (const e of entries) {
    const key = seriesKey(e.project.id);
    if (!people.has(key)) people.set(key, new Set());
    people.get(key)!.add(e.memberId);
  }

  return {
    weeks,
    currentWeek,
    rows,
    weekTotals: weeks.map((_, i) => rows.reduce((sum, r) => sum + r.minutes[i], 0)),
    totalMinutes: rows.reduce((sum, r) => sum + r.totalMinutes, 0),
    standupTotals: weeks.map((_, i) => ({
      sent: rows.filter((r) => r.standups[i] === "sent").length,
      expected: active.filter((r) => r.standups[i] !== "na").length,
    })),
    projects: series
      .map((s) => ({ ...s, people: people.get(s.key)?.size ?? 0 }))
      // "Otros" siempre al final.
      .sort((a, b) => (a.slot === null ? 1 : b.slot === null ? -1 : b.minutes - a.minutes)),
    missingHours: active.filter((r) => r.minutes[last] === 0).map((r) => r.member),
    missingStandups: active.filter((r) => r.standups[last] === "missing").map((r) => r.member),
  };
}

/** Nivel 0–4 del mapa de calor de horas semanales: 0, <2h, 2–4h, 4–8h, 8h o más. */
export const HEAT_THRESHOLDS_MINUTES = [1, 120, 240, 480] as const;

export function heatLevel(minutes: number): 0 | 1 | 2 | 3 | 4 {
  let level = 0;
  for (const t of HEAT_THRESHOLDS_MINUTES) if (minutes >= t) level++;
  return level as 0 | 1 | 2 | 3 | 4;
}

// ─── StandUps de una semana ───

export interface WeekStandupInput {
  memberId: string;
  text: string;
  learned: string | null;
  /** Instante ISO del último envío. */
  updatedAt: string;
}

export interface WeekStandupEntry {
  member: AnalyticsMember;
  text: string;
  learned: string | null;
  updatedAt: string;
}

export interface WeekStandups {
  week: string;
  /** Por nombre; los de Hiatus que igual enviaron van al final. */
  entries: WeekStandupEntry[];
  /** Activos que ya eran miembros esa semana y no lo enviaron. */
  missing: AnalyticsMember[];
}

export function buildWeekStandups(week: string, members: ActivityMemberInput[], standups: WeekStandupInput[]): WeekStandups {
  const byMember = new Map(standups.map((s) => [s.memberId, s]));
  const sorted = [...members].sort(compareMembers);

  return {
    week,
    entries: sorted
      .filter((m) => byMember.has(m.id))
      .map((m) => {
        const s = byMember.get(m.id)!;
        return { member: toAnalyticsMember(m), text: s.text, learned: s.learned, updatedAt: s.updatedAt };
      }),
    missing: sorted.filter((m) => m.status === "ACTIVO" && !byMember.has(m.id) && m.joinedWeek <= week).map(toAnalyticsMember),
  };
}

// ─── Proyectos ───

export const KANBAN_ORDER: KanbanColumn[] = ["PENDIENTE", "PROGRESO", "REVISAR", "REVISION", "LISTO"];
export const FEATURE_ORDER: FeatureStatus[] = ["PENDIENTE", "EN_PROGRESO", "HECHO"];

export interface ProjectReportRow {
  id: string;
  name: string;
  status: ProjectStatus;
  tasks: Record<KanbanColumn, number>;
  totalTasks: number;
  features: Record<FeatureStatus, number>;
  totalFeatures: number;
  openIssues: number;
  /** Tareas sin asignar que no están en Listo. */
  unassignedOpen: number;
  team: number;
}

export interface WorkloadRow {
  member: AnalyticsMember;
  pendiente: number;
  progreso: number;
  /** Por revisar + En revisión. */
  revision: number;
  /** Abiertas: todo menos Listo. */
  total: number;
}

export interface ProjectsReport {
  projects: ProjectReportRow[];
  workload: WorkloadRow[];
  /** Tareas abiertas sin asignar en todos los proyectos activos. */
  unassignedOpen: number;
}

type Counted<T> = T & { count: number };

export function buildProjectsReport(input: {
  projects: { id: string; name: string; status: ProjectStatus }[];
  tasks: Counted<{ projectId: string; column: KanbanColumn }>[];
  unassigned: Counted<{ projectId: string }>[];
  features: Counted<{ projectId: string; status: FeatureStatus }>[];
  openIssues: Counted<{ projectId: string }>[];
  teams: Counted<{ projectId: string }>[];
  members: AnalyticsMember[];
  /** Tareas asignadas por persona y columna (de proyectos no archivados). */
  assigned: Counted<{ assigneeId: string; column: KanbanColumn }>[];
}): ProjectsReport {
  const countBy = (rows: Counted<{ projectId: string }>[]) => new Map(rows.map((r) => [r.projectId, r.count]));
  const unassigned = countBy(input.unassigned);
  const openIssues = countBy(input.openIssues);
  const teams = countBy(input.teams);

  const projects = input.projects
    .map((p): ProjectReportRow => {
      const tasks = Object.fromEntries(KANBAN_ORDER.map((c) => [c, 0])) as Record<KanbanColumn, number>;
      for (const t of input.tasks) if (t.projectId === p.id) tasks[t.column] += t.count;
      const features = Object.fromEntries(FEATURE_ORDER.map((s) => [s, 0])) as Record<FeatureStatus, number>;
      for (const f of input.features) if (f.projectId === p.id) features[f.status] += f.count;
      return {
        id: p.id,
        name: p.name,
        status: p.status,
        tasks,
        totalTasks: KANBAN_ORDER.reduce((sum, c) => sum + tasks[c], 0),
        features,
        totalFeatures: FEATURE_ORDER.reduce((sum, s) => sum + features[s], 0),
        openIssues: openIssues.get(p.id) ?? 0,
        unassignedOpen: unassigned.get(p.id) ?? 0,
        team: teams.get(p.id) ?? 0,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  const workload = [...input.members]
    .sort(compareMembers)
    .map((member): WorkloadRow => {
      const mine = input.assigned.filter((a) => a.assigneeId === member.id);
      const of = (...columns: KanbanColumn[]) => mine.filter((a) => columns.includes(a.column)).reduce((sum, a) => sum + a.count, 0);
      const row = { pendiente: of("PENDIENTE"), progreso: of("PROGRESO"), revision: of("REVISAR", "REVISION") };
      return { member, ...row, total: row.pendiente + row.progreso + row.revision };
    })
    // Más trabajo en curso primero; Hiatus siempre al final.
    .sort(
      (a, b) =>
        (a.member.status === b.member.status ? 0 : a.member.status === "ACTIVO" ? -1 : 1) ||
        b.progreso + b.revision - (a.progreso + a.revision) ||
        b.total - a.total ||
        a.member.name.localeCompare(b.member.name, "es"),
    );

  return { projects, workload, unassignedOpen: projects.reduce((sum, p) => sum + p.unassignedOpen, 0) };
}

// ─── Equipo ───

export interface AvailabilityCell {
  slot: AvailabilitySlot;
  /** "Mar · Tarde" */
  label: string;
  /** Activos que declararon ese bloque, por nombre. */
  members: AnalyticsMember[];
}

export interface TeamReport {
  total: number;
  active: number;
  hiatus: number;
  /** Cuentas esperando aprobación. */
  pending: number;
  byRole: { role: MemberRole; label: string; active: number; hiatus: number }[];
  /** Bloques de disponibilidad en orden de la grilla: por bloque (fila), luego por día. */
  availability: AvailabilityCell[];
  /** Activos con al menos un bloque declarado. */
  declared: number;
  /** Activos sin disponibilidad declarada. */
  undeclared: AnalyticsMember[];
}

const ROLE_ORDER: MemberRole[] = ["COORDINACION", "EQUIPO", "ROOKIE"];

/** Solo cuenta a los activos en la disponibilidad: quien está en Hiatus no se agenda. */
export function buildTeamReport(members: (AnalyticsMember & { availability: string[] })[], pending: number): TeamReport {
  const sorted = [...members].sort(compareMembers);
  const active = sorted.filter((m) => m.status === "ACTIVO");
  const slotsOf = new Map(active.map((m) => [m.id, sanitizeAvailability(m.availability)]));

  return {
    total: sorted.length,
    active: active.length,
    hiatus: sorted.length - active.length,
    pending,
    byRole: ROLE_ORDER.map((role) => ({
      role,
      label: memberRoleLabel[role],
      active: active.filter((m) => m.role === role).length,
      hiatus: sorted.filter((m) => m.role === role && m.status !== "ACTIVO").length,
    })),
    availability: AVAILABILITY_BLOCKS.flatMap((block) =>
      AVAILABILITY_DAYS.map((day) => {
        const slot = availabilitySlot(day.value, block.value);
        return {
          slot,
          label: `${day.label} · ${block.label}`,
          members: active.filter((m) => slotsOf.get(m.id)!.includes(slot)).map(toAnalyticsMember),
        };
      }),
    ),
    declared: active.filter((m) => slotsOf.get(m.id)!.length > 0).length,
    undeclared: active.filter((m) => slotsOf.get(m.id)!.length === 0).map(toAnalyticsMember),
  };
}
