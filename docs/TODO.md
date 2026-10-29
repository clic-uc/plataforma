# Pendiente

Solo lo que falta. Cómo funciona hoy cada módulo, y las decisiones que se tomaron a propósito, está
en `CLAUDE.md` (sección "Domain behaviour").

## Dashboard

- **Crear un acta no aparece en la actividad**: `Acta` no tiene `createdAt` (`date` es la fecha de la
  reunión); hoy solo aparece cuando alguien guarda una versión.
- **Actividad de la organización, solo para coordinación**: el feed del Dashboard muestra solo la
  actividad de mis proyectos. Coordinación podría tener además un bloque con lo que no cuelga de un
  proyecto: StandUps enviados, miembros aprobados, eventos sin proyecto (y quizá proyectos creados o
  archivados). `describeActivity` en `src/lib/dashboard.ts` ya sabe mostrar `standup` y
  `member_joined`; falta la query (como la que había en `getActivity` antes de acotarla) y el panel.
- Asistentes de reuniones (el mock mostraba "5 asistentes"): no hay modelo (`EventAttendee`).
- `Member.streak` no lo usa nadie: la racha se deriva de los StandUps en el Dashboard y en
  Analíticas, pero el perfil todavía muestra la columna (siempre 0). Mostrar ahí la derivada y borrar
  la columna.

## Analíticas

- Burndown por feature o proyecto (hay historial desde el 29 oct, falta la vista).
- Horas por feature (las de tarea ya existen: `TimeEntry.taskId`).
- Issues abiertos vs. cerrados por semana y tiempo de cierre (se puede con `createdAt`/`closedAt`, sin
  migrar).
- Exportar a CSV.
- Historial de estado de miembro (desde cuándo alguien está en Hiatus) y `verifiedAt` (ver Auditoría).

## Calendario

- Arrastrar para mover o redimensionar eventos.
- Editar o borrar "esta y las siguientes" de una serie.
- Filtros por proyecto o tipo (el `projectId` ya está para eso).
- Asistentes y RSVP, recordatorios, exportar `.ics` o sincronizar con Google Calendar.

## Tiempo y StandUp

- Recordatorio del StandUp (notificación o correo) y badge en el sidebar.
- `TimeEntryView.task` no trae el id: al editar, `TimeEntryModal` reconoce la tarea por su label
  vigente. Agregar el id lo simplificaría.
- Deshacer "Descartar" en las horas pendientes (hoy no hay forma desde la UI).
- Exportar horas (CSV) para informes a clientes.

## Miembros

- Mensajería interna: "Enviar correo" abre un `mailto:`.
- Racha y logros no se pueden editar ni se calculan solos; el nivel lo fija coordinación a mano.
- Campos que existían en el mock original y no tienen columna en el schema: `telegram`,
  `rankNumber`/`ranking` (esto se pensaba calcular, no persistir), `areaLabel` (categoría corta tipo
  "PROYECTOS"/"WEB"/"LAB"), color propio por miembro. Si se quieren recuperar, hay que agregar
  columnas reales.

## MCP

- **"Apps conectadas" en el perfil**: ver y revocar los clientes MCP autorizados. Hoy se revoca
  borrando las filas de `OauthAccessToken` (o esperando que venza el refresh token, 7 días).
- **Limpieza de clientes registrados.** El registro dinámico es anónimo, así que cada cliente que se
  registra deja una fila en `OauthApplication` aunque nunca llegue a autorizarse.
- **CIMD** (Client ID Metadata Documents): la spec de MCP 2026-07-28 lo prefiere al registro
  dinámico. El plugin de Better Auth solo hace registro dinámico; los clientes actuales lo siguen
  aceptando.
- Tools que quedaron fuera de la primera versión: acciones de coordinación, borrar tareas o features,
  editar o borrar eventos, crear actas, comentarios de documentos.

## Autenticación y permisos

- **Acotar la autorización por proyecto.** Hoy solo se distinguen los proyectos (únicamente
  coordinación los crea, edita o borra); todo lo demás lo puede hacer cualquier miembro sobre
  cualquier proyecto. Si se quiere acotar más, `ProjectMember` es la pieza natural.
- **El registro es abierto.** Cualquiera con cuenta de GitHub puede crear una fila `Member`
  pendiente. No accede a nada, pero escribe en la base. Mitigación más barata si molesta: un
  allowlist de usuarios de GitHub en un `databaseHooks.user.create.before`, o `disableImplicitSignUp`
  con flujo de invitación.
- **Pre-registro.** El modelo asume que todo `Member` nace de un login. Si coordinación necesitara
  crear miembros antes de que entren, hay que volver a separar la identidad o vincular por usuario de
  GitHub (`githubLogin`), porque el correo de GitHub no tiene por qué coincidir con el que tenga
  anotado coordinación.
- **Auditoría de la aprobación.** `isVerifiedByCoordinator` es un booleano: no registra quién aprobó
  ni cuándo. Si se necesita, migrar a `verifiedAt` + `verifiedById` — el histórico previo no se
  recupera.
- **Auditoría de acciones.** `requireMember()` devuelve el `Member` que actúa, pero eso no se registra
  en ninguna parte salvo `Document.authorId`, `DocVersion.authorId` y `DocComment.authorId`.

## Diseño

- **Contraste del botón primario en modo oscuro**: `--accent` #3d95dc con texto blanco da ~3.2:1.
  Oscurecerlo (≈#2b7cc0) lo arregla para botones pero baja los links en `text-accent` a ~3.8:1;
  hay que separar un token para fondo de botón y otro para texto.
- **Checkbox "activa" en Tareas**: marcada significa "visible en el kanban" y desmarcada se ve gris,
  como si estuviera terminada. Mejor un toggle "En kanban" o moverlo al modal de edición.
- **Título duplicado** en el editor y en la página de issue (breadcrumb y contenido).
- **Tema oscuro con destello**: el tema se aplica después de hidratar; un script inline en `<head>`
  lo evitaría.

## Tailwind

- Migrar el CSS de `globals.css` a Tailwind de forma gradual: ver [docs/tailwind-migration.md](tailwind-migration.md).
