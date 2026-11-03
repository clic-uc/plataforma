import { describe, expect, it } from "vitest";
import type { Priority } from "@/generated/prisma/enums";
import { matchesPriorityFilter, sortIssuesByPriority } from "@/lib/api/issues";

describe("sortIssuesByPriority", () => {
  const issue = (number: number, priority: Priority | null) => ({ number, priority });

  it("ordena de alta a sin prioridad", () => {
    const sorted = sortIssuesByPriority([issue(1, null), issue(2, "BAJA"), issue(3, "ALTA"), issue(4, "MEDIA")]);
    expect(sorted.map((i) => i.priority)).toEqual(["ALTA", "MEDIA", "BAJA", null]);
  });

  it("dentro de cada nivel conserva el orden de entrada", () => {
    const sorted = sortIssuesByPriority([
      issue(1, "MEDIA"),
      issue(2, null),
      issue(3, "ALTA"),
      issue(4, "MEDIA"),
      issue(5, null),
      issue(6, "ALTA"),
    ]);
    expect(sorted.map((i) => i.number)).toEqual([3, 6, 1, 4, 2, 5]);
  });

  it("no modifica la lista recibida", () => {
    const issues = [issue(1, null), issue(2, "ALTA")];
    sortIssuesByPriority(issues);
    expect(issues.map((i) => i.number)).toEqual([1, 2]);
  });
});

describe("matchesPriorityFilter", () => {
  it("TODAS deja pasar cualquiera, con o sin prioridad", () => {
    expect(matchesPriorityFilter("ALTA", "TODAS")).toBe(true);
    expect(matchesPriorityFilter(null, "TODAS")).toBe(true);
  });

  it("SIN deja pasar solo los que no tienen", () => {
    expect(matchesPriorityFilter(null, "SIN")).toBe(true);
    expect(matchesPriorityFilter("BAJA", "SIN")).toBe(false);
  });

  it("una prioridad deja pasar solo esa", () => {
    expect(matchesPriorityFilter("MEDIA", "MEDIA")).toBe(true);
    expect(matchesPriorityFilter("ALTA", "MEDIA")).toBe(false);
    expect(matchesPriorityFilter(null, "MEDIA")).toBe(false);
  });
});
