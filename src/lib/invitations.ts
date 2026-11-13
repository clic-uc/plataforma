/**
 * Reglas de las invitaciones (lista de usuarios de GitHub que pueden crear una
 * cuenta). Puro y client-safe: lo usan el formulario de "Pendientes", el parseo
 * del servidor y el hook de alta de Better Auth (src/lib/auth/invitations.ts).
 */

import type { MemberRole } from "@/generated/prisma/enums";

/**
 * Código con que el callback de GitHub vuelve a /login (?error=...) cuando la
 * cuenta no está invitada. Better Auth lo arma con el mensaje del APIError que
 * lanza el hook, así que este string es a la vez el mensaje y el código.
 */
export const GITHUB_NOT_INVITED_ERROR = "github_not_invited";

export const MAX_GITHUB_LOGIN_LENGTH = 39;

/** Reglas de GitHub: alfanuméricos y guiones simples, sin guion al principio ni al final. */
const GITHUB_LOGIN_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Lo que escribe coordinación → el usuario tal como se guarda: sin espacios, sin
 * una "@" inicial y en minúsculas (GitHub no distingue mayúsculas en el login).
 * null si no es un usuario de GitHub válido.
 */
export function normalizeGithubLogin(value: string): string | null {
  const login = value.trim().replace(/^@/, "").toLowerCase();
  if (login.length === 0 || login.length > MAX_GITHUB_LOGIN_LENGTH) return null;
  return GITHUB_LOGIN_PATTERN.test(login) ? login : null;
}

/**
 * La forma en que se busca un login que viene de GitHub. No se valida el formato:
 * hay cuentas antiguas con guiones dobles o finales que las reglas de hoy no
 * aceptarían, y si no están en la lista simplemente no se encuentran.
 */
export function githubLoginKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const login = value.trim().toLowerCase();
  return login || null;
}

export type SignUpDecision = { allowed: true; role: MemberRole } | { allowed: false };

/**
 * Decide si el primer login de alguien crea su cuenta. Solo con una invitación sin
 * usar: una usada ya creó una cuenta, y si esa cuenta se borró después, volver a
 * entrar requiere que coordinación la invite de nuevo.
 */
export function decideSignUp(invitation: { role: MemberRole; usedAt: Date | null } | null): SignUpDecision {
  if (!invitation || invitation.usedAt !== null) return { allowed: false };
  return { allowed: true, role: invitation.role };
}
