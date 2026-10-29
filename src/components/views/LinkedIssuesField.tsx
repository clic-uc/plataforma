"use client";

import Link from "next/link";
import { useProjectIssues } from "@/lib/api/issues";

/**
 * Issues vinculados a una feature o tarea, como enlaces a su página. Solo lectura: los
 * vínculos se administran desde el issue. Sin vínculos no muestra nada.
 */
export function LinkedIssuesField({ projectId, issues }: { projectId: string; issues: number[] }) {
  const { data: projectIssues = [] } = useProjectIssues(projectId);
  if (issues.length === 0) return null;

  const titles = new Map(projectIssues.map((issue) => [issue.number, issue.title]));

  return (
    <div className="form-field">
      <div className="f-label">Issues</div>
      <div className="linked-issues">
        {issues.map((n) => (
          <Link key={n} href={`/proyectos/${projectId}/issues/${n}`} className="linked-issue">
            <span className="linked-issue-num">#{n}</span>
            {titles.get(n) && <span className="linked-issue-title">{titles.get(n)}</span>}
          </Link>
        ))}
      </div>
    </div>
  );
}
