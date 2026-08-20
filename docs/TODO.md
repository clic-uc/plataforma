## Fuera de alcance mayor

- **Dashboard y Tiempo siguen 100% hardcodeados** (`prisma/seed/data/dashboard.ts` y `tiempo.ts`,
  importados directo por `DashboardView`, `DashboardCalendarCard` y `TiempoView`). No hay modelos
  en el schema para calendario, feed de actividad ni registro de horas. Para migrarlos habría que
  diseñar modelos nuevos (`CalendarEvent`, `ActivityFeedItem`, `TimeEntry` o similar) en Prisma.

## Miembros

- Sin edición: no existe UI para editar un miembro (nombre, área, skills, nivel, etc.), solo
  lectura. "Editar perfil" y "Enviar mensaje" en `MemberProfileView` son botones decorativos.
- "+ Invitar miembro" en `MembersTableView` no hace nada.
- Filtros "Área ▾" / "Estado ▾" en la tabla de miembros son mocks visuales, no filtran.
- Campos que existían en el mock original y no tienen columna en el schema: `telegram`, `rankNumber`/`ranking`
  (esto se pensaba calcular, no persistir), `areaLabel` (categoría corta tipo "PROYECTOS"/"WEB"/"LAB", distinta de
  `area`), color propio por miembro. Si se quieren recuperar, hay que agregar columnas reales.

## Proyectos

- `prCount` (contador de PRs) y `teamLabel` (pod/equipo interno a cargo, distinto de `area`) se
  descartaron al migrar — no hay integración con GitHub ni columna equivalente.
- Color propio por proyecto se descartó (se usa el acento único de la app en todos lados). Si se
  quiere recuperar variedad de color, ver nota de Miembros arriba — mismo problema, misma solución
  pendiente.

**Pendiente para dejar el tab 100% funcional:**
- Buscador de proyectos (`search-mock` en `ProyectosView`) es decorativo, no filtra.
- Formato enriquecido y metadatos editables del editor de documentos (`DocEditorView`) — detalle en
  "Documentos y Actas" abajo.
- Drag & drop de tarjetas en el Kanban — detalle en "Features y Tareas" abajo.

## Documentos y Actas

- El editor de documentos (`DocEditorView`) solo tiene **el campo de texto plano** conectado a
  guardar/persistir. Sigue pendiente:
  - Formato enriquecido: los botones B/I/H1/H2/Lista/Tarea/Tabla/Código son decorativos.
  - Metadatos editables (tipo, autor, fecha) — hoy son de solo lectura.
  - "Historial de versiones" es un placeholder.
  - "Compartir enlace" no hace nada.
- El propio schema tiene esto documentado en comentarios (`Document` y `Acta`, en
  `prisma/schema.prisma`): `content` es texto plano por ahora; si en algún momento se necesitan
  secciones estructuradas o versionamiento real, `author`/`date` deberían pasar a vivir en un
  modelo `DocumentVersion` aparte, con `Document`/`Acta` como contenedor del slot.

## Features y Tareas

- **`Task.done` se sacó del schema** (migración `20260730130000_task_done_from_column`): una tarea
  se considera "hecha" cuando `column === LISTO`, no por un toggle manual — se quitó el checkbox
  de la pestaña Tareas a propósito, para que solo quede lista después de vivir el ciclo completo
  del kanban.
- Sin drag & drop en el Kanban todavía — en evaluación (dnd-kit vs. Pragmatic drag-and-drop de
  Atlassian vs. HTML5 DnD nativo). Mientras se decide, `EditTaskModal` permite cambiar la columna
  a mano como mecanismo interino para "mover" una tarea.
- No hay asignación real de miembro a una tarea (`hasAssignee` sigue siendo solo
  `assigneeId !== null`). Nada lo bloquea ya: `getMembers()` da la lista para un selector y
  `requireMember()` identifica a quien actúa.
- Filtros "Feature ▾" / "Estado ▾" en la pestaña Tareas son decorativos — tampoco es prioridad
  por ahora.
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
  borrar proyectos. Todo lo demás —tareas, features, actas, documentos— lo puede hacer cualquier
  miembro aprobado sobre **cualquier** proyecto, sea o no parte de él: `ProjectMember` existe pero no
  restringe nada. Si se quiere acotar, ese join table es la pieza natural.

- **La UI no esconde las acciones de coordinación.** Un `EQUIPO` ve el botón "Nuevo proyecto" y
  recibe un 403 al usarlo. El servidor rechaza correctamente, que es lo que importa, pero la
  experiencia es pobre. Se arregla condicionando por `actor.role`.

- **La aprobación de miembros es manual, por SQL.** Decisión explícita: con ~8 miembros no compensa
  construir la UI todavía.

  ```sql
  -- cola de pendientes
  SELECT name, email, "createdAt" FROM "Member" WHERE "isVerifiedByCoordinator" = false;
  -- aprobar
  UPDATE "Member" SET "isVerifiedByCoordinator" = true WHERE email = 'persona@ejemplo.com';
  ```

  Para construir la UI hay que estrenar la capa de escritura de miembros: `members.server.ts` es hoy
  solo lectura (función server + `PATCH /api/members/[id]/verify` + hook de mutación + gate con
  `requireCoordinacion()`).

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
