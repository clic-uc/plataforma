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
  return <span className={`task-type ${issueTypeClass[type]}`}>{issueTypeLabel[type].toLowerCase()}</span>;
}

const emptyText: Record<IssueFilter, string> = {
  ABIERTO: "Sin issues abiertos",
  CERRADO: "Sin issues cerrados",
  TODOS: "Sin issues todavía",
};

export function ProjectIssuesList({
  projectId,
  issues,
  filter,
}: {
  projectId: string;
  issues: IssueListItem[];
  filter: IssueFilter;
}) {
  const visible = filter === "TODOS" ? issues : issues.filter((issue) => issue.status === filter);

  if (visible.length === 0) {
    return (
      <div className="ph" style={{ height: 72 }}>
        <div className="ph-text">{emptyText[filter]}</div>
      </div>
    );
  }

  return (
    <div>
      {visible.map((issue) => (
        <Link
          key={issue.number}
          href={`/proyectos/${projectId}/issues/${issue.number}`}
          className={`issue-row${issue.status === "CERRADO" ? " closed" : ""}`}
        >
          <div className="issue-num">#{issue.number}</div>
          <div className="issue-main">
            <div className="issue-row-title">{issue.title}</div>
            <div className="issue-row-sub">
              {issue.author || "Ex miembro"} · {issue.lastActivityAt}
            </div>
          </div>
          <IssueTypeTag type={issue.type} />
          {issue.closeReason && (
            <Badge color="gray" style={{ fontSize: 8.5 }}>{issueCloseReasonLabel[issue.closeReason]}</Badge>
          )}
          <div className="issue-comments" title="Comentarios">
            {issue.commentCount} {issue.commentCount === 1 ? "comentario" : "comentarios"}
          </div>
        </Link>
      ))}
    </div>
  );
}
