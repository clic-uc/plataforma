import "server-only";

export type ApiErrorCode =
  | "PRECONDITION_REQUIRED"
  | "LABELS_CHANGED"
  | "INVALID_MEMBER"
  | "NOT_PROJECT_MEMBER"
  | "ALREADY_PROJECT_MEMBER";

/**
 * Rechazo de dominio que la capa .server.ts no puede expresar devolviendo null
 * (que los handlers traducen a 404). withAuth lo mapea a { error, code } con su
 * status; el mensaje está pensado para mostrarse tal cual en la UI.
 */
export class ApiError extends Error {
  constructor(
    readonly status: 409 | 412 | 422 | 428,
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
