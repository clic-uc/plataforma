import { NextResponse } from "next/server";
import { AuthError, requireMember } from "@/lib/auth/guards";

/**
 * Autentica y luego ejecuta el handler, mapeando AuthError a respuestas HTTP.
 * El resto de errores se re-lanza para que Next los resuelva como 500.
 *
 * El orden importa: los handlers parsean el body antes de llamar a la capa
 * .server.ts, así que sin este chequeo previo un request anónimo obtendría 400
 * en vez de 401, exponiendo las reglas de validación sin autenticar.
 *
 * Los guards de la capa .server.ts se mantienen como defensa en profundidad. No
 * duplican consultas: getCurrentMember() está memoizado con cache() por request.
 */
export function withAuth<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      await requireMember();
      return await fn(...args);
    } catch (error) {
      if (error instanceof AuthError) {
        return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
      }
      throw error;
    }
  };
}
