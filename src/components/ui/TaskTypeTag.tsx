import type { TaskType } from "@/lib/types";

export function TaskTypeTag({ type }: { type: TaskType }) {
  return <span className={`task-type tt-${type}`}>{type}</span>;
}
