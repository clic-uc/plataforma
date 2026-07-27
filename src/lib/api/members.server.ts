import { prisma } from "@/lib/prisma";
import { formatDayMonth, formatMonthYear, formatWeekdayDayMonthYear, getInitials } from "@/lib/api/format";
import { memberStatusColor, memberStatusLabel, projectStatusColor, projectStatusLabel } from "@/lib/api/status";
import type { AchievementIcon, MemberDetail, MemberListItem } from "@/lib/api/members";

const ACHIEVEMENT_ICONS: readonly string[] = ["star", "speech", "bolt", "file", "lock"];

function toAchievementIcon(icon: string): AchievementIcon {
  return (ACHIEVEMENT_ICONS.includes(icon) ? icon : "lock") as AchievementIcon;
}

function rankFromLevel(level: number): number {
  return Math.min(4, Math.max(0, level));
}

export async function getMembers(): Promise<MemberListItem[]> {
  const members = await prisma.member.findMany({
    orderBy: { name: "asc" },
    include: {
      projects: { include: { project: { select: { id: true, name: true } } } },
    },
  });

  return members.map((member) => ({
    id: member.id,
    name: member.name,
    initials: getInitials(member.name),
    area: member.area,
    email: member.email,
    status: memberStatusLabel[member.status],
    statusColor: memberStatusColor[member.status],
    rankFilled: rankFromLevel(member.level),
    birthday: member.birthday ? formatDayMonth(member.birthday) : "—",
    projects: member.projects.map((pm) => ({ id: pm.project.id, name: pm.project.name })),
  }));
}

export async function getMember(id: string): Promise<MemberDetail | null> {
  const member = await prisma.member.findUnique({
    where: { id },
    include: {
      projects: { include: { project: true } },
      achievements: { include: { achievement: true } },
      standups: { orderBy: { date: "desc" } },
    },
  });
  if (!member) return null;

  return {
    id: member.id,
    name: member.name,
    initials: getInitials(member.name),
    area: member.area,
    email: member.email,
    status: memberStatusLabel[member.status],
    statusColor: memberStatusColor[member.status],
    rankFilled: rankFromLevel(member.level),
    birthday: member.birthday ? formatDayMonth(member.birthday) : "—",
    joinedAt: formatMonthYear(member.joinedAt),
    level: member.level,
    streak: member.streak,
    skills: member.skills,
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
    standups: member.standups.map((s) => ({ date: formatWeekdayDayMonthYear(s.date), text: s.text })),
  };
}
