# To-Do

Todo lo que quedó pendiente en la migración de datos hardcodeados → Prisma y en las
funcionalidades construidas encima (edición de proyecto, documentos, features, tareas).
No es una lista de bugs — es lo que se dejó fuera de alcance a propósito, o lo que quedó
como UI decorativa sin conectar.

## Fuera de alcance mayor

- **Dashboard y Tiempo siguen 100% hardcodeados** (`prisma/seed/data/dashboard.ts` y `tiempo.ts`,
  importados directo por `DashboardView`, `DashboardCalendarCard` y `TiempoView`). No hay modelos
  en el schema para calendario, feed de actividad ni registro de horas. Para migrarlos habría que
  diseñar modelos nuevos (`CalendarEvent`, `ActivityFeedItem`, `TimeEntry` o similar) — decisión
  de modelado que no se tomó.
- **No hay autenticación ni sesión real.** `UserMenu` (`src/components/shell/UserMenu.tsx`) tiene
  "Arturo Herreros" / iniciales "JP" / "Coordinación" hardcodeados en el componente — no viene de
  un usuario logueado. Esto también significa que no hay forma de saber "quién" crea/edita algo
  (por eso `Document.authorId` queda `null` al crear un doc desde la UI, por ejemplo).

## Miembros

- Sin edición: no existe UI para editar un miembro (nombre, área, skills, nivel, etc.), solo
  lectura. "Editar perfil" y "Enviar mensaje" en `MemberProfileView` son botones decorativos.
- "+ Invitar miembro" en `MembersTableView` no hace nada.
- Filtros "Área ▾" / "Estado ▾" en la tabla de miembros son mocks visuales, no filtran.
- Campos que existían en el mock original y no tienen columna en el schema (se descartaron al
  migrar, ver conversación sobre el mapeo de miembros): `telegram`, `rankNumber`/`ranking`
  (puntaje o posición), `areaLabel` (categoría corta tipo "PROYECTOS"/"WEB"/"LAB", distinta de
  `area`), color propio por miembro. Si se quieren recuperar, hay que agregar columnas reales.

## Proyectos

- "+ Nuevo proyecto" en `ProyectosView` no hace nada — solo se puede editar un proyecto existente,
  no crear uno desde cero.
- Buscador de proyectos (`search-mock`) es decorativo.
- `prCount` (contador de PRs) y `teamLabel` (pod/equipo interno a cargo, distinto de `area`) se
  descartaron al migrar — no hay integración con GitHub ni columna equivalente.
- Color propio por proyecto se descartó (se usa el acento único de la app en todos lados). Si se
  quiere recuperar variedad de color, ver nota de Miembros arriba — mismo problema, misma solución
  pendiente.

## Documentos y Actas

- El editor de documentos (`DocEditorView`) solo tiene **el campo de texto plano** conectado a
  guardar/persistir, a propósito (fue lo pedido). Sigue pendiente:
  - Formato enriquecido: los botones B/I/H1/H2/Lista/Tarea/Tabla/Código son decorativos.
  - Metadatos editables (tipo, autor, fecha) — hoy son de solo lectura.
  - "Historial de versiones" es un placeholder.
  - "Compartir enlace" no hace nada.
  - El título del documento no es editable (nunca lo fue, ni en el mock original).
- "+ Agregar acta" en `ProjectDetailView` no hace nada — las actas solo se pueden leer/editar su
  contenido si ya existen desde el seed, no se pueden crear desde la UI.
- El propio schema tiene esto documentado en comentarios (`Document` y `Acta`, en
  `prisma/schema.prisma`): `content` es texto plano por ahora; si en algún momento se necesitan
  secciones estructuradas o versionamiento real, `author`/`date` deberían pasar a vivir en un
  modelo `DocumentVersion` aparte, con `Document`/`Acta` como contenedor del slot.

## Features y Tareas

- No hay edición ni borrado de tareas — el menú contextual de click derecho (editar/eliminar) solo
  se construyó para features, no para tasks.
- No hay asignación real de miembro a una tarea. `hasAssignee` en la UI es solo
  `assigneeId !== null` (un punto de color); no existe ningún selector de miembro para asignar o
  reasignar — haría falta un componente "member picker" que todavía no existe en la app.
- Sin drag & drop en el Kanban: una tarea se crea directo en una columna, pero no se puede mover
  arrastrándola entre columnas después.
- Filtros "Feature ▾" / "Estado ▾" en la pestaña Tareas son decorativos.
- **`Task.featureId` es opcional y `Task` ahora tiene `projectId` propio** (migración
  `20260730120000_task_project_relation`, sobre la base de `20260727214422_task_feature_optional`).
  El modal de creación permite "Sin feature" y `createTask`/`getProject` ya no dependen de la
  feature para saber a qué proyecto pertenece una tarea. El unique de label pasó de
  `[featureId, label]` a `[projectId, label]`.
  - Pendiente: la pestaña Backlog sigue organizada 100% por feature, así que una tarea sin feature
    no aparece ahí (solo en Tareas/Kanban) — no hay todavía una sección tipo "Sueltas" en Backlog.

## Notas de infraestructura

- El historial de migraciones de Prisma tenía un desajuste de nombres entre la carpeta local
  (`20260618011059_member_role`) y lo registrado en la tabla `_prisma_migrations` de Neon
  (`20260618011059_init`) — corregido a mano vía `UPDATE` directo sobre esa tabla (no tocó datos).
  Vale la pena tenerlo presente si vuelve a aparecer un "drift" raro al correr `migrate dev`: puede
  no ser un problema real de datos, sino de bookkeeping.
