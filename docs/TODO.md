# Pendiente

Solo lo que falta. Cómo funciona hoy cada módulo, y las decisiones que se tomaron a propósito, está
en `CLAUDE.md` (sección "Domain behaviour").

## Dashboard

- **El Dashboard sigue 100% hardcodeado** (`prisma/seed/data/dashboard.ts`, importado directo por
  `DashboardView`, `DashboardCalendarCard` y `StatCard`). No hay modelo para el feed de actividad
  (`ActivityFeedItem` o similar). El calendario y las horas ya tienen modelo y vista propia
  (`/calendario` y `/tiempo`), pero las tarjetas del dashboard siguen mostrando el mock.
- Cuando el Dashboard tenga datos reales, borrar `prisma/seed/data/dashboard.ts` y con él la carpeta
  `prisma/seed`, que es lo único que queda del seed.

## Calendario

- Arrastrar para mover o redimensionar eventos.
- Editar o borrar "esta y las siguientes" de una serie.
- Filtros por proyecto o tipo (el `projectId` ya está para eso).
- Asistentes y RSVP, recordatorios, exportar `.ics` o sincronizar con Google Calendar.
- Conectar `DashboardCalendarCard` a datos reales y agregarle un link "Ver calendario →".

## Tiempo y StandUp

- Vista de coordinación: horas y StandUps del equipo por persona o proyecto, y quién está pendiente.
- Recordatorio del StandUp (notificación o correo) y badge en el sidebar.
- Vincular horas a tareas del kanban (hoy solo proyecto + descripción).
- Exportar horas (CSV) para informes a clientes.
- La racha (`Member.streak`) podría derivarse de semanas consecutivas con StandUp; hoy no se calcula.

## Miembros

- Mensajería interna: "Enviar correo" abre un `mailto:`.
- Racha y logros no se pueden editar ni se calculan solos; el nivel lo fija coordinación a mano.
- Campos que existían en el mock original y no tienen columna en el schema: `telegram`,
  `rankNumber`/`ranking` (esto se pensaba calcular, no persistir), `areaLabel` (categoría corta tipo
  "PROYECTOS"/"WEB"/"LAB"), color propio por miembro. Si se quieren recuperar, hay que agregar
  columnas reales.

## Documentos y Actas

- "Compartir enlace" en el editor no hace nada.

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
