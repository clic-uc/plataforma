import "server-only";

import { MemberRole, MemberStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { AuthError, requireCoordinacion, requireMember } from "@/lib/auth/guards";
import { ApiError } from "@/lib/api/errors";
import { formatDayMonthYear, formatMonthYear, getInitials } from "@/lib/api/format";
import { dateToDayKey, formatWeek } from "@/lib/tiempo";
import {
  MAX_AREA_LENGTH,
  MAX_LEVEL,
  MAX_NAME_LENGTH,
  birthdayFromDate,
  birthdayToDate,
  formatBirthday,
  normalizeSkills,
  parseAvailability,
  sanitizeAvailability,
} from "@/lib/api/member-fields";
import {
  memberRoleLabel,
  memberStatusColor,
  memberStatusLabel,
  projectStatusColor,
  projectStatusLabel,
} from "@/lib/api/status";
import type {
  AchievementIcon,
  ApproveMemberInput,
  MemberAdminInput,
  MemberDetail,
  MemberListItem,
  PendingMember,
  UpdateMemberInput,
} from "@/lib/api/members";

const ACHIEVEMENT_ICONS: readonly string[] = ["star", "speech", "bolt", "file", "lock"];

function toAchievementIcon(icon: string): AchievementIcon {
  return (ACHIEVEMENT_ICONS.includes(icon) ? icon : "lock") as AchievementIcon;
}

/** Standups que muestra el perfil. */
const RECENT_STANDUPS = 6;

function rankFromLevel(level: number): number {
  return Math.min(4, Math.max(0, level));
}

export async function getMembers(): Promise<MemberListItem[]> {
  await requireMember();

  // Las cuentas pendientes de aprobación no son miembros todavía: no se listan ni
  // se ofrecen en los selectores (equipo de proyecto, asignación).
  const members = await prisma.member.findMany({
    where: { isVerifiedByCoordinator: true },
    orderBy: { name: "asc" },
    include: {
      projects: { include: { project: { select: { id: true, name: true } } } },
    },
  });

  return members.map((member) => ({
    id: member.id,
    name: member.name,
    initials: getInitials(member.name),
    image: member.image,
    area: member.area,
    email: member.email,
    status: memberStatusLabel[member.status],
    statusColor: memberStatusColor[member.status],
    statusValue: member.status,
    rankFilled: rankFromLevel(member.level),
    birthday: member.birthday ? formatBirthday(member.birthday) : "—",
    projects: member.projects.map((pm) => ({ id: pm.project.id, name: pm.project.name })),
  }));
}

export async function getMember(id: string): Promise<MemberDetail | null> {
  await requireMember();

  const member = await prisma.member.findUnique({
    where: { id, isVerifiedByCoordinator: true },
    include: {
      projects: { include: { project: true } },
      achievements: { include: { achievement: true } },
      standups: { orderBy: { weekStart: "desc" }, take: RECENT_STANDUPS },
    },
  });
  if (!member) return null;

  return {
    id: member.id,
    name: member.name,
    initials: getInitials(member.name),
    image: member.image,
    area: member.area,
    email: member.email,
    role: memberRoleLabel[member.role],
    roleValue: member.role,
    status: memberStatusLabel[member.status],
    statusColor: memberStatusColor[member.status],
    statusValue: member.status,
    rankFilled: rankFromLevel(member.level),
    birthday: member.birthday ? formatBirthday(member.birthday) : "—",
    birthdayValue: member.birthday ? birthdayFromDate(member.birthday) : null,
    joinedAt: formatMonthYear(member.joinedAt),
    level: member.level,
    streak: member.streak,
    skills: member.skills,
    availability: sanitizeAvailability(member.availability),
    projects: member.projects.map((pm) => ({
      id: pm.project.id,
      name: pm.project.name,
      role: pm.role,
      status: projectStatusLabel[pm.project.status],
      statusColor: projectStatusColor[pm.project.status],
    })),
    achievements: member.achievements.map((ma) => ({
      id: ma.achievement.id,
      name: ma.achievement.name,
      icon: toAchievementIcon(ma.achievement.icon),
      unlocked: ma.unlockedAt !== null,
    })),
    standups: member.standups.map((s) => ({ week: formatWeek(dateToDayKey(s.weekStart)), text: s.text, learned: s.learned })),
  };
}

// ─── Edición ───
//
// Cada persona edita su propio perfil (nombre, cumpleaños, habilidades,
// disponibilidad). Área, rol, estado y nivel los asigna coordinación, que
// además puede editar el perfil de cualquiera.

function parseText(value: unknown, maxLength: number): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text && text.length <= maxLength ? text : null;
}

function parseAdminInput(value: unknown): MemberAdminInput | null {
  if (typeof value !== "object" || value === null) return null;
  const a = value as Record<string, unknown>;

  const area = parseText(a.area, MAX_AREA_LENGTH);
  if (!area) return null;

  const role = typeof a.role === "string" ? a.role : "";
  if (!(Object.values(MemberRole) as string[]).includes(role)) return null;

  const status = typeof a.status === "string" ? a.status : "";
  if (!(Object.values(MemberStatus) as string[]).includes(status)) return null;

  const level = a.level;
  if (typeof level !== "number" || !Number.isInteger(level) || level < 0 || level > MAX_LEVEL) return null;

  return { area, role: role as MemberRole, status: status as MemberStatus, level };
}

