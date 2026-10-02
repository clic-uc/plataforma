"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { AvatarStack } from "@/components/ui/Avatar";
import { TaskTypeTag } from "@/components/ui/TaskTypeTag";
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
} from "@/components/icons";
import { ContextMenu } from "@/components/ui/ContextMenu";
import type { KanbanColumn } from "@/generated/prisma/enums";
import { KANBAN_COLUMN_OPTIONS, kanbanColumnValue, priorityColor } from "@/lib/api/status";
import {
  useCreateProjectDoc,
  useDeleteFeature,
  useDeleteProject,
  useDeleteTask,
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
import { CreateActaModal } from "@/components/views/CreateActaModal";

const docIcon = {
  clock: DocClockIcon,
  file: DocFileIcon,
  code: DocCodeIcon,
  decision: DocDecisionIcon,
};

const kanbanColumns: { key: ProjectTask["column"]; label: string }[] = [
  { key: "pendiente", label: "PENDIENTE" },
  { key: "progreso", label: "EN PROGRESO" },
  { key: "revisar", label: "POR REVISAR" },
  { key: "revision", label: "EN REVISIÓN" },
  { key: "listo", label: "LISTO" },
];

const NO_FEATURE = "__none";

export function ProjectDetailView({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<"backlog" | "tareas" | "kanban">("backlog");
  const [editing, setEditing] = useState(false);
  const [creatingFeature, setCreatingFeature] = useState(false);
  const [editingFeature, setEditingFeature] = useState<ProjectFeature | null>(null);
  const [viewingFeature, setViewingFeature] = useState<ProjectFeature | null>(null);
  const [featureMenu, setFeatureMenu] = useState<{ x: number; y: number; feature: ProjectFeature } | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<ProjectTask["column"] | null>(null);
  const [editingTask, setEditingTask] = useState<ProjectTask | null>(null);
  const [viewingTask, setViewingTask] = useState<ProjectTask | null>(null);
  const [taskMenu, setTaskMenu] = useState<{ x: number; y: number; task: ProjectTask } | null>(null);
  const [creatingActa, setCreatingActa] = useState(false);
  const [featureFilter, setFeatureFilter] = useState("");
  const [columnFilter, setColumnFilter] = useState<KanbanColumn | "">("");
  const [onlyActive, setOnlyActive] = useState(false);
  const { data: project } = useProject(projectId);
  const createDoc = useCreateProjectDoc(projectId);
  const deleteFeature = useDeleteFeature(projectId);
  const deleteTask = useDeleteTask(projectId);
  const moveTask = useMoveTask(projectId);
  const updateTask = useUpdateTask(projectId);
  const deleteProject = useDeleteProject();
  if (!project) return null;

  const filteredTasks = project.tasks.filter(
    (t) =>
      (!featureFilter || (featureFilter === NO_FEATURE ? t.featureId === null : t.featureId === featureFilter)) &&
      (!columnFilter || t.columnValue === columnFilter) &&
      (!onlyActive || t.active),
  );

  function endDrag() {
    setDraggingTaskId(null);
    setDragOverColumn(null);
  }

  function handleDrop(column: ProjectTask["column"]) {
    const task = project?.tasks.find((t) => t.id === draggingTaskId);
    endDrag();
    if (!task || task.column === column) return;
    moveTask.mutate({ task, column: kanbanColumnValue[column] });
  }

  const handleDeleteProject = () => {
    if (!window.confirm(`¿Eliminar el proyecto "${project.name}"? Esta acción no se puede deshacer.`)) return;
    deleteProject.mutate(project.id, { onSuccess: () => router.push("/proyectos") });
  };

  function toggleTaskActive(task: ProjectTask) {
    updateTask.mutate({
      taskId: task.id,
      input: {
        featureId: task.featureId,
        name: task.name,
        type: task.typeValue,
        column: task.columnValue,
        active: !task.active,
        description: task.description,
      },
    });
  }

  function openTaskMenu(e: React.MouseEvent, task: ProjectTask) {
    e.preventDefault();
    setTaskMenu({ x: e.clientX, y: e.clientY, task });
  }

  return (
    <section>
      <div className="pd-header">
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <div className="pd-name">{project.name}</div>
              <Badge color={project.statusColor}>{project.status}</Badge>
            </div>
            <div style={{ fontSize: 13, color: "var(--text-2)", maxWidth: 560 }}>{project.description}</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button
              className="btn-ghost"
              style={{ fontSize: 12, color: "#c0392b", borderColor: "#c0392b" }}
              onClick={handleDeleteProject}
              disabled={deleteProject.isPending}
            >
              {deleteProject.isPending ? "Eliminando…" : "Eliminar proyecto"}
            </button>
            <button className="btn-primary" style={{ fontSize: 12 }} onClick={() => setEditing(true)}>
              Editar proyecto
            </button>
          </div>
        </div>
        <div className="pd-meta-row">
          <div className="pd-meta-item">{project.client}</div>
          <div className="pd-meta-item">
            <div className="pd-prog-wrap">
              <div className="pd-prog-bar"><div className="pd-prog-fill" style={{ width: `${project.progress}%` }} /></div>
              <span>{project.progress}% completado</span>
            </div>
          </div>
          <div className="pd-meta-item">
            <AvatarStack count={project.teamSize} accentFirst />
            &nbsp;{project.teamSize} miembros
          </div>
          <div className="pd-meta-item">Inicio: {project.startDate}</div>
        </div>
      </div>

      <div className="pd-doc-grid">
        <div className="card">
          <div className="sec-hrow" style={{ marginBottom: 10 }}>
            <div className="sec-htitle">Documentos</div>
          </div>
          {project.docs.map((doc) => {
            const Icon = docIcon[doc.icon];
            if (!doc.filled) {
              return (
                <div key={doc.key} className="doc-fixed-row empty">
                  <div className="doc-fixed-icon empty">
                    <PlusIcon />
                  </div>
                  <div className="doc-fixed-meta">
                    <div className="doc-fixed-name" style={{ color: "var(--text-3)" }}>{doc.name}</div>
                    <div className="doc-fixed-sub">Sin documento</div>
                  </div>
                  <button
                    className="btn-xs btn-xs-p"
                    style={{ fontSize: 8.5, padding: "2px 7px" }}
                    disabled={createDoc.isPending && createDoc.variables === doc.key}
                    onClick={() =>
                      createDoc.mutate(doc.key, {
                        onSuccess: () => router.push(`/proyectos/${project.id}/docs/${doc.key}`),
                      })
                    }
                  >
                    {createDoc.isPending && createDoc.variables === doc.key
                      ? "Creando…"
                      : createDoc.isError && createDoc.variables === doc.key
                        ? "Reintentar"
                        : "Crear"}
                  </button>
                </div>
              );
            }
            return (
              <Link key={doc.key} href={`/proyectos/${project.id}/docs/${doc.key}`} className="doc-fixed-row filled">
                <div className="doc-fixed-icon filled">
                  <Icon />
                </div>
                <div className="doc-fixed-meta">
                  <div className="doc-fixed-name">{doc.name}</div>
                  <div className="doc-fixed-sub">{doc.author} · {doc.date}</div>
                </div>
                <ChevronRightIcon color="var(--text-3)" />
              </Link>
            );
          })}
        </div>

        <div className="card">
          <div className="sec-hrow" style={{ marginBottom: 10 }}>
            <div className="sec-htitle">Actas <span style={{ opacity: 0.5 }}>{project.actas.length}</span></div>
            <button className="btn-xs btn-xs-g" onClick={() => setCreatingActa(true)}>+ Agregar acta</button>
          </div>
          {project.actas.length === 0 ? (
            <div className="ph" style={{ height: 72 }}>
              <div className="ph-text">Sin actas registradas</div>
            </div>
          ) : (
            project.actas.map((acta) => (
              <Link key={acta.id} href={`/proyectos/${project.id}/docs/${acta.id}`} className="acta-row">
                <div className="acta-dot" />
                <div className="acta-title">{acta.title}</div>
                <div className="acta-date">{acta.date}</div>
              </Link>
            ))
          )}
        </div>
      </div>

      <div className="card">
        <div className="proj-tabs-bar">
          <button className={`proj-tab${tab === "backlog" ? " active" : ""}`} onClick={() => setTab("backlog")}>
            <BacklogIcon />
            Backlog <span className="proj-tab-count">{project.features.length}</span>
          </button>
          <button className={`proj-tab${tab === "tareas" ? " active" : ""}`} onClick={() => setTab("tareas")}>
            <TasksTabIcon />
            Tareas <span className="proj-tab-count">{project.tasks.length}</span>
          </button>
          <button className={`proj-tab${tab === "kanban" ? " active" : ""}`} onClick={() => setTab("kanban")}>
            <KanbanTabIcon />
            Kanban
          </button>
          {tab === "backlog" && (
            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              <button className="btn-xs btn-xs-g" onClick={() => setCreatingFeature(true)}>+ Feature</button>
            </div>
          )}
          {tab === "tareas" && (
            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              <select
                className="filter-select"
                value={featureFilter}
                onChange={(e) => setFeatureFilter(e.target.value)}
                aria-label="Filtrar por feature"
              >
                <option value="">Feature: todas</option>
                <option value={NO_FEATURE}>Sin feature</option>
                {project.features.map((f) => (
                  <option key={f.id} value={f.id}>{f.id} — {f.name}</option>
                ))}
              </select>
              <select
                className="filter-select"
                value={columnFilter}
                onChange={(e) => setColumnFilter(e.target.value as KanbanColumn | "")}
                aria-label="Filtrar por estado"
              >
                <option value="">Estado: todos</option>
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
              <button className="btn-xs btn-xs-g" onClick={() => setCreatingTask(true)}>+ Tarea</button>
            </div>
          )}
          {tab === "kanban" && (
            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            </div>
          )}
        </div>

        {tab === "backlog" && (
          <div>
            {project.features.map((f) => (
              <div
                key={f.id}
                className="feat-row"
                onClick={() => setViewingFeature(f)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setFeatureMenu({ x: e.clientX, y: e.clientY, feature: f });
                }}
              >
                <div className="feat-prio" style={{ background: priorityColor[f.priority] }} title={f.priority} />
                <div className="feat-id">{f.id}</div>
                <div className="feat-name">{f.name}</div>
                <Badge color={f.statusColor} style={{ fontSize: 8.5 }}>{f.status}</Badge>
                <div className="feat-tasks">{f.taskCount} tareas</div>
              </div>
            ))}
            <div style={{ paddingTop: 10, borderTop: "1px solid var(--border)", marginTop: 2 }}>
              <div style={{ fontFamily: "var(--font-space-mono)", fontSize: 9, color: "var(--text-3)" }}>
                Prioridad:{" "}
                <span style={{ color: priorityColor.alta }}>●</span>{" "}Alta &nbsp;&nbsp;
                <span style={{ color: priorityColor.media }}>●</span>{" "}Media &nbsp;&nbsp;
                <span style={{ color: priorityColor.baja }}>●</span>{" "}Baja
              </div>
            </div>
          </div>
        )}

        {tab === "tareas" && (
          <div>
            {filteredTasks.length === 0 && (
              <div className="ph" style={{ height: 72 }}>
                <div className="ph-text">Ninguna tarea coincide con los filtros</div>
              </div>
            )}
            {filteredTasks.map((t) => (
              <div
                key={t.id}
                className={`task-row clickable${t.active ? "" : " inactive"}`}
                onClick={() => setViewingTask(t)}
                onContextMenu={(e) => openTaskMenu(e, t)}
              >
                <input
                  type="checkbox"
                  className="task-check"
                  checked={t.active}
                  title={t.active ? "Ocultar del kanban" : "Mostrar en kanban"}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => toggleTaskActive(t)}
                />
                {t.featureId && <span className="task-feat-tag">{t.featureId}</span>}
                <div className="task-id">{t.id}</div>
                <div className={`task-name${t.done ? " done" : ""}`}>{t.name}</div>
                <TaskTypeTag type={t.type} />
                <div className={`task-ava${t.hasAssignee ? " accent-ava" : ""}`} />
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
                    if (!draggingTaskId) return;
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
                      className={`kanban-card${draggingTaskId === t.id ? " dragging" : ""}`}
                      style={col.key === "listo" ? { opacity: 0.65 } : undefined}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", t.id);
                        setDraggingTaskId(t.id);
                      }}
                      onDragEnd={endDrag}
                      onClick={() => setViewingTask(t)}
                      onContextMenu={(e) => openTaskMenu(e, t)}
                    >
                      <div className="kanban-card-id">{t.featureId ? `${t.id} · ${t.featureId}` : t.id}</div>
                      <div className="kanban-card-name">{t.name}</div>
                      <div className="kanban-card-foot">
                        <TaskTypeTag type={t.type} />
                        <div className={`task-ava${t.hasAssignee ? " accent-ava" : ""}`} />
                      </div>
                    </div>
                  ))}
                  {col.key === "pendiente" && (
                    <div className="kanban-col-add" onClick={() => setCreatingTask(true)}>+ Tarea</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editing && <EditProjectModal project={project} onClose={() => setEditing(false)} />}
      {creatingFeature && <CreateFeatureModal projectId={project.id} onClose={() => setCreatingFeature(false)} />}
      {editingFeature && (
        <EditFeatureModal projectId={project.id} feature={editingFeature} onClose={() => setEditingFeature(null)} />
      )}
      {viewingFeature && (
        <FeatureDetailModal
          projectId={project.id}
          feature={project.features.find((f) => f.id === viewingFeature.id) ?? viewingFeature}
          tasks={project.tasks.filter((t) => t.featureId === viewingFeature.id)}
          onClose={() => setViewingFeature(null)}
        />
      )}
      {creatingTask && (
        <CreateTaskModal projectId={project.id} features={project.features} onClose={() => setCreatingTask(false)} />
      )}
      {editingTask && (
        <EditTaskModal
          projectId={project.id}
          task={editingTask}
          features={project.features}
          onClose={() => setEditingTask(null)}
        />
      )}
      {viewingTask && (
        <TaskDetailModal
          projectId={project.id}
          task={project.tasks.find((t) => t.id === viewingTask.id) ?? viewingTask}
          onClose={() => setViewingTask(null)}
        />
      )}
      {creatingActa && <CreateActaModal projectId={project.id} onClose={() => setCreatingActa(false)} />}
      {featureMenu && (
        <ContextMenu
          x={featureMenu.x}
          y={featureMenu.y}
          onClose={() => setFeatureMenu(null)}
          items={[
            { label: "Editar", onSelect: () => setEditingFeature(featureMenu.feature) },
            {
              label: "Eliminar",
              danger: true,
              onSelect: () => {
                if (window.confirm(`¿Eliminar ${featureMenu.feature.id} y sus ${featureMenu.feature.taskCount} tareas?`)) {
                  deleteFeature.mutate(featureMenu.feature.id);
                }
              },
            },
          ]}
        />
      )}
      {taskMenu && (
        <ContextMenu
          x={taskMenu.x}
          y={taskMenu.y}
          onClose={() => setTaskMenu(null)}
          items={[
            { label: "Editar", onSelect: () => setEditingTask(taskMenu.task) },
            {
              label: "Eliminar",
              danger: true,
              onSelect: () => {
                if (window.confirm(`¿Eliminar ${taskMenu.task.id}?`)) {
                  deleteTask.mutate(taskMenu.task.id);
                }
              },
            },
          ]}
        />
      )}
    </section>
  );
}
