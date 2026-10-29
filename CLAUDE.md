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
pnpm typecheck              # next typegen + tsc --noEmit
pnpm test                   # Vitest, single run (pnpm test:watch for watch mode)
pnpm exec prisma generate   # Regenerate the Prisma client into src/generated/prisma
pnpm exec prisma migrate dev --name <name>
pnpm add <pkg>              # Add a dependency
```

Use `pnpm exec`, **not** `pnpm dlx`, for `prisma`. `prisma` is a local devDependency and its version
has to match `@prisma/client`; `pnpm dlx` would fetch a separate copy into a temporary store and
ignore that pin. `pnpm dlx` is only for packages that are *not* installed here (the npx equivalent
for one-off tools).

Tests are **Vitest**, colocated as `src/**/*.test.ts`, running in a Node environment. They are
unit tests: there is no test database. `server-only` is aliased to an empty stub in
`vitest.config.mts`, so `.server.ts` modules can be imported directly; mock `@/lib/prisma` and
`@/lib/auth/guards` with `vi.mock` (see `src/lib/api/projects.server.test.ts`). Prefer pulling pure
logic into its own module, as with `src/lib/api/labels.ts`, over mocking Prisma.

The Prisma client is generated into `src/generated/prisma`, which is gitignored. `pnpm build` runs
`prisma generate` itself instead of trusting `postinstall`: Vercel restores `node_modules` from its
build cache, pnpm reports "Already up to date" and skips lifecycle scripts, and `src/generated` is
not part of that cache — so without it the build fails with `Can't resolve '@/generated/prisma/...'`.

CI (`.github/workflows/ci.yml`) runs lint, typecheck, tests and build on every PR and push to `dev`
and `main`. It needs no secrets: the build does not touch the database, and the Better Auth variables
it sets are placeholders.

## Stack

- **Next.js 16** with App Router (`src/app/`)
- **React 19** with React Compiler enabled (`reactCompiler: true` in `next.config.ts`)
- **TypeScript** with strict mode
- **Prisma 7** against **PostgreSQL on Neon**, via the driver adapter (`@prisma/adapter-neon`)
- **TanStack Query v5** for server-state caching
- **Better Auth** with GitHub OAuth
- **Tailwind CSS v4**, but the UI is overwhelmingly hand-written CSS in `src/app/globals.css`
- **Barlow / Barlow Condensed / Space Mono** fonts, loaded via `next/font/google`
- **`mcp-handler` 2** + **`@modelcontextprotocol/server` 2** for the MCP server (`/api/mcp`)

There is no component library (no shadcn/ui, no Radix) and no form library (no react-hook-form).
`zod` is a dependency only because the MCP SDK takes tool input schemas in it: use it in
`src/lib/mcp/`, not for forms or API validation, which stay with the hand-written `parse*Input`. Primitives are hand-written in `src/components/ui/`; forms are native `<form onSubmit>` with
one `useState` per field. Follow those conventions rather than introducing dependencies.

## Path alias

`@/*` maps to `src/*` — use `@/components/...`, `@/lib/...`, etc.

## Architecture

### The `.ts` / `.server.ts` split

Each domain has two files in `src/lib/api/`:

- `projects.ts`, `members.ts`, `events.ts`, `tiempo.ts`, `issues.ts` — client-safe. Types, `fetch()` wrappers,
  TanStack Query hooks and query-key factories.
- `projects.server.ts`, `members.server.ts`, `events.server.ts`, `tiempo.server.ts`, `issues.server.ts` — the **only**
  files in `src/lib/api` that import `@/lib/prisma` (besides `src/lib/auth*`). Prisma queries plus
  mapping to view models. All carry `import "server-only"`.

Route handlers in `src/app/api/**` are thin: they parse params and delegate. Server pages prefetch
with the `.server.ts` function and ship a dehydrated cache through `<HydrationBoundary>`; the client
component then reads the same query key.

Domain rules that live in code, not the schema (derived `Task.done`, server-generated labels and the
`X-Labels-Token` mechanism, the date handling for events and StandUps) are described per module under
**Domain behaviour** below.

### Authentication and authorization

`src/lib/auth.ts` holds the Better Auth instance (GitHub only, no domain restriction — anyone with a
GitHub account can sign up, and `Member.isVerifiedByCoordinator` is the only thing gating access).
Coordination approves or rejects pending accounts from the "Pendientes" tab in `/miembros` (see
Domain behaviour › Members).
`src/lib/auth/guards.ts` is the enforcement point:

