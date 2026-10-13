# Plan: módulo Calendario

Rama: `feat/calendario` (desde `dev`).

Objetivo: una vista `/calendario` para crear, ver y editar eventos en vista **mes** y **semana**. La
tarjeta `DashboardCalendarCard` del dashboard se queda como está (mock); conectarla a datos reales
queda como paso opcional al final.

## Decisiones (con recomendación)

| # | Decisión | Recomendación v1 |
|---|----------|------------------|
| 1 | Quién crea / edita / borra | Cualquier miembro aprobado crea. Editar y borrar: el creador o `COORDINACION`. |
| 2 | Eventos recurrentes (reunión de área, standup) | Sin recurrencia real. Al crear, opción "Repetir semanalmente hasta…" que genera N copias con un `seriesId` común; editar/borrar actúa sobre una ocurrencia (o "esta y las siguientes" en una fase posterior). |
| 3 | Zona horaria | Hora local del navegador (todos en Chile). Eventos con hora: instantes UTC. Eventos de día completo: fechas sin hora, guardadas a medianoche UTC y leídas con getters UTC, para que no se corran de día. |
| 4 | Asociar a proyecto | Opcional (`projectId` nullable). Permite filtrar por proyecto más adelante. |
| 5 | Asistentes / RSVP, recordatorios, sync con Google Calendar, drag & drop | Fuera de alcance v1. |

## Modelo de datos

```prisma
enum EventKind {
  REUNION
  ENTREGA
  HITO
  OTRO
}

model CalendarEvent {
  id          String    @id @default(cuid())
  title       String
  description String?
  location    String?   /// sala o link de videollamada
  kind        EventKind @default(OTRO)
  allDay      Boolean   @default(false)
  startsAt    DateTime  /// allDay: medianoche UTC del primer día
  endsAt      DateTime  /// exclusivo. allDay: medianoche UTC del día siguiente al último
  seriesId    String?   /// copias generadas por "repetir semanalmente"
  projectId   String?
  createdById String
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  project   Project? @relation(fields: [projectId], references: [id], onDelete: SetNull)
  createdBy Member   @relation("EventCreator", fields: [createdById], references: [id])

  @@index([startsAt])
  @@index([seriesId])
}
```

- Agregar las relaciones inversas en `Member` (`eventsCreated`) y `Project` (`events`).
- `kind` determina el color reusando la paleta existente (accent / green / amber / gris), mapeado en
  una función pura junto a `status.ts`. Sin color libre, igual que proyectos (ver `TODO.md`).
- Migración: `pnpm exec prisma migrate dev --name calendar_events`.
- Seed: `calendarEvent.deleteMany()` antes de borrar miembros y proyectos, y una docena de eventos
  demo relativos a la fecha actual (reuniones de área semanales, una demo, un sprint review, un
  evento de día completo de varios días).

## Capa servidor

`src/lib/api/events.server.ts` (`import "server-only"`; pasa a ser el tercer archivo que importa
`@/lib/prisma` — actualizar `CLAUDE.md`):

- `getEvents(from, to)` — `from`/`to` son `YYYY-MM-DD` del rango visible de la grilla (`to`
  exclusivo). Devuelve eventos que se solapan (`startsAt < to+1d AND endsAt > from-1d`); el margen de
  un día cubre la diferencia entre UTC y la hora local, y el cliente coloca cada evento con precisión.
- `parseCreateEventInput` / `parseUpdateEventInput` — validación manual como el resto
  (`parseCreateActaInput`): título no vacío, `kind` válido, fechas bien formadas, `endsAt > startsAt`,
  `projectId` existente si viene, tope de copias en la repetición (p. ej. 26 semanas).
- `createEvent`, `updateEvent`, `deleteEvent` — `requireMember()`; editar/borrar comprueban creador o
  `COORDINACION` y si no lanzan `AuthError(403, "FORBIDDEN_ROLE", …)`.
- View model `CalendarEventView`: `{ id, title, description, location, kind, allDay, startsAt,
  endsAt, project: { id, name } | null, createdBy: { id, name, initials }, canEdit }`. `canEdit` se
  calcula en servidor para que la UI esconda los botones (presentación; el servidor sigue
  rechazando).

Rutas (delgadas, envueltas en `withAuth`):

- `GET  /api/events?from=YYYY-MM-DD&to=YYYY-MM-DD` (400 si falta o el rango supera ~45 días)
- `POST /api/events` → devuelve el/los eventos creados
- `PATCH /api/events/[id]`, `DELETE /api/events/[id]` (404 si no existe)

No hay labels, así que no aplica `X-Labels-Token`: last-write-wins.

## Capa cliente

`src/lib/api/events.ts`: tipos, `fetch` con `assertOk`, `eventsKeys = { all, range(from, to) }`,
`useEvents(from, to)` con `placeholderData: keepPreviousData` (navegar entre meses no parpadea) y
mutaciones que invalidan `eventsKeys.all` (más simple que parchar cada rango cacheado).

