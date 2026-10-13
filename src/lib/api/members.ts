import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MemberRole, MemberStatus } from "@/generated/prisma/enums";
import type { BadgeColor } from "@/lib/api/status";
import type { AvailabilitySlot } from "@/lib/api/member-fields";
import { assertOk } from "@/lib/api/http";
import { eventsKeys } from "@/lib/api/events";
import { projectsKeys } from "@/lib/api/projects";

export type AchievementIcon = "star" | "speech" | "bolt" | "file" | "lock";

export interface MemberListItem {
  id: string;
  name: string;
  initials: string;
  image: string | null;
  area: string;
  email: string;
  status: string;
  statusColor: BadgeColor;
  statusValue: MemberStatus;
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
  role: string;
  roleValue: MemberRole;
  /** "MM-DD", o null si no está registrado. */
  birthdayValue: string | null;
  joinedAt: string;
  level: number;
  streak: number;
  skills: string[];
  availability: AvailabilitySlot[];
  projects: MemberProjectDetail[];
  achievements: MemberAchievementView[];
  standups: MemberStandupView[];
}

/** Cuenta que entró con GitHub y espera que coordinación la apruebe. */
export interface PendingMember {
  id: string;
  name: string;
  initials: string;
  image: string | null;
  email: string;
  area: string;
  requestedAt: string;
}

/** Lo que cada persona puede editar de su propio perfil. */
export interface MemberProfileInput {
  name: string;
  /** "MM-DD", o null para borrarlo. */
  birthday: string | null;
  skills: string[];
  availability: AvailabilitySlot[];
}

/** Campos que asigna coordinación. */
export interface MemberAdminInput {
  area: string;
  role: MemberRole;
  status: MemberStatus;
  level: number;
}

/**
 * `admin` es opcional: quien edita su propio perfil sin ser coordinación no lo
 * manda, y si lo manda el servidor responde 403.
 */
export interface UpdateMemberInput extends MemberProfileInput {
  admin?: MemberAdminInput;
}

export interface ApproveMemberInput {
  role: MemberRole;
  area: string;
}

export const membersKeys = {
  all: ["members"] as const,
  list: () => [...membersKeys.all, "list"] as const,
  pending: () => [...membersKeys.all, "pending"] as const,
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

async function fetchPendingMembers(): Promise<PendingMember[]> {
  const res = await fetch("/api/members/pending");
  await assertOk(res, "No se pudo cargar la lista de solicitudes");
  return res.json();
}

async function updateMemberRequest(id: string, input: UpdateMemberInput): Promise<MemberDetail> {
  const res = await fetch(`/api/members/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  await assertOk(res, "No se pudo guardar el perfil");
  return res.json();
}

async function approveMemberRequest(id: string, input: ApproveMemberInput): Promise<MemberDetail> {
  const res = await fetch(`/api/members/${id}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  await assertOk(res, "No se pudo aprobar la cuenta");
  return res.json();
}

async function deleteMemberRequest(id: string): Promise<void> {
  const res = await fetch(`/api/members/${id}`, { method: "DELETE" });
  await assertOk(res, "No se pudo eliminar la cuenta");
}

export function useMembers(options?: { enabled?: boolean }) {
  return useQuery({ queryKey: membersKeys.list(), queryFn: fetchMembers, ...options });
}

export function useMember(id: string, options?: { enabled?: boolean }) {
  return useQuery({ queryKey: membersKeys.detail(id), queryFn: () => fetchMember(id), ...options });
}

/** Solo coordinación: para el resto el servidor responde 403. */
export function usePendingMembers(options?: { enabled?: boolean }) {
  return useQuery({ queryKey: membersKeys.pending(), queryFn: fetchPendingMembers, ...options });
}

export function useUpdateMember(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateMemberInput) => updateMemberRequest(id, input),
    onSuccess: (updated) => {
      queryClient.setQueryData(membersKeys.detail(id), updated);
      queryClient.invalidateQueries({ queryKey: membersKeys.list() });
      // Proyectos y calendario muestran el nombre de la persona.
      queryClient.invalidateQueries({ queryKey: projectsKeys.all });
      queryClient.invalidateQueries({ queryKey: eventsKeys.all });
    },
  });
}

export function useApproveMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ApproveMemberInput }) => approveMemberRequest(id, input),
    onSuccess: (approved) => {
      queryClient.setQueryData(membersKeys.detail(approved.id), approved);
      queryClient.invalidateQueries({ queryKey: membersKeys.list() });
      queryClient.invalidateQueries({ queryKey: membersKeys.pending() });
    },
  });
}

/** Sirve tanto para rechazar una solicitud pendiente como para sacar a un miembro. */
export function useDeleteMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteMemberRequest(id),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: membersKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: membersKeys.list() });
      queryClient.invalidateQueries({ queryKey: membersKeys.pending() });
      // Sale de los equipos y de las tareas que tenía asignadas; sus eventos
      // quedan como "Ex miembro".
      queryClient.invalidateQueries({ queryKey: projectsKeys.all });
      queryClient.invalidateQueries({ queryKey: eventsKeys.all });
    },
  });
}
