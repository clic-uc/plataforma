"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { errorMessage } from "@/lib/api/http";
import { KANBAN_COLUMN_OPTIONS } from "@/lib/api/status";
import { useIssueLink, type IssueLinkVariables, type ProjectDetail } from "@/lib/api/projects";

const columnLabel = Object.fromEntries(KANBAN_COLUMN_OPTIONS.map((opt) => [opt.value, opt.label]));

/**
 * Features y tareas vinculadas a un issue. Se derivan del proyecto, no del issue: así los
 * labels que se muestran y el labelsToken que se envía salen del mismo snapshot.
 */
export function IssueLinksPanel({ project, number }: { project: ProjectDetail; number: number }) {
  const link = useIssueLink(project.id);
  // El select se vuelve a "Vincular existente…" tras elegir; la opción solo dispara la acción.
  const [choice, setChoice] = useState("");

  const features = project.features.filter((f) => f.issues.includes(number));
  const tasks = project.tasks.filter((t) => t.issues.includes(number));
  const unlinkedFeatures = project.features.filter((f) => !f.issues.includes(number));
  const unlinkedTasks = project.tasks.filter((t) => !t.issues.includes(number));

  function mutate(kind: IssueLinkVariables["kind"], label: string, linked: boolean) {
    link.mutate({ kind, label, issueNumber: number, linked, labelsToken: project.labelsToken });
  }

  function handleChoose(value: string) {
    setChoice("");
    const [kind, label] = value.split(":") as [IssueLinkVariables["kind"], string];
    if (label) mutate(kind, label, true);
  }

  const pendingLabel = link.isPending ? link.variables?.label : undefined;

  return (
    <div className="doc-sc">
      <div className="ds-lbl">Vinculadas</div>

      {features.length === 0 && tasks.length === 0 ? (
        <div className="doc-v-empty">Sin features ni tareas vinculadas.</div>
      ) : (
        <div className="issue-links">
          {features.map((f) => (
            <div key={f.id} className="issue-link-row">
              <span className="issue-link-label">{f.id}</span>
              <span className="issue-link-name" title={f.name}>{f.name}</span>
              <Badge color={f.statusColor} style={{ fontSize: 8 }}>{f.status}</Badge>
              <button
                type="button"
                className="issue-link-x"
                title="Desvincular"
                aria-label={`Desvincular ${f.id}`}
                disabled={pendingLabel === f.id}
                onClick={() => mutate("features", f.id, false)}
              >
                ×
              </button>
            </div>
          ))}
          {tasks.map((t) => (
            <div key={t.id} className="issue-link-row">
              <span className="issue-link-label">{t.id}</span>
              <span className={`issue-link-name${t.done ? " done" : ""}`} title={t.name}>{t.name}</span>
              <span className="issue-link-col">{columnLabel[t.columnValue]}</span>
              <button
                type="button"
                className="issue-link-x"
                title="Desvincular"
                aria-label={`Desvincular ${t.id}`}
                disabled={pendingLabel === t.id}
                onClick={() => mutate("tasks", t.id, false)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {(unlinkedFeatures.length > 0 || unlinkedTasks.length > 0) && (
        <select
          className="field-select issue-link-select"
          value={choice}
          disabled={link.isPending}
          onChange={(e) => handleChoose(e.target.value)}
          aria-label="Vincular feature o tarea existente"
        >
          <option value="">Vincular existente…</option>
          {unlinkedFeatures.length > 0 && (
            <optgroup label="Features">
              {unlinkedFeatures.map((f) => (
                <option key={f.id} value={`features:${f.id}`}>{f.id} — {f.name}</option>
              ))}
            </optgroup>
          )}
          {unlinkedTasks.length > 0 && (
            <optgroup label="Tareas">
              {unlinkedTasks.map((t) => (
                <option key={t.id} value={`tasks:${t.id}`}>{t.id} — {t.name}</option>
              ))}
            </optgroup>
          )}
        </select>
      )}

      {link.isError && (
        <div className="modal-error" style={{ marginTop: 10, marginBottom: 0 }}>
          {errorMessage(link.error, "No se pudo actualizar el vínculo. Intenta de nuevo.")}
        </div>
      )}
    </div>
  );
}
