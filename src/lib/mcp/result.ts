import "server-only";

import type { CallToolResult } from "@modelcontextprotocol/server";
import { AuthError } from "@/lib/auth/guards";
import { ApiError } from "@/lib/api/errors";

export function json(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
}

/** Error que el modelo lee para corregir y reintentar; no es un fallo del servidor. */
export function fail(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

/**
 * Ejecuta una tool traduciendo los rechazos de la capa .server.ts (AuthError, ApiError)
 * a un resultado de error con su mensaje. Lo demás se relanza y el SDK lo reporta.
 */
export async function run(fn: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await fn();
  } catch (error) {
    // El mensaje de la API habla de la UI ("se recargó el proyecto"); acá el modelo tiene que releer.
    if (error instanceof ApiError && error.code === "LABELS_CHANGED") {
      return fail(
        "Alguien eliminó features o tareas del proyecto y sus identificadores cambiaron. Vuelve a leerlo con get_project y usa el labelsToken nuevo.",
      );
    }
    // Las reglas del flujo de tareas: el mensaje de la API se completa con qué enviar.
    if (error instanceof ApiError && error.code === "ASSIGNEE_REQUIRED") {
      return fail(
        `${error.message}. Envía assigneeId con un miembro del equipo del proyecto (el equipo está en get_project) o deja la tarea en otra columna.`,
      );
    }
    if (error instanceof ApiError && error.code === "TIME_NOT_ALLOWED") {
      return fail(
        `${error.message}. minutesSpent solo se acepta al cambiar la columna de una tarea que está en PROGRESO o REVISION y que la persona conectada tiene asignada; si no es el caso, vuelve a intentarlo sin minutesSpent y registra las horas con log_time (con taskLabel para vincularlas a la tarea).`,
      );
    }
    if (error instanceof AuthError || error instanceof ApiError) return fail(error.message);
    throw error;
  }
}
