# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

The project uses **pnpm**, pinned via `packageManager` in `package.json`. Never use `npm` or `npx`
here — `package-lock.json` was deliberately removed, and an `npm install` would build a dependency
tree that does not match `pnpm-lock.yaml`.

```bash
pnpm dev                    # Dev server at http://localhost:3000
pnpm build                  # Production build
pnpm lint                   # ESLint
pnpm exec prisma generate   # Regenerate the Prisma client into src/generated/prisma
pnpm exec prisma migrate dev --name <name>
pnpm exec prisma db seed    # Wipes and reseeds demo data (see the caveat below)
pnpm add <pkg>              # Add a dependency
```

Use `pnpm exec`, **not** `pnpm dlx`, for `prisma`. `prisma` is a local devDependency and its version
has to match `@prisma/client`; `pnpm dlx` would fetch a separate copy into a temporary store and
ignore that pin. `pnpm dlx` is only for packages that are *not* installed here (the npx equivalent
for one-off tools).

`prisma db seed` deletes only members with no OAuth `Account` — the demo ones. A real account's row
is its identity, so deleting it would delete the person and their sessions.

There is no test suite configured yet.

## Stack

- **Next.js 16** with App Router (`src/app/`)
- **React 19** with React Compiler enabled (`reactCompiler: true` in `next.config.ts`)
- **TypeScript** with strict mode
- **Prisma 7** against **PostgreSQL on Neon**, via the driver adapter (`@prisma/adapter-neon`)
- **TanStack Query v5** for server-state caching
- **Better Auth** with GitHub OAuth
- **Tailwind CSS v4**, but the UI is overwhelmingly hand-written CSS in `src/app/globals.css`
- **Barlow / Barlow Condensed / Space Mono** fonts, loaded via `next/font/google`

There is no component library (no shadcn/ui, no Radix) and no form library (no react-hook-form, no
zod). Primitives are hand-written in `src/components/ui/`; forms are native `<form onSubmit>` with
one `useState` per field. Follow those conventions rather than introducing dependencies.

## Path alias

`@/*` maps to `src/*` — use `@/components/...`, `@/lib/...`, etc.

## Architecture

### The `.ts` / `.server.ts` split

Each domain has two files in `src/lib/api/`:

- `projects.ts`, `members.ts` — client-safe. Types, `fetch()` wrappers, TanStack Query hooks and
  query-key factories.
- `projects.server.ts`, `members.server.ts` — the **only** two files that import `@/lib/prisma`.
  Prisma queries plus mapping to view models. Both carry `import "server-only"`.

Route handlers in `src/app/api/**` are thin: they parse params and delegate. Server pages prefetch
with the `.server.ts` function and ship a dehydrated cache through `<HydrationBoundary>`; the client
component then reads the same query key.

Domain rules that live in code, not the schema: `Task.done` is derived (`column === "LISTO"`), and
feature/task labels (`F-01`, `T-01`) are generated server-side. The API addresses features and tasks
by **label**, not by cuid.

### Authentication and authorization

`src/lib/auth.ts` holds the Better Auth instance (GitHub only, no domain restriction — anyone with a
GitHub account can sign up, and `Member.isVerifiedByCoordinator` is the only thing gating access).
Approval is manual via SQL; see `docs/TODO.md`.
`src/lib/auth/guards.ts` is the enforcement point:

- `getCurrentMember()` — the `Member` behind the session, or `null`. Wrapped in React `cache()`. It rereads
  the row instead of trusting `session.user` because `role` and `isVerifiedByCoordinator` are domain
  fields Better Auth does not carry in the session — and so a role change takes effect without
  signing in again.
- `requireMember()` / `requireCoordinacion()` — throw `AuthError`.

Two rules worth knowing before changing anything here:

1. **Guards throw, they do not redirect.** Pages load data through `queryClient.prefetchQuery()`,
   which swallows exceptions — a Next `redirect()` thrown inside a `.server.ts` function would be
   lost silently. Redirects live only in `src/app/(dashboard)/layout.tsx`, `src/app/login/page.tsx`
   and `src/proxy.ts`.
   `withAuth` (`src/lib/api/route-handler.ts`) authenticates first, then translates `AuthError` into
   401/403. It runs before the handler on purpose: handlers parse the body before reaching the
   `.server.ts` layer, so without it an anonymous request would get a 400 instead of a 401.
2. **`src/proxy.ts` is optimistic only.** Next 16 renamed `middleware.ts` to `proxy.ts`. It checks
   whether the session cookie exists, nothing more — Prisma with the Neon adapter does not run well
   there. Never move a real security check into it. It also excludes `/api` entirely: those routes
   answer with 401/403 JSON, and redirecting them would make the client's `fetch` follow the 307 and
   receive the login HTML with status 200. The "already signed in, skip `/login`" check deliberately
   lives in `src/app/login/page.tsx` rather than the proxy — doing it on cookie presence alone loops
   forever against the layout once a cookie outlives its session.

### `Member` is the user

There is no separate `User` model. `Member` is both the domain profile (role, area, level, streak,
skills) and Better Auth's identity, wired with `user: { modelName: "member" }` in `src/lib/auth.ts`.
Everything already pointed at `Member` — `Task.assigneeId`, `Document.authorId`,
`ProjectMember.memberId`, `Standup.memberId` — and `Session.userId` / `Account.userId` now do too.

This works because **every member is born from a login**; there is no pre-registration. If that ever
changes and coordination needs to create members before they sign in, this is the decision to
revisit.

Two consequences worth knowing:

- Every domain column on `Member` needs a `@default` (`role` → `ROOKIE`, `area` → `"Sin asignar"`,
  and so on). Better Auth inserts the row knowing only its own fields, so anything `NOT NULL`
  without a default would break sign-up. That is also why there is no creation hook.
- `prisma db seed` deletes only members with no OAuth `Account` — the demo ones. Deleting a real
  account's row would delete the person entirely, sessions included.

## Known state

`docs/TODO.md` is the source of truth for gaps and for decisions that were made deliberately (rather
than forgotten). Notably, the Dashboard and Tiempo views plus `src/lib/breadcrumbs.ts` still import
mock data directly from `prisma/seed/data/*`.