- `getCurrentMember()` — the `Member` behind the session, or `null`. Wrapped in React `cache()`. It rereads
  the row instead of trusting `session.user` because `role` and `isVerifiedByCoordinator` are domain
  fields Better Auth does not carry in the session — and so a role change takes effect without
  signing in again.
- `requireMember()` / `requireCoordinacion()` — throw `AuthError`.
- `runAsMember(id, fn)` — makes `getCurrentMember()` return that member instead of reading the
  session cookie, for the duration of `fn` (an `AsyncLocalStorage`). Only the MCP route uses it, so an
  OAuth token is accepted at `/api/mcp` and nowhere else in `/api`.

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

There is no separate `User` model. `Member` is both the domain profile (role, level, streak,
skills) and Better Auth's identity, wired with `user: { modelName: "member" }` in `src/lib/auth.ts`.
Everything already pointed at `Member` — `Task.assigneeId`, `Document.authorId`,
`ProjectMember.memberId`, `Standup.memberId` — and `Session.userId` / `Account.userId` now do too.

This works because **every member is born from a login**; there is no pre-registration. If that ever
changes and coordination needs to create members before they sign in, this is the decision to
revisit.

One consequence worth knowing: every domain column on `Member` needs a `@default` (`role` →
`ROOKIE`, `status` → `ACTIVO`, and so on). Better Auth inserts the row knowing only its own fields,
so anything `NOT NULL` without a default would break sign-up. That is also why there is no creation
hook. And deleting a member's row deletes the person entirely, sessions included.

## Domain behaviour

How each module works today, including the decisions that were made deliberately (so they are not
mistaken for omissions). What is still missing lives in `docs/TODO.md`.

### Calendar (`/calendario`)

Month and week views.

- **Permissions**: any approved member creates events. Editing and deleting is for whoever created
  the event or `COORDINACION` (403 `FORBIDDEN_ROLE` otherwise). `CalendarEventView.canEdit` only
  hides buttons.
- **No real recurrence.** "Repetir semanalmente hasta…" creates copies (max 26 weeks) that share a
  `seriesId`; editing or deleting acts on a single occurrence. Copies keep the wall-clock time in
  `America/Santiago` across a daylight-saving change.
- **Time zones**: timed events are UTC instants shown in the browser's local time. All-day events are
  dates at midnight UTC (exclusive end) read with UTC getters, so they do not slip a day in Chile.
  Anything that depends on the browser's time zone renders after hydration. The server uses
  `America/Santiago` only for "today" when the URL carries no date and to generate series. The rule
  and the rest of the date math live in `src/lib/calendar.ts` (pure, tested).
- **No `X-Labels-Token`**: there are no labels, so mutations are last-write-wins.
- `CalendarEvent.createdById` is optional with `ON DELETE SET NULL`: deleting a member keeps the
  events they created (shown as "Ex miembro"; only coordination can touch them).
- The color comes from the kind (`eventKindColor`); there is no free color, as with projects.
- The week view covers 24 h and opens at 08:00 so nothing falls outside the grid.

### Time and StandUps (`/tiempo`)

Weekly StandUp, this week's hours chart and the hours history.

- **One StandUp per person and week** (`@@unique([memberId, weekStart])`), Monday–Sunday in
  `America/Santiago`. Resubmitting in the same week replaces it. The current and the previous week are
  accepted (for a form opened on Sunday and sent after midnight); any other week answers 422
  `WEEK_CLOSED`. It carries "¿Qué hice?" (`text`, required) and "¿Qué aprendí?" (`learned`, optional).
  The profile shows the 6 most recent.
- **Hours are personal.** A `TimeEntry` (date, project, minutes, description) is visible, editable and
  deletable only by whoever logged it; someone else's answers 404, like a missing one. Coordination
  cannot see the team's hours.
