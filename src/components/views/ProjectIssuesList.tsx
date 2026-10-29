"use client";

import { useState } from "react";
import Link from "next/link";
import type { IssueType } from "@/generated/prisma/enums";
import { Badge } from "@/components/ui/Badge";
import { issueCloseReasonLabel, issueTypeLabel } from "@/lib/api/status";
import type { IssueFilter, IssueListItem } from "@/lib/api/issues";

// Reutiliza los colores de los tipos de tarea (.tt-*): bug en rojo, idea en azul, pregunta en violeta.
const issueTypeClass: Record<IssueType, string> = {
  BUG: "tt-fix",
  IDEA: "tt-feature",
  PREGUNTA: "tt-spike",
};

export function IssueTypeTag({ type }: { type: IssueType }) {
  return <span className={`task-type ${issueTypeClass[type]}`}>{issueTypeLabel[type]}</span>;
}

const emptyText: Record<IssueFilter, string> = {
  ABIERTO: "No hay issues abiertos. Abre uno con «Nuevo issue» para discutir un bug, una idea o una pregunta.",
  CERRADO: "No hay issues cerrados.",
  TODOS: "Este proyecto no tiene issues todavía. Abre uno con «Nuevo issue».",
};

/** Punto de "sin revisar", el mismo en la fila y en el filtro. */
function UnreviewedDot() {
  return <span className="size-2 shrink-0 rounded-full bg-accent" aria-hidden />;
}

export function ProjectIssuesList({
  projectId,
  issues,
  filter,
}: {
  projectId: string;
  issues: IssueListItem[];
  filter: IssueFilter;
}) {
  // El estado (abiertos/cerrados/todos) lo elige ProjectDetailView; "sin revisar" se filtra acá.
  const [onlyUnreviewed, setOnlyUnreviewed] = useState(false);

  const byStatus = filter === "TODOS" ? issues : issues.filter((issue) => issue.status === filter);
  const unreviewedCount = byStatus.filter((issue) => !issue.reviewedByMe).length;
  const visible = onlyUnreviewed ? byStatus.filter((issue) => !issue.reviewedByMe) : byStatus;

  if (byStatus.length === 0) {
    return (
      <div className="ph">
        <div className="ph-text">{emptyText[filter]}</div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-1.5 flex min-h-7 items-center gap-2 text-xs text-text-3">
        {unreviewedCount > 0 || onlyUnreviewed ? (
          <button
            type="button"
            aria-pressed={onlyUnreviewed}
            onClick={() => setOnlyUnreviewed(!onlyUnreviewed)}
            className={`inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium tabular-nums transition-colors duration-150 ${
              onlyUnreviewed
                ? "border-accent bg-accent-dim text-accent-ink"
                : "border-border bg-surface text-text-2 hover:border-border-dash hover:text-text-1"
            }`}
          >
            <UnreviewedDot />
            {unreviewedCount} sin revisar
          </button>
        ) : (
          <span>Revisaste todos los de esta lista.</span>
        )}
        {onlyUnreviewed && (
          <button type="button" className="cursor-pointer text-xs text-text-3 hover:text-accent" onClick={() => setOnlyUnreviewed(false)}>
            Ver todos
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="ph">
          <div className="ph-text">No te queda nada por revisar aquí.</div>
        </div>
      ) : (
        visible.map((issue) => (
          <Link
            key={issue.number}
            href={`/proyectos/${projectId}/issues/${issue.number}`}
            className={`issue-row${issue.status === "CERRADO" ? " closed" : ""}`}
          >
            <span className="flex w-2 shrink-0 justify-center" title={issue.reviewedByMe ? undefined : "Sin revisar"}>
              {!issue.reviewedByMe && <UnreviewedDot />}
            </span>
            <div className="issue-num">#{issue.number}</div>
            <div className="issue-main">
              <div className="issue-row-title" style={issue.reviewedByMe ? undefined : { fontWeight: 600 }}>
                {issue.title}
                {!issue.reviewedByMe && <span className="sr-only"> (sin revisar)</span>}
              </div>
              <div className="issue-row-sub">
                {issue.author || "Ex miembro"} · {issue.lastActivityAt}
              </div>
            </div>
            <IssueTypeTag type={issue.type} />
            {issue.closeReason && (
              <Badge color="gray">{issueCloseReasonLabel[issue.closeReason]}</Badge>
            )}
            <div className="issue-comments" title="Comentarios">
              {issue.commentCount} {issue.commentCount === 1 ? "comentario" : "comentarios"}
            </div>
          </Link>
        ))
      )}
    </div>
  );
}
