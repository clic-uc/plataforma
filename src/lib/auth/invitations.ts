import "server-only";

import { APIError } from "better-auth/api";
import { prisma } from "@/lib/prisma";
import { GITHUB_NOT_INVITED_ERROR, decideSignUp, githubLoginKey } from "@/lib/invitations";

/**
 * Lo que Better Auth le pasa a los hooks de user.create: sus campos más los
 * additionalFields. githubLogin lo pone mapProfileToUser con profile.login.
 */
type CreatedUser = Record<string, unknown> & { githubLogin?: unknown };

/**
 * databaseHooks.user.create.before. Corre en la primera entrada de alguien, antes
 * del INSERT del Member; las cuentas que ya existen nunca pasan por acá.
 *
 * Sin invitación sin usar lanza un APIError en vez de devolver false: con false
 * Better Auth sigue de largo con el usuario en null, falla al crear la cuenta de
 * GitHub y redirige con el genérico "unable_to_create_user". El APIError, en
 * cambio, llega al callback como ?error=github_not_invited (su mensaje), que
 * /login sabe explicar. En ambos casos no se escribe nada.
 *
 * Todo lo que no trae githubLogin (un alta por email, que hoy está deshabilitada)
 * queda rechazado: la lista es la única puerta.
 *
 * Con invitación, el Member nace aprobado con el rol de la invitación; joinedAt es
 * ahora, como al aprobar a mano. Esos campos están declarados en
 * user.additionalFields (input: false): el adapter solo inserta campos que conoce.
 */
export async function admitInvitedUser(user: CreatedUser) {
  const login = githubLoginKey(user.githubLogin);
  const invitation = login
    ? await prisma.invitation.findUnique({ where: { githubLogin: login }, select: { role: true, usedAt: true } })
    : null;

  const decision = decideSignUp(invitation);
  if (!decision.allowed) {
    throw new APIError("FORBIDDEN", { message: GITHUB_NOT_INVITED_ERROR, code: GITHUB_NOT_INVITED_ERROR });
  }
  return { data: { role: decision.role, isVerifiedByCoordinator: true, joinedAt: new Date() } };
}

/**
 * databaseHooks.user.create.after: marca la invitación como usada.
 *
 * Va en el after y no en el before porque el adapter de Prisma corre aquí sin
 * transacción: marcarla antes del INSERT la consumiría aunque el INSERT fallara
 * después (un correo ya tomado, por ejemplo), y la persona quedaría fuera hasta que
 * coordinación la invitara de nuevo. El after solo corre si el Member se creó.
 *
 * Un fallo acá no se propaga: la cuenta ya existe y aprobada, y convertir una
 * entrada exitosa en una página de error por una anotación sería peor. La
 * invitación quedaría sin marcar; getInvitations no la muestra igual, porque su
 * login ya es de un miembro.
 */
export async function markInvitationUsed(user: CreatedUser): Promise<void> {
  const login = githubLoginKey(user.githubLogin);
  if (!login) return;
  try {
    await prisma.invitation.updateMany({
      where: { githubLogin: login, usedAt: null },
      data: { usedAt: new Date() },
    });
  } catch (error) {
    console.error(`No se pudo marcar como usada la invitación de ${login}`, error);
  }
}
