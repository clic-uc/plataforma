// Usuarios de prueba para la rama dev de Neon: un miembro aprobado por rol, para probar
// permisos y el recorrido de cada uno sin usar cuentas reales. Entran con email y
// contraseña, que Better Auth solo habilita cuando ENABLE_TEST_LOGIN=1 y no se está en
// Vercel: en producción no existe esa forma de entrar, aunque las filas existieran.
// `scripts/dev-test-users.mjs` los crea (repite esta lista; mantener las dos en sintonía).

export const TEST_USERS = [
  { role: "ROOKIE", label: "Rookie", email: "rookie@test.clic.local" },
  { role: "EQUIPO", label: "Equipo", email: "equipo@test.clic.local" },
  { role: "COORDINACION", label: "Coordinación", email: "coordinacion@test.clic.local" },
] as const;

export const DEFAULT_TEST_USERS_PASSWORD = "clic-dev-pass";

export function isTestLoginEnabled(): boolean {
  return process.env.ENABLE_TEST_LOGIN === "1" && !process.env.VERCEL;
}

export function testUsersPassword(): string {
  return process.env.TEST_USERS_PASSWORD || DEFAULT_TEST_USERS_PASSWORD;
}
