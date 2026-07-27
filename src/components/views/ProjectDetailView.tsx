"use client";

import { useState } from "react";
import Link from "next/link";
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
import { useProject, type ProjectTask } from "@/lib/api/projects";

const docIcon = {
  clock: DocClockIcon,
  file: DocFileIcon,
  code: DocCodeIcon,
  decision: DocDecisionIcon,
};

const priorityColor = { alta: "#dc4e2a", media: "#d4a853", baja: "#a09080" };

const kanbanColumns: { key: ProjectTask["column"]; label: string }[] = [
  { key: "pendiente", label: "PENDIENTE" },
  { key: "progreso", label: "EN PROGRESO" },
  { key: "revisar", label: "POR REVISAR" },
  { key: "revision", label: "EN REVISIÓN" },
  { key: "listo", label: "LISTO" },
];

export function ProjectDetailView({ projectId }: { projectId: string }) {
  const [tab, setTab] = useState<"backlog" | "tareas" | "kanban">("backlog");
  const { data: project } = useProject(projectId);
  if (!project) return null;

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
          <button className="btn-primary" style={{ fontSize: 12, flexShrink: 0 }}>Editar proyecto</button>
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
                  <button className="btn-xs btn-xs-p" style={{ fontSize: 8.5, padding: "2px 7px" }}>Crear</button>
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
            <button className="btn-xs btn-xs-g">+ Agregar acta</button>
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
              <button className="btn-xs btn-xs-g">+ Feature</button>
            </div>
          )}
          {tab === "tareas" && (
            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              <div className="select-mock" style={{ height: 26 }}><span style={{ fontSize: 9.5 }}>Feature ▾</span></div>
              <div className="select-mock" style={{ height: 26 }}><span style={{ fontSize: 9.5 }}>Estado ▾</span></div>
              <button className="btn-xs btn-xs-g">+ Tarea</button>
            </div>
          )}
          {tab === "kanban" && (
            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              <button className="btn-xs btn-xs-p">+ Columna</button>
            </div>
          )}
        </div>

        {tab === "backlog" && (
          <div>
            {project.features.map((f) => (
              <div key={f.id} className="feat-row">
                <div className="feat-prio" style={{ background: priorityColor[f.priority] }} title={f.priority} />
                <div className="feat-id">{f.id}</div>
                <div className="feat-name">{f.name}</div>
                <Badge color={f.statusColor} style={{ fontSize: 8.5 }}>{f.status}</Badge>
                <div className="feat-tasks">{f.taskCount} tareas</div>
              </div>
            ))}
            <div style={{ paddingTop: 10, borderTop: "1px solid var(--border)", marginTop: 2 }}>
              <div style={{ fontFamily: "var(--font-space-mono)", fontSize: 9, color: "var(--text-3)" }}>
                ● Alta &nbsp;&nbsp; ● Media &nbsp;&nbsp; ● Baja — prioridad por color del indicador
              </div>
            </div>
          </div>
        )}

        {tab === "tareas" && (
          <div>
            {project.tasks.map((t) => (
              <div key={t.id} className="task-row">
                <div className={`task-cb${t.done ? " done" : ""}`} />
                <span className="task-feat-tag">{t.featureId}</span>
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
              const tasks = project.tasks.filter((t) => t.column === col.key);
              return (
                <div key={col.key}>
                  <div className="kanban-col-head">
                    {col.label}
                    <span className="kanban-col-count">{tasks.length}</span>
                  </div>
                  {tasks.map((t) => (
                    <div key={t.id} className="kanban-card" style={col.key === "listo" ? { opacity: 0.65 } : undefined}>
                      <div className="kanban-card-id">{t.id} · {t.featureId}</div>
                      <div className="kanban-card-name">{t.name}</div>
                      <div className="kanban-card-foot">
                        <TaskTypeTag type={t.type} />
                        <div className={`task-ava${t.hasAssignee ? " accent-ava" : ""}`} />
                      </div>
                    </div>
                  ))}
                  <div className="kanban-col-add">+ Tarea</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
