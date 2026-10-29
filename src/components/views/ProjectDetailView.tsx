"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { AssigneeAvatar, AvatarStack } from "@/components/ui/Avatar";
import { TaskTypeTag } from "@/components/ui/TaskTypeTag";
import { DifficultyMeter } from "@/components/ui/DifficultyMeter";
import {
  DocClockIcon,
  DocFileIcon,
  DocCodeIcon,
  DocDecisionIcon,
  ChevronRightIcon,
  PlusIcon,
  BacklogIcon,
  TasksTabIcon,
  KanbanTabIcon,
  IssuesTabIcon,
} from "@/components/icons";
import type { KanbanColumn } from "@/generated/prisma/enums";
import { KANBAN_COLUMN_OPTIONS, kanbanColumnValue, priorityColor } from "@/lib/api/status";
import {
  taskMoveErrorMessage,
  taskToUpdateInput,
  useCreateProjectDoc,
  useMoveTask,
  useProject,
  useUpdateTask,
  type ProjectFeature,
  type ProjectTask,
} from "@/lib/api/projects";
import { EditProjectModal } from "@/components/views/EditProjectModal";
import { CreateFeatureModal } from "@/components/views/CreateFeatureModal";
import { EditFeatureModal } from "@/components/views/EditFeatureModal";
import { FeatureDetailModal } from "@/components/views/FeatureDetailModal";
import { CreateTaskModal } from "@/components/views/CreateTaskModal";
import { EditTaskModal } from "@/components/views/EditTaskModal";
import { TaskDetailModal } from "@/components/views/TaskDetailModal";
import { MoveTaskDialog } from "@/components/views/MoveTaskDialog";
import { CreateActaModal } from "@/components/views/CreateActaModal";
import { ProjectTeamModal } from "@/components/views/ProjectTeamModal";
import { CreateIssueModal } from "@/components/views/CreateIssueModal";
import { ProjectIssuesList } from "@/components/views/ProjectIssuesList";
import { useProjectIssues, type IssueFilter } from "@/lib/api/issues";
import { useCurrentMember, useIsCoordinacion } from "@/components/providers/CurrentMemberProvider";
import { moveNeedsDialog, planMove } from "@/lib/task-move";

const docIcon = {
  clock: DocClockIcon,
  file: DocFileIcon,
  code: DocCodeIcon,
  decision: DocDecisionIcon,
};

const kanbanColumns: { key: ProjectTask["column"]; label: string }[] = [
  { key: "pendiente", label: "Pendiente" },
  { key: "progreso", label: "En progreso" },
  { key: "revisar", label: "Por revisar" },
  { key: "revision", label: "En revisión" },
  { key: "listo", label: "Listo" },
];

const NO_FEATURE = "__none";

const TABS = ["backlog", "tareas", "kanban", "issues"] as const;
type Tab = (typeof TABS)[number];

function parseTab(value: string | null): Tab {
  return TABS.find((t) => t === value) ?? "backlog";
}

/**
 * La pestaña vive en la URL (?tab=issues) para que los links (p. ej. desde el Dashboard) abran
 * la que corresponde. Se cambia con history.replaceState, que Next sincroniza con
 * useSearchParams sin volver a pedir la página al servidor.
 */
function selectTab(tab: Tab) {
  window.history.replaceState(null, "", tab === "backlog" ? window.location.pathname : `?tab=${tab}`);
}

