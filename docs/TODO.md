## Fuera de alcance mayor

- **El Dashboard sigue 100% hardcodeado** (`prisma/seed/data/dashboard.ts`, importado directo por
  `DashboardView` y `DashboardCalendarCard`). No hay modelo para el feed de actividad
  (`ActivityFeedItem` o similar). El calendario y las horas ya tienen modelo y vista propia
  (`/calendario` y `/tiempo`, ver abajo), pero las tarjetas del dashboard siguen mostrando el mock.

## Calendario

Vista `/calendario` con modos mes y semana; el plan original está en `docs/CALENDARIO.md`.

Decisiones:

- **Permisos**: cualquier miembro aprobado crea eventos. Editar y borrar es de quien lo creó o de
  `COORDINACION` (403 `FORBIDDEN_ROLE` si no). `CalendarEventView.canEdit` solo esconde botones.
- **Sin recurrencia real.** "Repetir semanalmente hasta…" crea copias (máx. 26 semanas) que comparten
  `seriesId`; editar o borrar actúa sobre una sola ocurrencia. Las copias conservan la hora de reloj
  en `America/Santiago` al cruzar un cambio de horario.
- **Zona horaria**: los eventos con hora son instantes UTC y se muestran en la hora local del
  navegador. Los de día completo son fechas a medianoche UTC (fin exclusivo) leídas con getters UTC.
  Todo lo que depende de la zona del navegador se pinta después de hidratar. El servidor usa
  `America/Santiago` solo para el "hoy" cuando la URL no trae fecha y para generar series. La regla
  vive en `src/lib/calendar.ts`.
- **Sin `X-Labels-Token`**: no hay labels, así que las mutaciones son last-write-wins.
- `CalendarEvent.createdById` es opcional con `ON DELETE SET NULL`: borrar a un miembro conserva
  los eventos que creó (los muestra como "Ex miembro" y solo coordinación puede tocarlos).
- El color lo decide el tipo (`eventKindColor`), sin color libre, igual que proyectos.
- La vista semana cubre las 24 h y abre en las 08:00, para que nada quede fuera de la grilla.

Pendiente:

- Arrastrar para mover o redimensionar eventos.
- Editar o borrar "esta y las siguientes" de una serie.
- Filtros por proyecto o tipo (el `projectId` ya está para eso).
- Asistentes y RSVP, recordatorios, exportar `.ics` o sincronizar con Google Calendar.
- Conectar `DashboardCalendarCard` a datos reales y agregarle un link "Ver calendario →".

## Tiempo y StandUp

Vista `/tiempo`: StandUp semanal, gráfico de horas de la semana e historial de horas.

Decisiones:

- **Un StandUp por persona y semana** (`@@unique([memberId, weekStart])`), lunes a domingo en
  `America/Santiago`. Reenviarlo en la misma semana lo reemplaza. Se acepta la semana en curso y la
  anterior (para un formulario abierto el domingo que se envía pasada la medianoche); cualquier otra
  responde 422 `WEEK_CLOSED`. Lleva "¿Qué hice?" (`text`, obligatorio) y "¿Qué aprendí?" (`learned`,
  opcional). El perfil muestra los 6 más recientes.
- **Las horas son personales.** `TimeEntry` (fecha, proyecto, minutos, descripción) solo lo ve,
  edita o borra quien lo registró; uno ajeno responde 404 igual que uno inexistente. Coordinación no
  ve las horas del equipo (pendiente, abajo).
- **Minutos en tramos de 15**, de 15 min a 24 h por registro. No se valida que la suma de un día
  no pase de 24 h. No se registran horas a futuro (según el "hoy" de Chile).
- **Cualquier proyecto existente**: no hace falta ser parte del equipo, en línea con el resto de la
  autorización (ver Autenticación). El formulario no ofrece los archivados.
- **Borrar un proyecto borra sus horas** (`deleteProject`), igual que sus tareas. Para conservarlas,
  archivarlo.
- **Fechas**: `Standup.weekStart` y `TimeEntry.date` son fechas sin hora a medianoche UTC, como los
  eventos de día completo; en la API viajan como `"YYYY-MM-DD"`. La regla vive en `src/lib/tiempo.ts`.
