import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const PUBLIC_PATHS = ["/login", "/pendiente"];

/**
 * Equivalente a middleware.ts; Next 16 lo renombró a proxy.ts.
 *
 * Chequeo optimista: comprueba la presencia de la cookie, no su validez. Es
 * intencional — Prisma con el adapter de Neon no es viable en este runtime y
 * añadiría una consulta por request. Solo evita el render al visitante anónimo.
 *
 * La protección efectiva está en (dashboard)/layout.tsx y en los guards de
 * src/lib/auth/guards.ts.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Solo el caso anónimo. La redirección inversa (cookie presente -> /dashboard)
  // está en src/app/login/page.tsx, que valida la sesión: resolverla aquí por
  // presencia de cookie genera un ciclo de redirects contra el layout cuando la
  // cookie sobrevive a su sesión.
  if (!getSessionCookie(request) && !PUBLIC_PATHS.includes(pathname)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // /api excluido: esas rutas resuelven su propia auth y responden 401/403 JSON.
  // Un 307 desde aquí sería seguido por fetch(), que recibiría el HTML de /login
  // con status 200 y assertOk() nunca vería el error.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
