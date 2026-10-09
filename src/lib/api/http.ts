/**
 * Error de una respuesta de /api. `code` viene del body ({ error, code }) cuando el
 * servidor rechazó por una regla de dominio o de rol; en ese caso `message` es el
 * texto del servidor, pensado para mostrarse tal cual.
 */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

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

  const body = await res
    .clone()
    .json()
    .then((b: unknown) => (typeof b === "object" && b !== null ? (b as { error?: unknown; code?: unknown }) : null))
    .catch(() => null);
  const code = typeof body?.code === "string" ? body.code : undefined;

  if (typeof window !== "undefined") {
    if (code === "UNAUTHENTICATED") window.location.href = "/login";
    else if (code === "PENDING_APPROVAL") window.location.href = "/pendiente";
  }

  if (code && typeof body?.error === "string") {
    throw new ApiRequestError(body.error, res.status, code);
  }
  throw new ApiRequestError(message, res.status);
}

/** Mensaje para la UI: el del servidor si explicó el rechazo, si no el genérico de la vista. */
export function errorMessage(error: Error | null, fallback: string): string {
  return error instanceof ApiRequestError && error.code ? error.message : fallback;
}
