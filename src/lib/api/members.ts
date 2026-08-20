import { useQuery } from "@tanstack/react-query";
import type { BadgeColor } from "@/lib/api/status";
import { assertOk } from "@/lib/api/http";

export type AchievementIcon = "star" | "speech" | "bolt" | "file" | "lock";

export interface MemberListItem {
  id: string;
  name: string;
  initials: string;
  area: string;
  email: string;
  status: string;
  statusColor: BadgeColor;
  rankFilled: number;
  birthday: string;
  projects: { id: string; name: string }[];
}

export interface MemberProjectDetail {
  id: string;
  name: string;
  role: string;
  status: string;
  statusColor: BadgeColor;
}

export interface MemberAchievementView {
  id: string;
  name: string;
  icon: AchievementIcon;
  unlocked: boolean;
}

export interface MemberStandupView {
  date: string;
  text: string;
}

export interface MemberDetail extends MemberListItem {
  joinedAt: string;
  level: number;
  streak: number;
  skills: string[];
  projects: MemberProjectDetail[];
  achievements: MemberAchievementView[];
  standups: MemberStandupView[];
}

export const membersKeys = {
  all: ["members"] as const,
  list: () => [...membersKeys.all, "list"] as const,
  detail: (id: string) => [...membersKeys.all, "detail", id] as const,
};

async function fetchMembers(): Promise<MemberListItem[]> {
  const res = await fetch("/api/members");
  await assertOk(res, "No se pudo cargar la lista de miembros");
  return res.json();
}

async function fetchMember(id: string): Promise<MemberDetail | null> {
  const res = await fetch(`/api/members/${id}`);
  if (res.status === 404) return null;
  await assertOk(res, "No se pudo cargar el miembro");
  return res.json();
}

export function useMembers() {
  return useQuery({ queryKey: membersKeys.list(), queryFn: fetchMembers });
}

export function useMember(id: string) {
  return useQuery({ queryKey: membersKeys.detail(id), queryFn: () => fetchMember(id) });
}
