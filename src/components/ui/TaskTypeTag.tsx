import type { ProjectTask } from "@/lib/api/projects";

export function TaskTypeTag({ type }: { type: ProjectTask["type"] }) {
  return <span className={`task-type tt-${type}`}>{type.charAt(0).toUpperCase() + type.slice(1)}</span>;
}