- **Minutes come in 15-minute steps**, from 15 min to 24 h per entry. The sum of a day is not checked
  against 24 h. Hours cannot be logged in the future (by Chile's "today").
- **Any existing project**: being on its team is not required, in line with the rest of the
  authorization (see below). The form does not offer archived projects.
- **Deleting a project deletes its hours** (`deleteProject`), like its tasks. To keep them, archive it.
- **Dates**: `Standup.weekStart` and `TimeEntry.date` are dates without time at midnight UTC, like
  all-day events; over the API they travel as `"YYYY-MM-DD"`. Week math and the chart aggregation
  live in `src/lib/tiempo.ts`.
- **Chart**: columns stacked by day and project, colors `--series-1…6` (a categorical palette
  validated for color blindness in light and dark). The color is assigned by project name, not by
  hours, and from the seventh project on they are grouped as "Otros". The legend carries the total per
  project and the history is the table view.
- Without a week filter the history shows the 200 most recent entries; the week filter offers the
  last 12.
- Migration `20261014120000_standup_week_time_entries` turned existing StandUp dates into the Monday
  of their week and, if someone had two in the same one, kept the most recent.

### Members (`/miembros`)

- **Editing permissions**: each person edits their own profile (name, birthday, skills, availability).
  Role, status and level are assigned by coordination, which can also edit anyone's profile.
  `PATCH /api/members/[id]` carries those fields in an optional `admin` block; if someone who is not
  coordination sends it, 403 `FORBIDDEN_ROLE`.
- **There is always at least one coordinator.** A coordinator can drop their own role only if another
  one remains (409 `LAST_COORDINATOR`), and nobody can delete themselves (422 `CANNOT_REMOVE_SELF`).
  Those two rules suffice: whoever changes someone else's role or deletes them is coordination and
  stays so. The check is not atomic; two coordinators dropping their role at the same time could leave
  zero, which is fixed with SQL.
- **Deleting a member deletes the row**, which is also their Better Auth identity: sessions and the
  GitHub account cascade, they leave the teams, their tasks become unassigned and their documents and
  events lose their author. To set someone aside without deleting them there is the **Hiatus** status.
- **Inviting is sharing the `/login` link**: there is no pre-registration (see `Member` is the user).
- **Approving** is done from `/miembros`, "Pendientes" tab (coordination only; the sidebar shows how
  many requests wait). Approving sets the role and sets `joinedAt` to the approval date. Rejecting
  deletes the account; since signup is open, the person can come back in and is pending again.
- **Birthday** stores only day and month, in the year 2000 at noon UTC, read with UTC getters
  (`src/lib/api/member-fields.ts`).
- **Weekly availability**: `Member.availability` stores blocks `LUN_MANANA`…`VIE_NOCHE`. Monday–Friday
  × morning/afternoon/evening, no exact hours.
- `getMembers()` / `getMember()` exclude accounts with `isVerifiedByCoordinator = false`: a pending
  account is not a member yet and must not show up in the table or the selectors.
- **`area` was removed** from members and projects (migration `20261027130000_drop_area`): it was free
  text that was only displayed and filtered on, and the stored values were lost.

### Projects (`/proyectos`)

- **Project team**: managed from the member counter in the detail (`ProjectTeamModal`). Adding,
  removing or changing someone's role is `COORDINACION` only, like editing the project; everyone else
  sees the team read-only. Removing someone unassigns them from that project's tasks.
  `ProjectMember.role` is free text (max 60 characters).
- The original mock's `prCount` (PR counter), `teamLabel` (internal pod) and per-project color were
  dropped when migrating: there is no GitHub integration or equivalent column, and the app uses its
  single accent color everywhere.
- The document editor is a feature of its own, described next.

### Documents and actas

- **Content is Markdown** (GFM), stored as-is in `content`, with no migration: the plain text that
  already existed is valid Markdown. The editor (`DocEditorView`) is a `textarea` with "Escribir /
  Vista previa" tabs, and opens on the preview unless the document is empty. The toolbar
  (B/I/H1/H2/list/table/code, Ctrl+B, Ctrl+I) inserts the syntax, and Enter inside a list opens the
  next item; that logic is pure and lives in `src/lib/markdown.ts`. The toolbar and its keyboard
  handling are `MarkdownToolbar` / `useMarkdownEditor` (`src/components/ui/MarkdownToolbar.tsx`), shared
  with issues, their comments and the descriptions of features and tasks. The preview uses `react-markdown` +
  `remark-gfm` (`src/components/ui/Markdown.tsx`), which does not render raw HTML.
  - A WYSIWYG editor (Tiptap/ProseMirror) was ruled out: it forced `content` into JSON, migrating what
    exists and adding a heavy dependency; with plain text the version diff is trivial.
  - **No task lists (`- [ ]`)** on purpose: they would clash with the project's `Task` entity. There is
    no button, and if someone types the syntax it shows as text (`[ ]`), not as a checkbox.
  - Changes made by the toolbar are not in the `textarea`'s native Ctrl+Z, because React writes the
    value.
  - **The editor does not copy `doc.content` into `useState` on mount.** It keeps only what the person
    edits (`draft`) and derives the rest from the document. On a client navigation TanStack Query
    refreshes an already-cached query only after the first render, so a mount-time copy kept a stale
    (or empty) value and "Guardar" would have overwritten the document with it.
- **Version history** in `DocVersion` (migration `20261021120000_doc_versions`), shared by documents
  and actas: each row hangs off exactly one of the two (a CHECK in the migration).
  - It stores the **full text** of each version; the diff is computed when shown (`src/lib/diff.ts`,
    line-based LCS, no dependencies). `Document.content` / `Acta.content` remain the current version,
    so reading a document does not touch the history.
  - **Every save with changes is a version**, and a version is never modified afterwards. Saving with
    no changes records nothing. Merging a person's saves within a 30-minute "session" was tried, but
    saving is a deliberate click here (no autosave) and merging hid intermediate changes; it was
    removed in `20261022120000_doc_versions_immutable`.
  - **Restoring does not rewrite history**: it brings the content into the editor and, once saved, it
    is a new version.
  - The migration created an initial version for whatever already had content: for documents, with
    the creator and the creation date; for actas, with no author and the meeting date, since there is
    nothing else. Content that arrives without history gets that same initial version on its first
    save.
- **Comments on a fragment** in `DocComment` (migration `20261027120000_doc_comments`), shared by
  documents and actas like `DocVersion` (a CHECK for a single parent). Selecting text in the
  **preview** shows "+ Comentar" and the comment lands in the side panel.
  - **No threads and no resolve-versus-delete distinction**: "Resolver" deletes the row (hard
    delete). Any member can resolve any comment. Nothing records what was resolved.
  - **The fragment is anchored by its text, not by position**: `quote` (the preview text, without the
    Markdown syntax) and `occurrence` (which of its repetitions, 0 = the first). Positions would
    drift with any earlier edit; the text survives. The pure logic is in `src/lib/comments.ts` and the
    DOM side in `src/lib/comment-dom.ts`.
  - **If the fragment is rewritten** it stops being found: the comment stays in the panel (with its
    quote) without a highlight, and can still be resolved. If the quoted text appears fewer times
    than before, the first repetition is highlighted.
  - Highlighting uses the **CSS Custom Highlight API** (it does not touch React's DOM). Without it
    (Firefox before 140) comments work but are not painted. Its two `::highlight()` rules live in a
    `<style precedence>` in `DocEditorView`, not in `globals.css`, because Turbopack's CSS parser does
    not recognise that pseudo-element and warns on every build.
  - Comments are not versioned: a comment tied to text that only exists in an unsaved change stays
    there if it is not saved.
  - Comments are made only from the preview: text cannot be highlighted in the `textarea`.
- **The editor shows no metadata card** (type, project, author, creation date): it was visually
  redundant with the title and breadcrumb. The API still returns those fields (`get_document` uses
  them). Who edited and when is in the version history.
- **Creating an acta opens it** in the editor right away.

### Features and tasks

- **`Task.done` was removed from the schema** (migration `20260730130000_task_done_from_column`): a
  task counts as done when `column === LISTO`, not through a manual toggle — the checkbox was removed
  from the Tareas tab on purpose, so a task is only finished after living the whole kanban cycle.
- **Descriptions of features and tasks are Markdown**: the detail modals show them rendered and
  "Editar" opens the toolbar (`DescriptionEditor`); creation modals have the toolbar too.
- Kanban drag & drop uses native HTML5 DnD, with optimistic updates and rollback (`useMoveTask`).
  `EditTaskModal` still lets you change the column by hand.
- **Task assignment**: any member can assign, but only people on the project's team
  (`assertAssignable` in `projects.server.ts` answers 422 otherwise). A project without a team does not
  allow assigning until coordination builds it. `assigneeId` is required in the body of task
  POST/PATCH, even if `null`, so a client that does not know the field does not unassign by accident.
- **Labels are renumbered on delete** (deleting T-03 turns T-04 into T-03). This is deliberate:
  deletes are rare (mostly when correcting an initial plan) and contiguous labels are preferred. So
  that this does not make someone edit or delete the wrong entity, each `ProjectDetail` carries a
  `labelsToken` (the fingerprint of the label→id pairs up to the highest label that snapshot saw), and
  every mutation that takes labels (PATCH/DELETE of features and tasks, POST of a task with a feature)
  requires it in `X-Labels-Token`. Without the header it answers 428; if something the client saw was
  deleted or renumbered, 412 `LABELS_CHANGED` and the client reloads the project. Creating entities
  does not invalidate the token. On the client, each interaction (modal, context menu, drag) pins the
  token when it starts, not when it is sent.
- **`Task.featureId` is optional and `Task` has its own `projectId`** (migration
  `20260730120000_task_project_relation`, on top of `20260727214422_task_feature_optional`). The
  creation modal allows "Sin feature", and `createTask` / `getProject` no longer depend on the feature
  to know which project a task belongs to. The label unique went from `[featureId, label]` to
  `[projectId, label]`.

### Issues

Tickets of a project with a conversation thread, to discuss something before turning it into
features or tasks. `Issue` + `IssueComment` (migration `20261028130000_issues`). Listed in the
"Issues" tab of the project (the counter shows the open ones); each issue has its own page at
`/proyectos/[projectId]/issues/[issueNumber]`.

- **Numbered `#1, #2…` per project, never renumbered** (`@@unique([projectId, number])`), unlike
  task and feature labels: issues are closed rather than deleted and get quoted in conversations, so
  the number must be stable. That is why there is no `X-Labels-Token` here. The next number is
  max + 1; if two are created at once the unique rejects the second and `createIssue` rereads and
  retries.
- **Linked to features and tasks, many to many** (implicit tables `_IssueFeatures` / `_IssueTasks`,
  migration `20261028140000_issue_links`): a task can answer several issues and an issue can give rise
  to several tasks. Both sides must be in the same project (checked in code). "Crear tarea" / "Crear
  feature" on the issue page create it already linked (`issueNumber` in the create body); the
  "Vinculadas" panel links and unlinks existing ones (`PUT`/`DELETE
  /api/projects/[id]/{features|tasks}/[label]/issues/[number]`, `setIssueLink`). Those address the
  feature or task by label, so they require `X-Labels-Token` like every label mutation; the issue
  goes by number. `ProjectTask.issues` / `ProjectFeature.issues` carry the linked numbers, and the
  task/feature detail modals link back to them. Deleting either side removes the link. Linking or
  unlinking counts as issue activity.
- **Status**: `ABIERTO` / `CERRADO`. Closing requires a reason (`RESUELTO`, `DESCARTADO`,
  `DUPLICADO`); reopening clears it. A CHECK in the migration keeps `closeReason`/`closedAt` set if
  and only if it is closed. Type is `BUG` / `IDEA` / `PREGUNTA` (an enum, not free labels).
- **Permissions**: any approved member opens, comments, closes and reopens issues on any project.
  Title, body and type are edited by the author or `COORDINACION`. Each comment is edited only by its
  author (`editedAt` shows "editado"), not even by coordination. Deleting an issue is coordination
  only and takes its thread; comments cannot be deleted. Closing is the normal way out.
- **Thread is append-only**, so there are no concurrency tokens: the issue body is last-write-wins
  like events, and comments never overwrite each other.
- Body and comments are Markdown, rendered with the same `Markdown` component as documents.
- The list is ordered by `lastActivityAt` (creation, edit, comment, close or reopen).
- `Issue.authorId`, `closedById` and `IssueComment.authorId` are `ON DELETE SET NULL`: deleting a
  member keeps what they wrote. Deleting a project deletes its issues.
- No assignee, mentions, reactions or notifications yet; an issue belongs to exactly one project.

### MCP (`/api/mcp`)

An MCP server in the same deploy, so members can use the platform from Claude (claude.ai, Desktop,
Claude Code) or any MCP client. Streamable HTTP, stateless.

- **Auth is OAuth, served by Better Auth's `mcp` plugin** (`src/lib/auth.ts`). Clients register
  themselves (dynamic client registration, endpoints under `/api/auth/mcp/*`), the person signs in
  with GitHub at `/login` as usual, and approves the connection at `/autorizar`. Tokens live in
  `OauthAccessToken` (migration `20261028120000_mcp_oauth`); deleting a member deletes them.
  - **Consent is forced**: the plugin only asks when the client sends `prompt=consent`, and MCP
    clients do not, so a `hooks.before` in `src/lib/auth.ts` adds it. Without it anyone could register
    a client and connect an account through a link. The consent page shows the client's redirect
    hosts, since its name is self-declared.
  - The discovery metadata lives at `/.well-known/oauth-authorization-server` and
    `/.well-known/oauth-protected-resource[/api/mcp]`, excluded from `src/proxy.ts`. The issuer is
    `BETTER_AUTH_URL`, which must be the public URL of the deploy (also set as `baseURL` explicitly:
    the plugin reads it from the options, not the env).
- **Who**: approved members who are not `ROOKIE` (`requireMcpAccess()`, checked once per request in
  the route). A pending or Rookie account can get a token by signing in but gets 403 using it.
- **Tools call the same `.server.ts` functions as the API** inside `runAsMember`, so permissions and
  domain rules are identical; tool inputs go through the same `parse*Input` functions. Tools live in
  `src/lib/mcp/` by domain; `run()` turns `AuthError`/`ApiError` into error results the model reads.
  Names are English `snake_case`, descriptions Spanish.
- **Scope**: read projects, my tasks, calendar, members, my hours and StandUp; submit the StandUp;
  log, edit and delete own hours; create and edit tasks; create events; read and edit documents and
  actas; list, read, open, comment, close and reopen issues (by number, no token); link and unlink them to
  features and tasks (labelsToken), and create a task already linked (`issueNumber`). Coordination actions (projects, teams, approvals, roles) and every other delete are left out
  on purpose: rare, and some cannot be undone.
- **Tasks go by label with `labelsToken`**, like the UI: `get_project` returns it and `update_task` /
  `create_task` (with a feature) require it. `update_task` takes partial fields and fills the rest
  from the current task; that read cannot mix two tasks because `updateTask` rejects a stale token
  first.
- **Documents**: `update_document` replaces the whole content and requires the `version` (a hash of
  the content) that `get_document` returned, so an edit does not silently overwrite someone else's
  save made while the model was writing. Not atomic; the version history covers the rest.
- **Dates and times are Chile's**: `create_event` takes wall-clock times in `America/Santiago` and
  `list_events` returns them that way (`zonedTimeToInstant` / `instantToZonedTime` in
  `src/lib/calendar.ts`), so the model never computes the DST offset.
- **Connecting**: the production server (`clic`, `https://clicuc.vercel.app/api/mcp`) is registered in
  `.mcp.json`, so Claude Code offers it to anyone who opens the repo; approve it and run `/mcp` to sign
  in with GitHub. The local server is not in `.mcp.json` (it only answers while `pnpm dev` runs); add
  it per person, with user scope so it shows up both in the terminal and in the VS Code extension
  (local scope is keyed by the project path, and Windows spells the drive `C:` in one and `c:` in the
  other):

  ```bash
  claude mcp add --scope user --transport http clic-local http://localhost:3000/api/mcp
  ```

### Authorization scope

- **Only projects are told apart.** Only `COORDINACION` can create, edit or delete projects and
  compose their team. Everything else — tasks, features, actas, documents, comments, issues — can be done by
  any approved member on **any** project, whether or not they are on it. `ProjectMember` only restricts
  who a task can be assigned to.
- **The UI hides coordination actions** (new/edit/delete project, managing the team) through
  `useIsCoordinacion()` from `CurrentMemberProvider`. That is presentation only: the server is what
  rejects with 403.

### Data and seed

There is no seed. `prisma db seed`, `prisma/seed/seed.ts` and the member/project demo data were
removed, together with the `tsx` dependency only they used: the database holds real data and the seed
wiped demo records nobody reseeded. To get test data in a fresh database, sign in with GitHub and
approve the account from "Pendientes". `prisma/seed/data/dashboard.ts` is the one file left, because
the Dashboard imports it.

## Known state

`docs/TODO.md` lists only what is pending: gaps and ideas not built yet. This file describes how
things work today, including the decisions that were made deliberately. Notably, the Dashboard view
still imports mock data directly from `prisma/seed/data/dashboard.ts`.