`src/lib/calendar.ts` — lógica pura, testeable sin mocks:

- `monthGrid(date)` → semanas lunes–domingo que cubren el mes (5 o 6 filas), con `from`/`to`.
- `weekRange(date)` → lunes a domingo.
- `eventsByDay(events, days)` → reparte eventos (incluye multi-día y la regla UTC de `allDay`).
- `layoutDayColumn(events)` → carriles para eventos solapados en la vista semana (columna + ancho).
- Navegación: `addMonths`, `addWeeks`, títulos (`"Octubre 2026"`, `"5 – 11 oct 2026"`) con
  `Intl.DateTimeFormat("es-CL")`, siguiendo `format.ts`.

## UI

Ruta `src/app/(dashboard)/calendario/page.tsx`. El estado de la vista vive en la URL:
`/calendario?vista=mes|semana&fecha=YYYY-MM-DD` (botón atrás y links compartibles funcionan). La
página prefetchea el rango correspondiente con `getEvents` y lo hidrata; sin `fecha`, el servidor
usa la fecha de hoy en `America/Santiago` (si el navegador difiere, solo hay un refetch).

`src/components/views/CalendarView.tsx`:

- **Toolbar**: `‹ Hoy ›`, título del período, toggle Mes / Semana, `+ Nuevo evento`. Atajos de
  teclado opcionales: `←`/`→`, `t` (hoy), `m`/`s`.
- **Vista mes** (`CalendarMonth`): grilla 7 columnas, hoy resaltado, días de otros meses atenuados
  pero clickeables, hasta 3 chips por día + "+N más" (abre la vista semana de ese día). Clic en el
  hueco de un día → crear con esa fecha. Eventos multi-día como chip en cada día que cubren.
- **Vista semana** (`CalendarWeek`): fila "todo el día" arriba; columna de horas 07:00–22:00 en
  bloques de 30 min; eventos posicionados absolutos por minuto de inicio/fin, solapados en carriles;
  línea de hora actual; scroll inicial a las 08:00. Clic en un slot vacío → crear de 1 h en esa hora.
- **Modales** (sobre `Modal`, formularios nativos, un `useState` por campo):
  - `EventDetailModal`: título, tipo, horario, lugar (link clickeable si es URL), proyecto, autor,
    descripción; botones Editar / Eliminar si `canEdit`.
  - `CreateEventModal` / `EditEventModal`: título, tipo, "todo el día", fecha+hora inicio y fin
    (`input type=date/time`), proyecto (select desde `useProjects`), lugar, descripción; al crear,
    "repetir semanalmente hasta". Fin se ajusta solo al cambiar el inicio (mantiene la duración).
- CSS nuevo con prefijo `.cal-*` en `globals.css`, reutilizando tokens y el patrón `ev-green` /
  `ev-amber` de la tarjeta del dashboard.

Shell:

- `Sidebar`: "Calendario" en *Principal* (entre Proyectos y Reporte), con un `CalendarIcon` nuevo en
  `icons.tsx`, `matchPrefix: "/calendario"`.
- `breadcrumbs.ts`: `/calendario` → "Calendario".

## Tests

- `src/lib/calendar.test.ts`: grilla de meses que empiezan en domingo/lunes, febrero, cambio de
  año, semana que cruza meses, eventos multi-día, `allDay` estable en UTC−3/−4, carriles con
  solapes.
- `src/lib/api/events.server.test.ts` (mock de `@/lib/prisma` y `@/lib/auth/guards`, como
  `projects.server.test.ts`): parseo de inputs (fin antes de inicio, `kind` inválido, tope de
  repeticiones), permisos de edición/borrado (creador, coordinación, otro miembro → 403),
  generación de la serie semanal.

## Orden de trabajo (un commit por paso)

1. Schema, migración y seed.
2. `events.server.ts` + rutas `/api/events` + tests de servidor.
3. `calendar.ts` + `events.ts` + tests de la lógica pura.
4. Página, `CalendarView` con vista mes, toolbar y navegación por URL; sidebar y breadcrumb.
5. Vista semana.
6. Modales de detalle / crear / editar / eliminar.
7. Docs: `TODO.md` (sacar el calendario de "Fuera de alcance", anotar decisiones y pendientes),
   `CLAUDE.md` (tercer archivo `.server.ts`).
8. *(Opcional)* Conectar `DashboardCalendarCard` a `useEvents` y agregarle un link "Ver calendario →".

Verificación al cierre: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, y prueba manual en
`pnpm dev` (crear, editar, borrar, navegar meses/semanas, evento de día completo, serie semanal).

## Pendientes conocidos para después de v1

Arrastrar para mover/redimensionar eventos, editar "esta y las siguientes" de una serie, filtros por
proyecto/tipo, asistentes y RSVP, recordatorios, exportar `.ics` o sincronizar con Google Calendar.
