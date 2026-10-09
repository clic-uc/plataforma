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
- El buscador de la tabla de miembros sigue siendo `search-mock`. El de proyectos ya es real
  (`.search-box` en `ProyectosView`) y sirve de modelo.
- El contador "Miembros" del sidebar está fijo en 18; el de Proyectos ya cuenta los activos.
- `getMembers()` / `getMember()` excluyen las cuentas con `isVerifiedByCoordinator = false`: una
  cuenta pendiente no es miembro todavía y no debe aparecer en la tabla ni en los selectores.
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
  POST de tarea con feature) lo exige en `If-Match`. Sin el encabezado responde 428; si algo que
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