export function parseUpdateMemberInput(body: unknown): UpdateMemberInput | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;

  const name = parseText(b.name, MAX_NAME_LENGTH);
  if (!name) return null;

  // Explícito aunque sea null, como assigneeId en tareas: un cliente que no
  // conoce el campo no borra el cumpleaños sin querer.
  const birthday = b.birthday;
  if (birthday !== null && (typeof birthday !== "string" || !birthdayToDate(birthday))) return null;

  if (!Array.isArray(b.skills) || !b.skills.every((s) => typeof s === "string")) return null;
  const skills = normalizeSkills(b.skills);
  if (!skills) return null;

  const availability = parseAvailability(b.availability);
  if (!availability) return null;

  const input: UpdateMemberInput = { name, birthday, skills, availability };
  if (b.admin !== undefined) {
    const admin = parseAdminInput(b.admin);
    if (!admin) return null;
    input.admin = admin;
  }
  return input;
}

/**
 * Sin coordinación no se puede aprobar a nadie ni volver a nombrar coordinador
 * (salvo por SQL). Basta con mirar al que se degrada a sí mismo: si un
 * coordinador cambia el rol de otro, él mismo sigue siéndolo.
 */
async function assertAnotherCoordinator(memberId: string): Promise<void> {
  const others = await prisma.member.count({
    where: { role: "COORDINACION", isVerifiedByCoordinator: true, id: { not: memberId } },
  });
  if (others === 0) {
    throw new ApiError(409, "LAST_COORDINATOR", "No puedes dejar de ser coordinación: no queda nadie más con ese rol");
  }
}

export async function updateMember(id: string, input: UpdateMemberInput): Promise<MemberDetail | null> {
  const actor = await requireMember();
  const isCoordinacion = actor.role === "COORDINACION";

  if (actor.id !== id && !isCoordinacion) {
    throw new AuthError(403, "FORBIDDEN_ROLE", "Solo puedes editar tu propio perfil");
  }
  if (input.admin && !isCoordinacion) {
    throw new AuthError(403, "FORBIDDEN_ROLE", "Área, rol, estado y nivel los asigna coordinación");
  }

  const exists = await prisma.member.findUnique({
    where: { id, isVerifiedByCoordinator: true },
    select: { id: true },
  });
  if (!exists) return null;

  if (input.admin && actor.id === id && input.admin.role !== "COORDINACION") {
    await assertAnotherCoordinator(id);
  }

  await prisma.member.update({
    where: { id },
    data: {
      name: input.name,
      birthday: input.birthday ? birthdayToDate(input.birthday) : null,
      skills: input.skills,
      availability: input.availability,
      ...input.admin,
    },
  });

  return getMember(id);
}

// ─── Aprobación ───

export async function getPendingMembers(): Promise<PendingMember[]> {
  await requireCoordinacion();

  const pending = await prisma.member.findMany({
    where: { isVerifiedByCoordinator: false },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, image: true, email: true, area: true, createdAt: true },
  });

  return pending.map((member) => ({
    id: member.id,
    name: member.name,
    initials: getInitials(member.name),
    image: member.image,
    email: member.email,
    area: member.area,
    requestedAt: formatDayMonthYear(member.createdAt),
  }));
}

export function parseApproveMemberInput(body: unknown): ApproveMemberInput | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;

  const role = typeof b.role === "string" ? b.role : "";
  if (!(Object.values(MemberRole) as string[]).includes(role)) return null;

  const area = parseText(b.area, MAX_AREA_LENGTH);
  if (!area) return null;

  return { role: role as MemberRole, area };
}

/**
 * La fecha de ingreso es la de aprobación, no la del primer login: hasta acá la
 * persona no era parte de nada.
 */
export async function approveMember(id: string, input: ApproveMemberInput): Promise<MemberDetail | null> {
  await requireCoordinacion();

  const { count } = await prisma.member.updateMany({
    where: { id, isVerifiedByCoordinator: false },
    data: { isVerifiedByCoordinator: true, role: input.role, area: input.area, joinedAt: new Date() },
  });
  if (count === 0) {
    const exists = await prisma.member.findUnique({ where: { id }, select: { id: true } });
    if (!exists) return null;
    throw new ApiError(409, "NOT_PENDING", "Esa cuenta ya estaba aprobada");
  }

  return getMember(id);
}

/**
 * Rechaza una solicitud o saca a un miembro: en ambos casos borra la fila, que
 * es también la identidad de Better Auth (sesiones y cuenta de GitHub caen en
 * cascada). Sus tareas quedan sin asignar y sus documentos y eventos sin autor.
 * Como el registro es abierto, la persona puede volver a entrar y quedaría de
 * nuevo pendiente.
 *
 * Quien borra es coordinación y no puede borrarse a sí mismo, así que nunca se
 * queda la plataforma sin coordinación por esta vía.
 */
export async function deleteMember(id: string): Promise<boolean> {
  const actor = await requireCoordinacion();
  if (actor.id === id) {
    throw new ApiError(422, "CANNOT_REMOVE_SELF", "No puedes eliminar tu propia cuenta");
  }

  const { count } = await prisma.member.deleteMany({ where: { id } });
  return count > 0;
}
