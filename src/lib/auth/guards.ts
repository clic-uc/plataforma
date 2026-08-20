import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import type { CurrentMember } from "@/lib/auth/current-member";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/// El status HTTP no basta: PENDING_APPROVAL y FORBIDDEN_ROLE son ambos 403 pero
/// el cliente los trata distinto (redirect a /pendiente vs. error en la vista).
export type AuthErrorCode = "UNAUTHENTICATED" | "PENDING_APPROVAL" | "FORBIDDEN_ROLE";

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
 * Member asociado a la sesión, o null si no hay sesión activa.
 *
 * Relee la fila en lugar de usar session.user: role e isVerifiedByCoordinator no
 * están declarados como additionalFields, así que no viajan en la sesión. Como
 * efecto secundario, un cambio de rol aplica sin re-login.
 *
 * cache() de React deduplica la llamada dentro de un mismo request.
 */
export const getCurrentMember = cache(async (): Promise<CurrentMember | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const member = await prisma.member.findUnique({ where: { id: session.user.id } });
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
