import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { cache } from "react";
import { headers } from "next/headers";
import type { CurrentMember } from "@/lib/auth/current-member";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/// El status HTTP no basta: PENDING_APPROVAL y FORBIDDEN_ROLE son ambos 403 pero
/// el cliente los trata distinto (redirect a /pendiente vs. error en la vista).
export type AuthErrorCode = "UNAUTHENTICATED" | "PENDING_APPROVAL" | "FORBIDDEN_ROLE" | "NOT_ON_TEAM";

/// Los guards lanzan en lugar de redirigir: prefetchQuery captura las excepciones
/// del queryFn, por lo que un redirect() de Next invocado dentro de una función
/// .server.ts no propagaría. Los redirect() se limitan a (dashboard)/layout.tsx,
/// login/page.tsx y proxy.ts; withAuth mapea AuthError a 401/403.
export class AuthError extends Error {
  constructor(
    readonly status: 401 | 403,
    readonly code: AuthErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * Identidad fijada por un token OAuth del MCP (src/app/api/mcp/route.ts). Va aparte de
 * la sesión por cookie para que el token sirva solo en esa ruta: el resto de /api
 * sigue aceptando únicamente la cookie.
 */
const tokenMember = new AsyncLocalStorage<string>();

/** Ejecuta fn con memberId como identidad de los guards, en lugar de la sesión. */
export function runAsMember<T>(memberId: string, fn: () => T): T {
  return tokenMember.run(memberId, fn);
}

/**
 * Member asociado a la sesión (o al token del MCP), o null si no hay sesión activa.
 *
 * Relee la fila en lugar de usar session.user: role e isVerifiedByCoordinator no
 * están declarados como additionalFields, así que no viajan en la sesión. Como
 * efecto secundario, un cambio de rol aplica sin re-login.
 *
 * cache() de React deduplica la llamada dentro de un mismo request.
 */
export const getCurrentMember = cache(async (): Promise<CurrentMember | null> => {
  const memberId = tokenMember.getStore() ?? (await auth.api.getSession({ headers: await headers() }))?.user.id;
  if (!memberId) return null;

  const member = await prisma.member.findUnique({ where: { id: memberId } });
  if (!member) return null;

  return {
    id: member.id,
    name: member.name,
    email: member.email,
    image: member.image,
    role: member.role,
    isVerified: member.isVerifiedByCoordinator,
  };
});

/** Sesión válida + cuenta aprobada. Punto de entrada de la capa .server.ts. */
export async function requireMember(): Promise<CurrentMember> {
  const member = await getCurrentMember();
  if (!member) throw new AuthError(401, "UNAUTHENTICATED", "No autenticado");
  if (!member.isVerified) {
    throw new AuthError(403, "PENDING_APPROVAL", "Cuenta pendiente de aprobación");
  }
  return member;
}

/** requireMember() + rol COORDINACION. */
export async function requireCoordinacion(): Promise<CurrentMember> {
  const member = await requireMember();
  if (member.role !== "COORDINACION") {
    throw new AuthError(403, "FORBIDDEN_ROLE", "Esta acción requiere rol de coordinación");
  }
  return member;
}

/** Si el miembro está en el equipo del proyecto (ProjectMember). */
export async function isOnProjectTeam(projectId: string, memberId: string): Promise<boolean> {
  const membership = await prisma.projectMember.findUnique({
    where: { projectId_memberId: { projectId, memberId } },
    select: { memberId: true },
  });
  return membership !== null;
}

/**
 * El miembro (ya autenticado con requireMember) es del equipo del proyecto o de
 * coordinación; si no, 403 NOT_ON_TEAM. Protege el trabajo sobre un proyecto (tareas,
 * features, documentos, actas, resolver comentarios); verlo, comentar documentos y los
 * issues siguen abiertos a cualquier miembro. La versión pura para la UI es
 * canEditProject (src/lib/project-access.ts).
 *
 * Va aparte de requireMember para que quien llama autentique primero, compruebe que el
 * proyecto o la entidad existan (404) y recién entonces decida el 403.
 */
export async function assertProjectWriter(member: CurrentMember, projectId: string): Promise<void> {
  if (member.role === "COORDINACION") return;
  if (await isOnProjectTeam(projectId, member.id)) return;
  throw new AuthError(
    403,
    "NOT_ON_TEAM",
    "Solo el equipo del proyecto o coordinación pueden hacer esto. Para opinar sobre el proyecto, abre o comenta un issue.",
  );
}

/**
 * requireMember() + no ROOKIE. Es la regla de acceso al MCP; en la app los Rookies
 * entran igual que el resto.
 */
export async function requireMcpAccess(): Promise<CurrentMember> {
  const member = await requireMember();
  if (member.role === "ROOKIE") {
    throw new AuthError(403, "FORBIDDEN_ROLE", "El acceso por MCP no está disponible para Rookies");
  }
  return member;
}
