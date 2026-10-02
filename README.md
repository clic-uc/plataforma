# Plataforma CLIC

Plataforma interna: proyectos, tareas, documentos y miembros.

Next.js 16 (App Router) · React 19 · Prisma 7 sobre PostgreSQL en Neon · TanStack Query ·
Better Auth con GitHub OAuth · Tailwind v4.

## Puesta en marcha

Requiere **pnpm** (está pinneado en `packageManager`; no uses npm).

```bash
pnpm install
cp .env.example .env.local   # y completa los valores
pnpm exec prisma migrate deploy
pnpm exec prisma db seed     # data de demo, opcional
pnpm dev
```

### Variables de entorno

`.env.example` lista todas. Las que hay que conseguir:

- **`DATABASE_URL` / `DATABASE_URL_UNPOOLED`** — de la consola de Neon. La primera es la pooleada
  (la usa la app), la segunda la directa (la usa el CLI de Prisma). Deben apuntar a la misma rama.
- **`BETTER_AUTH_SECRET`** — `openssl rand -base64 32`.
- **`BETTER_AUTH_URL`** — `http://localhost:3000` en local.
- **`GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`** — de una OAuth App o GitHub App, con callback
  `<BETTER_AUTH_URL>/api/auth/callback/github`. Si es una GitHub App, hay que darle permiso de
  lectura sobre *Email addresses*, o el login falla con `email_not_found`.

Trabaja siempre contra una rama de Neon que no sea producción. `prisma.config.ts` lee **solo**
`.env.local`, así que ese archivo determina a qué base van las migraciones.

## Primer acceso

Cualquiera con cuenta de GitHub puede registrarse, pero nadie entra hasta que coordinación lo
aprueba: el `Member` se crea con `isVerifiedByCoordinator = false` y la app lo deja en `/pendiente`.

Como en una base nueva no existe ningún coordinador, el primero se promueve a mano después de
iniciar sesión:

```bash
echo "UPDATE \"Member\"
      SET \"isVerifiedByCoordinator\" = true, \"role\" = 'COORDINACION'
      WHERE email = 'tu@correo.com';" | pnpm exec prisma db execute --stdin
```
Tambien se puede hacer directamente desde Neon o desde Prisma Studio
## Más

- `CLAUDE.md` — arquitectura: la separación `.ts` / `.server.ts`, dónde se aplican los guards de
  autenticación y por qué están donde están.
- `docs/TODO.md` — qué falta y qué se dejó fuera a propósito.