- **Gráfico**: columnas apiladas por día y proyecto, colores `--series-1…6` (paleta categórica
  validada para daltonismo en claro y oscuro). El color se asigna por nombre de proyecto, no por
  horas, y del séptimo proyecto en adelante se agrupan en "Otros". La leyenda lleva el total por
  proyecto y el historial es la vista de tabla.
- El historial sin filtro de semana muestra los 200 registros más recientes; el filtro de semana
  ofrece las últimas 12.
- La migración `20261014120000_standup_week_time_entries` convirtió la fecha de los standups
  existentes en el lunes de su semana y, si alguien tenía dos en la misma, dejó el más reciente.

Pendiente:

- Vista de coordinación: horas y StandUps del equipo por persona o proyecto, y quién está pendiente.
- Recordatorio del StandUp (notificación o correo) y badge en el sidebar.
- Vincular horas a tareas del kanban (hoy solo proyecto + descripción).
- Exportar horas (CSV) para informes a clientes.
- La racha (`Member.streak`) podría derivarse de semanas consecutivas con StandUp; hoy no se calcula.

## Miembros

Decisiones:

- **Permisos de edición**: cada persona edita su propio perfil (nombre, cumpleaños, habilidades,
  disponibilidad). Área, rol, estado y nivel los asigna coordinación, que además puede editar el
  perfil de cualquiera. `PATCH /api/members/[id]` lleva esos campos en un bloque `admin` opcional;
  si lo manda alguien que no es coordinación, 403 `FORBIDDEN_ROLE`.
- **Siempre queda al menos un coordinador.** Un coordinador puede quitarse el rol solo si queda otro
  (409 `LAST_COORDINATOR`), y nadie puede eliminarse a sí mismo (422 `CANNOT_REMOVE_SELF`). Con esas
  dos reglas basta: quien cambia el rol de otro o lo elimina es coordinación y lo sigue siendo. El
  chequeo no es atómico; dos coordinadores quitándose el rol a la vez podrían dejar cero, y eso se
  arregla por SQL.
- **Eliminar un miembro borra la fila**, que es también su identidad de Better Auth: sesiones y
  cuenta de GitHub en cascada, sale de los equipos, sus tareas quedan sin asignar y sus documentos y
  eventos sin autor. Para apartar a alguien sin borrarlo está el estado **Hiatus**.
- **Invitar es compartir el enlace de `/login`**: no hay pre-registro (ver Autenticación).
- **Cumpleaños** guarda solo día y mes, en el año 2000 a mediodía UTC, y se lee con getters UTC
  (`src/lib/api/member-fields.ts`).
- **Disponibilidad semanal**: `Member.availability` guarda bloques `LUN_MANANA`…`VIE_NOCHE`.
  Lun–Vie × mañana/tarde/noche, sin horas exactas.
- `getMembers()` / `getMember()` excluyen las cuentas con `isVerifiedByCoordinator = false`: una
  cuenta pendiente no es miembro todavía y no debe aparecer en la tabla ni en los selectores.

Pendiente:

- Mensajería interna: "Enviar correo" abre un `mailto:`.
- Racha y logros no se pueden editar ni se calculan solos; el nivel lo fija coordinación a mano.
- Campos que existían en el mock original y no tienen columna en el schema: `telegram`, `rankNumber`/`ranking`
  (esto se pensaba calcular, no persistir), `areaLabel` (categoría corta tipo "PROYECTOS"/"WEB"/"LAB", distinta de
  `area`), color propio por miembro. Si se quieren recuperar, hay que agregar columnas reales.

## Proyectos

- `prCount` (contador de PRs) y `teamLabel` (pod/equipo interno a cargo, distinto de `area`) se
  descartaron al migrar — no hay integración con GitHub ni columna equivalente.
- Color propio por proyecto se descartó (se usa el acento único de la app en todos lados). Si se
  quiere recuperar variedad de color, ver nota de Miembros arriba — mismo problema, misma solución
  pendiente.

