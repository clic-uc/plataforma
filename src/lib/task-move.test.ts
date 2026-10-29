import { describe, expect, it } from "vitest";
import { assigneeRequired, moveNeedsDialog, planMove } from "@/lib/task-move";

const me = "ana";

describe("planMove", () => {
  it("sin nada que preguntar mueve directo", () => {
    const plan = planMove({ from: "PENDIENTE", to: "LISTO", assigneeId: null, moverId: me });
    expect(plan).toEqual({ assignee: null, time: null });
    expect(moveNeedsDialog(plan)).toBe(false);
  });

  it("a En progreso o En revisión sin asignado pide a quién", () => {
    expect(planMove({ from: "PENDIENTE", to: "PROGRESO", assigneeId: null, moverId: me }).assignee).toBe("required");
    expect(planMove({ from: "REVISAR", to: "REVISION", assigneeId: null, moverId: me }).assignee).toBe("required");
  });

  it("a una columna de trabajo con asignado no pregunta", () => {
    const plan = planMove({ from: "PENDIENTE", to: "PROGRESO", assigneeId: "beto", moverId: me });
    expect(moveNeedsDialog(plan)).toBe(false);
  });

  it("de En progreso a Por revisar ofrece reasignar y, si la mueve el asignado, las horas", () => {
    expect(planMove({ from: "PROGRESO", to: "REVISAR", assigneeId: me, moverId: me })).toEqual({
      assignee: "reassign",
      time: "TRABAJO",
    });
    expect(planMove({ from: "PROGRESO", to: "REVISAR", assigneeId: "beto", moverId: me })).toEqual({
      assignee: "reassign",
      time: null,
    });
  });

  it("una tarea antigua en En progreso sin asignado también ofrece reasignar al pasar a Por revisar", () => {
    expect(planMove({ from: "PROGRESO", to: "REVISAR", assigneeId: null, moverId: me })).toEqual({
      assignee: "reassign",
      time: null,
    });
  });

  it("al salir de En revisión las horas son de revisión", () => {
    expect(planMove({ from: "REVISION", to: "LISTO", assigneeId: me, moverId: me })).toEqual({
      assignee: null,
      time: "REVISION",
    });
  });

  it("de En progreso a En revisión pregunta horas pero no asignado si ya hay", () => {
    expect(planMove({ from: "PROGRESO", to: "REVISION", assigneeId: me, moverId: me })).toEqual({
      assignee: null,
      time: "TRABAJO",
    });
  });

  it("no ofrece horas fuera de las columnas de trabajo ni a quien no es el asignado", () => {
    expect(planMove({ from: "REVISAR", to: "LISTO", assigneeId: me, moverId: me }).time).toBeNull();
    expect(planMove({ from: "REVISION", to: "LISTO", assigneeId: "beto", moverId: me }).time).toBeNull();
  });

  it("sin cambio de columna no hay nada que preguntar", () => {
    expect(planMove({ from: "PROGRESO", to: "PROGRESO", assigneeId: null, moverId: me })).toEqual({
      assignee: null,
      time: null,
    });
  });
});

describe("assigneeRequired", () => {
  it("exige asignado al entrar a una columna de trabajo", () => {
    expect(assigneeRequired("PENDIENTE", "PROGRESO", null)).toBe(true);
    expect(assigneeRequired("PENDIENTE", "REVISAR", null)).toBe(false);
  });

  it("exige no quitarlo estando en una", () => {
    expect(assigneeRequired("PROGRESO", "PROGRESO", "ana")).toBe(true);
  });

  it("deja pasar una tarea antigua que ya estaba ahí sin asignado", () => {
    expect(assigneeRequired("REVISION", "REVISION", null)).toBe(false);
  });
});
