## Fuera de alcance mayor

- **Dashboard y Tiempo siguen 100% hardcodeados** (`prisma/seed/data/dashboard.ts` y `tiempo.ts`,
  importados directo por `DashboardView`, `DashboardCalendarCard` y `TiempoView`). No hay modelos
  en el schema para calendario, feed de actividad ni registro de horas. Para migrarlos habría que
  diseñar modelos nuevos (`CalendarEvent`, `ActivityFeedItem`, `TimeEntry` o similar) en Prisma.

- **No hay autenticación ni sesión real.** `UserMenu` (`src/components/shell/UserMenu.tsx`) tiene
  "Arturo Herreros" / iniciales "JP" / "Coordinación" hardcodeados en el componente — no viene de
  un usuario loggeado. Esto también significa que no hay forma de saber "quién" crea/edita algo aún
  (por eso `Document.authorId` queda `null` al crear un doc desde la UI, por ejemplo).
  Decisión (2026-07-30): por ahora el equipo completo entra a la plataforma tal como está, sin
  login — no es prioridad mientras se deja funcional el manejo de proyectos. Ligado a esto, la
  asignación real de miembro a tarea también queda fuera por ahora (ver "Features y Tareas").

## Miembros

- Sin edición: no existe UI para editar un miembro (nombre, área, skills, nivel, etc.), solo
  lectura. "Editar perfil" y "Enviar mensaje" en `MemberProfileView` son botones decorativos.
- "+ Invitar miembro" en `MembersTableView` no hace nada.
- Filtros "Área ▾" / "Estado ▾" en la tabla de miembros son mocks visuales, no filtran.
- Campos que existían en el mock original y no tienen columna en el schema: `telegram`, `rankNumber`/`ranking`
  (esto se pensaba calcular, no persistir), `areaLabel` (categoría corta tipo "PROYECTOS"/"WEB"/"LAB", distinta de
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
  guardar/persistir. Sigue pendiente:
  - Formato enriquecido: los botones B/I/H1/H2/Lista/Tarea/Tabla/Código son decorativos.
  - Metadatos editables (tipo, autor, fecha) — hoy son de solo lectura.
  - "Historial de versiones" es un placeholder.
  - "Compartir enlace" no hace nada.
- Crear acta desde la UI: implementado (`CreateActaModal`, "+ Agregar acta" en `ProjectDetailView`,
  POST `/api/projects/[id]/actas`). Se crea solo con título/fecha; el contenido se llena después
  desde el editor, igual que antes.
- El propio schema tiene esto documentado en comentarios (`Document` y `Acta`, en
  `prisma/schema.prisma`): `content` es texto plano por ahora; si en algún momento se necesitan
  secciones estructuradas o versionamiento real, `author`/`date` deberían pasar a vivir en un
  modelo `DocumentVersion` aparte, con `Document`/`Acta` como contenedor del slot.

## Features y Tareas

- Edición y borrado de tareas: implementado (`EditTaskModal` + PATCH/DELETE
  `/api/projects/[id]/tasks/[taskId]`). Reusa el mismo patrón de menú contextual (click derecho)
  que ya existía para features, disponible tanto en la fila de la pestaña Tareas como en la card
  de Kanban.
- **`Task.done` se sacó del schema** (migración `20260730130000_task_done_from_column`): una tarea
  se considera "hecha" cuando `column === LISTO`, no por un toggle manual — se quitó el checkbox
  de la pestaña Tareas a propósito, para que solo quede lista después de vivir el ciclo completo
  del kanban.
- Sin drag & drop en el Kanban todavía — en evaluación (dnd-kit vs. Pragmatic drag-and-drop de
  Atlassian vs. HTML5 DnD nativo). Mientras se decide, `EditTaskModal` permite cambiar la columna
  a mano como mecanismo interino para "mover" una tarea.
- No hay asignación real de miembro a una tarea (`hasAssignee` sigue siendo solo
  `assigneeId !== null`) — decisión explícita de dejarlo fuera por ahora junto con autenticación
  (ver "Fuera de alcance mayor"), no un olvido.
- Filtros "Feature ▾" / "Estado ▾" en la pestaña Tareas son decorativos — tampoco es prioridad
  por ahora.
- **`Task.featureId` es opcional y `Task` tiene `projectId` propio** (migración
  `20260730120000_task_project_relation`, sobre la base de `20260727214422_task_feature_optional`).
  El modal de creación permite "Sin feature" y `createTask`/`getProject` ya no dependen de la
  feature para saber a qué proyecto pertenece una tarea. El unique de label pasó de
  `[featureId, label]` a `[projectId, label]`.