- **Equipo del proyecto**: se gestiona desde el contador de miembros del detalle
  (`ProjectTeamModal`). Agregar, quitar o cambiar el rol de alguien es solo de `COORDINACION`, igual
  que editar el proyecto; el resto ve el equipo en modo lectura. Quitar a alguien lo desasigna de las
  tareas de ese proyecto. `ProjectMember.role` es texto libre (máx. 60 caracteres).
- El editor de documentos queda como **feature aparte**, fuera del cierre del tab. Detalle en
  "Documentos y Actas" abajo.

## Documentos y Actas

- **El contenido es Markdown** (GFM), guardado tal cual en `content`, sin migración: el texto plano
  que ya existía es Markdown válido. El editor (`DocEditorView`) es un `textarea` con pestañas
  "Escribir / Vista previa", y abre en la vista previa salvo que el documento esté vacío. La barra
  (B/I/H1/H2/Lista/Tabla/Código, Ctrl+B, Ctrl+I) inserta la sintaxis, y Enter dentro de una lista
  abre el siguiente ítem; esa lógica es pura y vive en `src/lib/markdown.ts`. La vista previa usa `react-markdown` +
  `remark-gfm` (`src/components/ui/Markdown.tsx`), que no renderiza HTML crudo.
  - Se descartó un editor WYSIWYG (Tiptap/ProseMirror): obligaba a pasar `content` a JSON, migrar
    lo existente y sumar una dependencia pesada; con texto, el futuro diff de versiones es trivial.
  - **Sin listas de tareas (`- [ ]`)** a propósito: chocarían con la entidad `Task` del proyecto. No
    hay botón, y si alguien escribe la sintaxis se muestra como texto (`[ ]`), no como checkbox.
  - Los cambios que hace la barra no entran al Ctrl+Z nativo del `textarea`, porque el valor lo
    escribe React.
- **Historial de versiones** en `DocVersion` (migración `20261021120000_doc_versions`), compartido
  por documentos y actas: cada fila cuelga de exactamente uno de los dos (CHECK en la migración).
  - Guarda el **texto completo** de cada versión; el diff se calcula al mostrarlo
    (`src/lib/diff.ts`, LCS por líneas, sin dependencias). `Document.content`/`Acta.content` siguen
    siendo la versión actual, así que leer un documento no toca el historial.
  - **Cada guardado con cambios es una versión**, y una versión no se modifica después. Guardar sin
    cambios no registra nada. Se probó fusionar los guardados de una misma persona en una "sesión"
    de 30 minutos, pero aquí guardar es un clic deliberado (no hay autoguardado) y fusionar
    escondía los cambios intermedios; se quitó en `20261022120000_doc_versions_immutable`.
  - **Restaurar no reescribe la historia**: lleva el contenido al editor y, al guardar, queda como
    una versión nueva.
  - La migración creó una versión inicial para lo que ya tenía contenido: en documentos, con el
    creador y la fecha de creación; en actas, sin autor y con la fecha de la reunión, porque no hay
    otra. Lo que llegue sin historial (el seed) recibe esa misma versión inicial al primer guardado.
- **Los metadatos (tipo, autor, fecha) son de solo lectura a propósito**: el tipo es el slot del
  proyecto, y autor/fecha describen la creación. Quién editó y cuándo está en el historial.
- Sigue pendiente en el editor: "Compartir enlace" no hace nada.

## Features y Tareas

- **`Task.done` se sacó del schema** (migración `20260730130000_task_done_from_column`): una tarea
  se considera "hecha" cuando `column === LISTO`, no por un toggle manual — se quitó el checkbox
  de la pestaña Tareas a propósito, para que solo quede lista después de vivir el ciclo completo
  del kanban.
- Drag & drop del Kanban con HTML5 DnD nativo, con actualización optimista y rollback
  (`useMoveTask`). `EditTaskModal` sigue permitiendo cambiar la columna a mano.
- **Asignación de tareas**: cualquier miembro puede asignar, pero solo a gente del equipo del
  proyecto (`assertAssignable` en `projects.server.ts` responde 422 si no). Un proyecto sin equipo
  no permite asignar hasta que coordinación lo arme. `assigneeId` es obligatorio en el body de
  POST/PATCH de tareas, aunque sea `null`: así un cliente que no conoce el campo no desasigna sin
  querer.
