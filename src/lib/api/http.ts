/**
 * Valida las respuestas de /api en el cliente. Además de lanzar, navega fuera de
 * la app cuando la sesión dejó de ser utilizable; sin esto una sesión expirada se
 * manifiesta como un error genérico dentro del modal que disparó la mutación.
 *
 * FORBIDDEN_ROLE no navega: la sesión es válida y el 403 es un resultado legítimo
 * que la vista debe mostrar.
 */
export async function assertOk(res: Response, message: string): Promise<void> {
  if (res.ok) return;

  if (res.status === 401 || res.status === 403) {
    const code = await res
      .clone()
      .json()
      .then((body: unknown) => (body as { code?: string } | null)?.code)
      .catch(() => undefined);

    if (typeof window !== "undefined") {
      if (code === "UNAUTHENTICATED") window.location.href = "/login";
      else if (code === "PENDING_APPROVAL") window.location.href = "/pendiente";
    }

    if (code === "FORBIDDEN_ROLE") {
      throw new Error("Esta acción requiere rol de coordinación");
    }
  }

  throw new Error(message);
}
