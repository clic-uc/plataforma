import { describe, expect, it } from "vitest";
import { FeatureStatus, KanbanColumn, Priority, ProjectStatus, TaskType } from "@/generated/prisma/enums";
import {
  FEATURE_STATUS_OPTIONS,
  KANBAN_COLUMN_OPTIONS,
  PRIORITY_OPTIONS,
  PROJECT_STATUS_OPTIONS,
  TASK_TYPE_OPTIONS,
  kanbanColumnLabel,
  kanbanColumnValue,
  priorityColor,
  priorityLabel,
} from "@/lib/api/status";

// Los Record<Enum, ...> ya los cubre TypeScript; las listas de opciones de los
// selects se escriben a mano y nada impide que les falte un valor del enum.
describe("opciones de los selects", () => {
  it.each([
    ["ProjectStatus", PROJECT_STATUS_OPTIONS, ProjectStatus],
    ["FeatureStatus", FEATURE_STATUS_OPTIONS, FeatureStatus],
    ["Priority", PRIORITY_OPTIONS, Priority],
    ["TaskType", TASK_TYPE_OPTIONS, TaskType],
    ["KanbanColumn", KANBAN_COLUMN_OPTIONS, KanbanColumn],
  ] as const)("%s: cada valor del enum aparece una sola vez", (_name, options, enumObject) => {
    const values = options.map((o) => o.value);
    expect([...values].sort()).toEqual(Object.values(enumObject).sort());
    expect(options.every((o) => o.label.trim() !== "")).toBe(true);
  });

  it("las columnas del kanban siguen el orden del flujo", () => {
    expect(KANBAN_COLUMN_OPTIONS.map((o) => o.value)).toEqual(["PENDIENTE", "PROGRESO", "REVISAR", "REVISION", "LISTO"]);
  });
});

describe("mapeos", () => {
  it("kanbanColumnValue es el inverso de kanbanColumnLabel", () => {
    for (const column of Object.values(KanbanColumn)) {
      expect(kanbanColumnValue[kanbanColumnLabel[column]]).toBe(column);
    }
  });

  it("cada prioridad tiene color", () => {
    for (const priority of Object.values(Priority)) {
      expect(priorityColor[priorityLabel[priority]]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