- **Los labels se renumeran al borrar** (borrar T-03 convierte T-04 en T-03). Es una decisión
  deliberada: los borrados son raros (sobre todo al corregir una planificación inicial) y se
  prefieren labels contiguos. Para que eso no haga editar o borrar la entidad equivocada, cada
  `ProjectDetail` trae un `labelsToken` (la huella de los pares label→id hasta el label más alto
  que vio ese snapshot), y toda mutación que recibe labels (PATCH/DELETE de features y tareas,
  POST de tarea con feature) lo exige en `X-Labels-Token`. Sin el encabezado responde 428; si algo que
  el cliente vio se borró o se renumeró, 412 `LABELS_CHANGED` y el cliente recarga el proyecto.
  Crear entidades no invalida el token. En el cliente, cada interacción (modal, menú contextual,
  arrastre) fija el token al comenzar, no al enviar.
- **`Task.featureId` es opcional y `Task` tiene `projectId` propio** (migración
  `20260730120000_task_project_relation`, sobre la base de `20260727214422_task_feature_optional`).
  El modal de creación permite "Sin feature" y `createTask`/`getProject` ya no dependen de la
  feature para saber a qué proyecto pertenece una tarea. El unique de label pasó de
  `[featureId, label]` a `[projectId, label]`.

## Autenticación

Better Auth con GitHub OAuth. `Member` es a la vez el perfil de dominio y la tabla de usuarios de la
librería (`user.modelName`), porque todo miembro nace de un login. El acceso lo controla
`Member.isVerifiedByCoordinator`, y los permisos se derivan de `MemberRole` mediante `requireMember()`
y `requireCoordinacion()` en `src/lib/auth/guards.ts`.

Pendiente:

- **La autorización solo distingue proyectos.** Únicamente `COORDINACION` puede crear, editar o
  borrar proyectos y componer su equipo. Todo lo demás —tareas, features, actas, documentos— lo
  puede hacer cualquier miembro aprobado sobre **cualquier** proyecto, sea o no parte de él.
  `ProjectMember` solo restringe a quién se le puede asignar una tarea. Si se quiere acotar más, ese
  join table es la pieza natural.

- **La UI esconde las acciones de coordinación** (nuevo/editar/eliminar proyecto, gestionar el
  equipo) mediante `useIsCoordinacion()` de `CurrentMemberProvider`. Es solo presentación: el
  servidor sigue siendo quien rechaza con 403.

- **La aprobación de miembros se hace desde `/miembros`**, pestaña "Pendientes" (solo coordinación;
  el sidebar muestra cuántas solicitudes esperan). Aprobar fija rol y área y pone `joinedAt` en la
  fecha de aprobación. Rechazar borra la cuenta; como el registro es abierto, la persona puede volver
  a entrar y queda pendiente otra vez.

- **El registro es abierto.** Cualquiera con cuenta de GitHub puede crear una fila `Member`
  pendiente. No accede a nada, pero escribe en la base. Mitigación más barata si molesta: un
  allowlist de usuarios de GitHub en un `databaseHooks.user.create.before`, o `disableImplicitSignUp`
  con flujo de invitación.

- **No hay pre-registro.** El modelo asume que todo `Member` nace de un login. Si coordinación
  necesitara crear miembros antes de que entren, hay que volver a separar la identidad o vincular por
  usuario de GitHub (`githubLogin`), porque el correo de GitHub no tiene por qué coincidir con el que
  tenga anotado coordinación.

- **`isVerifiedByCoordinator` es un booleano**: no registra quién aprobó ni cuándo. Si se necesita
  auditoría, migrar a `verifiedAt` + `verifiedById` — el histórico previo no se recupera.

- **Sin auditoría de acciones.** `requireMember()` devuelve el `Member` que actúa, pero eso no se
  registra en ninguna parte salvo `Document.authorId`.

- **`proxy.ts` solo mira si la cookie existe**, no valida la sesión, y deja `/api` fuera del matcher.
  Ambas cosas son deliberadas y están explicadas en el archivo. No mover chequeos de seguridad ahí.