export function ProjectDetailView({ projectId }: { projectId: string }) {
  const router = useRouter();
  const tab = parseTab(useSearchParams().get("tab"));
  const setTab = selectTab;
  const [editing, setEditing] = useState(false);
  const [creatingFeature, setCreatingFeature] = useState(false);
  // Cada interacción fija el labelsToken cuando empieza (ver useLabelledMutationSupport en
  // lib/api/projects.ts): abrir el detalle lo fija, y viaja tal cual a la edición y al borrado.
  const [viewingFeature, setViewingFeature] = useState<{ feature: ProjectFeature; labelsToken: string } | null>(null);
  const [editingFeature, setEditingFeature] = useState<{ feature: ProjectFeature; labelsToken: string } | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);
  const [dragging, setDragging] = useState<{ taskId: string; labelsToken: string } | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<ProjectTask["column"] | null>(null);
  // Movimiento que necesita preguntar algo (asignado, horas): la tarea y el token del arrastre.
  const [moving, setMoving] = useState<{ task: ProjectTask; to: KanbanColumn; labelsToken: string } | null>(null);
  const [viewingTask, setViewingTask] = useState<{ task: ProjectTask; labelsToken: string } | null>(null);
  const [editingTask, setEditingTask] = useState<{ task: ProjectTask; labelsToken: string } | null>(null);
  const [creatingActa, setCreatingActa] = useState(false);
  const [managingTeam, setManagingTeam] = useState(false);
  const [creatingIssue, setCreatingIssue] = useState(false);
  const [issueFilter, setIssueFilter] = useState<IssueFilter>("ABIERTO");
  const isCoordinacion = useIsCoordinacion();
  const me = useCurrentMember();
  const [featureFilter, setFeatureFilter] = useState("");
  const [columnFilter, setColumnFilter] = useState<KanbanColumn | "">("");
  const [onlyActive, setOnlyActive] = useState(false);
  const { data: project } = useProject(projectId);
  const { data: issues = [] } = useProjectIssues(projectId);
  const createDoc = useCreateProjectDoc(projectId);
  const moveTask = useMoveTask(projectId);
  const updateTask = useUpdateTask(projectId);
  if (!project) return null;

  // Acciones sin modal propio (arrastrar, activar/desactivar): su error se muestra en un aviso.
  const inlineMutations = [moveTask, updateTask];
  const inlineError = inlineMutations.find((m) => m.isError)?.error ?? null;

  const openIssues = issues.filter((issue) => issue.status === "ABIERTO").length;

  const teamSize = project.team.length;
  const teamLabel =
    teamSize === 0
      ? isCoordinacion
        ? "Sin equipo · armar equipo"
        : "Sin equipo"
      : `${teamSize} ${teamSize === 1 ? "miembro" : "miembros"}`;

  const filteredTasks = project.tasks.filter(
    (t) =>
      (!featureFilter || (featureFilter === NO_FEATURE ? t.featureId === null : t.featureId === featureFilter)) &&
      (!columnFilter || t.columnValue === columnFilter) &&
      (!onlyActive || t.active),
  );

  function endDrag() {
    setDragging(null);
    setDragOverColumn(null);
  }

  function handleDrop(column: ProjectTask["column"]) {
    const drag = dragging;
    const task = project?.tasks.find((t) => t.id === drag?.taskId);
    endDrag();
    if (!drag || !task || task.column === column) return;
    const to = kanbanColumnValue[column];
    const plan = planMove({ from: task.columnValue, to, assigneeId: task.assignee?.id ?? null, moverId: me.id });
    if (moveNeedsDialog(plan)) setMoving({ task, to, labelsToken: drag.labelsToken });
    else moveTask.mutate({ task, column: to, labelsToken: drag.labelsToken });
  }

  function toggleTaskActive(task: ProjectTask, labelsToken: string) {
    updateTask.mutate({ taskId: task.id, input: { ...taskToUpdateInput(task), active: !task.active }, labelsToken });
  }

  // El detalle muestra la versión viva de la entidad (p. ej. tras editar su descripción), y es
  // esa la que pasa a la edición, para no reescribir campos con un valor viejo.
  const liveFeature = (feature: ProjectFeature) => project.features.find((f) => f.id === feature.id) ?? feature;
  const liveTask = (task: ProjectTask) => project.tasks.find((t) => t.id === task.id) ?? task;

  // Un documento fijo vacío se crea al pulsarlo; su fila entera es el botón.
  function createDocLabel(key: string) {
    if (createDoc.isPending && createDoc.variables === key) return "Creando…";
    if (createDoc.isError && createDoc.variables === key) return "No se pudo crear · reintentar";
    return "Crear documento";
  }

  return (
    <section>
      <header className="pd-header">
        <div style={{ minWidth: 0 }}>
          <div className="pd-title-row">
            <h2 className="pd-name">{project.name}</h2>
            <Badge color={project.statusColor}>{project.status}</Badge>
          </div>
          {project.description && <p className="pd-desc">{project.description}</p>}
          <div className="pd-meta-row">
            {project.client && <div className="pd-meta-item">{project.client}</div>}
            <div className="pd-meta-item">
              <div className="pd-prog-wrap">
                <div className="pd-prog-bar"><div className="pd-prog-fill" style={{ width: `${project.progress}%` }} /></div>
                <span>{project.progress}% completado</span>
              </div>
            </div>
            <button
              type="button"
              className="pd-meta-item pd-team-btn"
              onClick={() => setManagingTeam(true)}
              title={isCoordinacion ? "Gestionar equipo" : "Ver equipo"}
            >
              {teamSize > 0 && <AvatarStack members={project.team} accentFirst />}
              {teamLabel}
            </button>
            <div className="pd-meta-item">Inicio {project.startDate}</div>
          </div>
        </div>
        {isCoordinacion && (
          <div className="pd-actions">
            <button type="button" className="btn-ghost" onClick={() => setEditing(true)}>
              Editar proyecto
            </button>
          </div>
        )}
      </header>

      {inlineError && (
        <div className="inline-error" role="alert">
          <span>{taskMoveErrorMessage(inlineError, "No se pudo completar la acción. Intenta de nuevo.")}</span>
          <button type="button" aria-label="Cerrar aviso" onClick={() => inlineMutations.forEach((m) => m.reset())}>×</button>
        </div>
      )}

      <div className="pd-layout">
      <div className="card pd-work">
        <div className="utabs" role="tablist">
          <button role="tab" aria-selected={tab === "backlog"} className={`utab${tab === "backlog" ? " active" : ""}`} onClick={() => setTab("backlog")}>
            <BacklogIcon size={13} />
            Backlog <span className="utab-count">{project.features.length}</span>
          </button>
          <button role="tab" aria-selected={tab === "tareas"} className={`utab${tab === "tareas" ? " active" : ""}`} onClick={() => setTab("tareas")}>
            <TasksTabIcon size={13} />
            Tareas <span className="utab-count">{project.tasks.length}</span>
          </button>
          <button role="tab" aria-selected={tab === "kanban"} className={`utab${tab === "kanban" ? " active" : ""}`} onClick={() => setTab("kanban")}>
            <KanbanTabIcon size={13} />
            Kanban
          </button>
          <button role="tab" aria-selected={tab === "issues"} className={`utab${tab === "issues" ? " active" : ""}`} onClick={() => setTab("issues")}>
            <IssuesTabIcon size={13} />
            Issues <span className="utab-count" title="Abiertos">{openIssues}</span>
          </button>
          {tab === "backlog" && (
            <div className="pd-work-actions">
              <button className="btn-xs btn-xs-p" onClick={() => setCreatingFeature(true)}>+ Nueva feature</button>
            </div>
          )}
          {(tab === "tareas" || tab === "kanban") && (
            <div className="pd-work-actions">
              <button className="btn-xs btn-xs-p" onClick={() => setCreatingTask(true)}>+ Nueva tarea</button>
            </div>
          )}
          {tab === "issues" && (
            <div className="pd-work-actions">
              <select
                className="filter-select sm"
                value={issueFilter}
                onChange={(e) => setIssueFilter(e.target.value as IssueFilter)}
                aria-label="Filtrar por estado"
              >
                <option value="ABIERTO">Abiertos</option>
                <option value="CERRADO">Cerrados</option>
                <option value="TODOS">Todos</option>
              </select>
              <button className="btn-xs btn-xs-p" onClick={() => setCreatingIssue(true)}>+ Nuevo issue</button>
            </div>
          )}
        </div>

        {tab === "tareas" && (
          <div className="filter-row" style={{ marginBottom: 6 }}>
            <select
              className="filter-select sm"
              value={featureFilter}
              onChange={(e) => setFeatureFilter(e.target.value)}
              aria-label="Filtrar por feature"
            >
              <option value="">Todas las features</option>
              <option value={NO_FEATURE}>Sin feature</option>
              {project.features.map((f) => (
                <option key={f.id} value={f.id}>{f.id} — {f.name}</option>
              ))}
            </select>
            <select
              className="filter-select sm"
              value={columnFilter}
              onChange={(e) => setColumnFilter(e.target.value as KanbanColumn | "")}
              aria-label="Filtrar por estado"
            >
              <option value="">Todos los estados</option>
              {KANBAN_COLUMN_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <label className="filter-check">
              <input
                type="checkbox"
                className="task-check"
                checked={onlyActive}
                onChange={(e) => setOnlyActive(e.target.checked)}
              />
              Solo activas
            </label>
          </div>
        )}

        {tab === "backlog" && (
          <div>
            {project.features.length === 0 && (
              <div className="ph">
                <div className="ph-text">Sin features todavía. Agrega la primera con «Nueva feature» para ordenar el backlog.</div>
              </div>
            )}
            {project.features.map((f) => (
              <div
                key={f.id}
                className="feat-row"
                onClick={() => setViewingFeature({ feature: f, labelsToken: project.labelsToken })}
              >
                <div className="feat-prio" style={{ background: priorityColor[f.priority] }} title={`Prioridad ${f.priority}`} />
                <div className="feat-id">{f.id}</div>
                <div className="feat-name">{f.name}</div>
                <Badge color={f.statusColor}>{f.status}</Badge>
                <div className="feat-tasks">{f.taskCount} {f.taskCount === 1 ? "tarea" : "tareas"}</div>
              </div>
            ))}
            {project.features.length > 0 && (
              <div className="prio-legend">
                Prioridad
                <span><i style={{ background: priorityColor.alta }} />Alta</span>
                <span><i style={{ background: priorityColor.media }} />Media</span>
                <span><i style={{ background: priorityColor.baja }} />Baja</span>
              </div>
            )}
          </div>
        )}

        {tab === "tareas" && (
          <div>
            {filteredTasks.length === 0 && (
              <div className="ph">
                <div className="ph-text">
                  {project.tasks.length === 0
                    ? "Sin tareas todavía. Crea la primera con «Nueva tarea»."
                    : "Ninguna tarea coincide con los filtros."}
                </div>
              </div>
            )}
            {filteredTasks.map((t) => (
              <div
                key={t.id}
                className={`task-row clickable${t.active ? "" : " inactive"}`}
                onClick={() => setViewingTask({ task: t, labelsToken: project.labelsToken })}
              >
                <input
                  type="checkbox"
                  className="task-check"
                  checked={t.active}
                  title={t.active ? "Ocultar del kanban" : "Mostrar en kanban"}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => toggleTaskActive(t, project.labelsToken)}
                />
                {t.featureId && <span className="task-feat-tag">{t.featureId}</span>}
                <div className="task-id">{t.id}</div>
                <div className={`task-name${t.done ? " done" : ""}`}>{t.name}</div>
                <TaskTypeTag type={t.type} />
                <span className="flex w-4 shrink-0 justify-center">
                  <DifficultyMeter difficulty={t.difficulty} />
                </span>
                <AssigneeAvatar assignee={t.assignee} />
              </div>
            ))}
          </div>
        )}

        {tab === "kanban" && (
          <div className="kanban-board">
            {kanbanColumns.map((col) => {
              const tasks = project.tasks.filter((t) => t.column === col.key && t.active);
              return (
                <div
                  key={col.key}
                  className={`kanban-col${dragOverColumn === col.key ? " drag-over" : ""}`}
                  onDragOver={(e) => {
                    if (!dragging) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setDragOverColumn(col.key);
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOverColumn(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleDrop(col.key);
                  }}
                >
                  <div className="kanban-col-head">
                    {col.label}
                    <span className="kanban-col-count">{tasks.length}</span>
                  </div>
                  {tasks.map((t) => (
                    <div
                      key={t.id}
                      className={`kanban-card${dragging?.taskId === t.id ? " dragging" : ""}${col.key === "listo" ? " is-done" : ""}`}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", t.id);
                        setDragging({ taskId: t.id, labelsToken: project.labelsToken });
                      }}
                      onDragEnd={endDrag}
                      onClick={() => setViewingTask({ task: t, labelsToken: project.labelsToken })}
                    >
                      <div className="kanban-card-id">{t.featureId ? `${t.id} · ${t.featureId}` : t.id}</div>
                      <div className="kanban-card-name">{t.name}</div>
                      <div className="kanban-card-foot">
                        <span className="flex items-center gap-2">
                          <TaskTypeTag type={t.type} />
                          <DifficultyMeter difficulty={t.difficulty} />
                        </span>
                        <AssigneeAvatar assignee={t.assignee} />
                      </div>
                    </div>
                  ))}
                  {col.key === "pendiente" && (
                    <button type="button" className="kanban-col-add" onClick={() => setCreatingTask(true)}>+ Nueva tarea</button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {tab === "issues" && <ProjectIssuesList projectId={project.id} issues={issues} filter={issueFilter} />}
      </div>

      <aside className="card pd-side">
        <div className="pd-side-sec">
          <div className="card-label">Documentos</div>
          {project.docs.map((doc) => {
            const Icon = docIcon[doc.icon];
            if (!doc.filled) {
              return (
                <button
                  key={doc.key}
                  type="button"
                  className="doc-fixed-row empty"
                  disabled={createDoc.isPending && createDoc.variables === doc.key}
                  onClick={() =>
                    createDoc.mutate(doc.key, {
                      onSuccess: () => router.push(`/proyectos/${project.id}/docs/${doc.key}`),
                    })
                  }
                >
                  <div className="doc-fixed-icon empty">
                    <PlusIcon size={13} />
                  </div>
                  <div className="doc-fixed-meta">
                    <div className="doc-fixed-name">{doc.name}</div>
                    <div className="doc-fixed-sub">{createDocLabel(doc.key)}</div>
                  </div>
                </button>
              );
            }
            return (
              <Link key={doc.key} href={`/proyectos/${project.id}/docs/${doc.key}`} className="doc-fixed-row filled">
                <div className="doc-fixed-icon filled">
                  <Icon />
                </div>
                <div className="doc-fixed-meta">
                  <div className="doc-fixed-name">{doc.name}</div>
                  <div className="doc-fixed-sub">{[doc.author, doc.date].filter(Boolean).join(" · ")}</div>
                </div>
                <ChevronRightIcon color="var(--text-3)" />
              </Link>
            );
          })}
        </div>

        <div className="pd-side-sec">
          <div className="card-label">
            <span>Actas {project.actas.length > 0 && <span className="label-count">{project.actas.length}</span>}</span>
            <button type="button" className="link-add" onClick={() => setCreatingActa(true)}>+ Agregar acta</button>
          </div>
          {project.actas.length === 0 ? (
            <div className="empty-line">Sin actas. Registra la próxima reunión con «Agregar acta».</div>
          ) : (
            project.actas.map((acta) => (
              <Link key={acta.id} href={`/proyectos/${project.id}/docs/${acta.id}`} className="acta-row">
                <div className="acta-title">{acta.title}</div>
                <div className="acta-date">{acta.date}</div>
              </Link>
            ))
          )}
        </div>
      </aside>
      </div>

      {editing && <EditProjectModal project={project} onClose={() => setEditing(false)} />}
      {creatingFeature && <CreateFeatureModal projectId={project.id} onClose={() => setCreatingFeature(false)} />}
      {viewingFeature && (
        <FeatureDetailModal
          projectId={project.id}
          feature={liveFeature(viewingFeature.feature)}
          tasks={project.tasks.filter((t) => t.featureId === viewingFeature.feature.id)}
          labelsToken={viewingFeature.labelsToken}
          onEdit={() => {
            setEditingFeature({ feature: liveFeature(viewingFeature.feature), labelsToken: viewingFeature.labelsToken });
            setViewingFeature(null);
          }}
          onClose={() => setViewingFeature(null)}
        />
      )}
      {editingFeature && (
        <EditFeatureModal
          projectId={project.id}
          feature={editingFeature.feature}
          labelsToken={editingFeature.labelsToken}
          onClose={() => setEditingFeature(null)}
        />
      )}
      {creatingTask && (
        <CreateTaskModal
          projectId={project.id}
          features={project.features}
          team={project.team}
          labelsToken={project.labelsToken}
          onClose={() => setCreatingTask(false)}
        />
      )}
      {viewingTask && (
        <TaskDetailModal
          projectId={project.id}
          task={liveTask(viewingTask.task)}
          labelsToken={viewingTask.labelsToken}
          onEdit={() => {
            setEditingTask({ task: liveTask(viewingTask.task), labelsToken: viewingTask.labelsToken });
            setViewingTask(null);
          }}
          onClose={() => setViewingTask(null)}
        />
      )}
      {editingTask && (
        <EditTaskModal
          projectId={project.id}
          task={editingTask.task}
          features={project.features}
          team={project.team}
          labelsToken={editingTask.labelsToken}
          onClose={() => setEditingTask(null)}
        />
      )}
      {moving && (
        <MoveTaskDialog
          projectId={project.id}
          task={moving.task}
          to={moving.to}
          team={project.team}
          labelsToken={moving.labelsToken}
          onClose={() => setMoving(null)}
        />
      )}
      {creatingActa && <CreateActaModal projectId={project.id} onClose={() => setCreatingActa(false)} />}
      {managingTeam && <ProjectTeamModal project={project} onClose={() => setManagingTeam(false)} />}
      {creatingIssue && <CreateIssueModal projectId={project.id} onClose={() => setCreatingIssue(false)} />}
    </section>
  );
}
