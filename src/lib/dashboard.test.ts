import { describe, expect, it } from "vitest";
import {
  buildActivityFeed,
  compareWeekHours,
  describeActivity,
  eventsByZonedDay,
  formatRelativeTime,
  formatUpcomingDay,
  standupStreak,
  type ActivityItem,
} from "@/lib/dashboard";

describe("standupStreak", () => {
  const current = "2026-10-26";

  it("cuenta la semana en curso si ya se envió", () => {
    expect(standupStreak(["2026-10-26", "2026-10-19", "2026-10-12"], current)).toEqual({ weeks: 3, sentThisWeek: true });
  });

  it("sin el de esta semana, la racha sigue viva desde la anterior", () => {
    expect(standupStreak(["2026-10-19", "2026-10-12"], current)).toEqual({ weeks: 2, sentThisWeek: false });
  });

  it("se corta en la primera semana sin StandUp", () => {
    expect(standupStreak(["2026-10-26", "2026-10-19", "2026-10-05"], current)).toEqual({ weeks: 2, sentThisWeek: true });
  });

  it("es cero si faltó la semana pasada y aún no se envía la actual", () => {
    expect(standupStreak(["2026-10-12", "2026-10-05"], current)).toEqual({ weeks: 0, sentThisWeek: false });
    expect(standupStreak([], current)).toEqual({ weeks: 0, sentThisWeek: false });
  });

  it("cruza el cambio de año", () => {
    expect(standupStreak(["2027-01-04", "2026-12-28", "2026-12-21"], "2027-01-04").weeks).toBe(3);
  });
});

describe("compareWeekHours", () => {
  const thisWeek = [
    { date: "2026-10-26", minutes: 120 },
    { date: "2026-10-28", minutes: 60 },
  ];
  const lastWeek = [
    { date: "2026-10-19", minutes: 60 },
    { date: "2026-10-21", minutes: 30 },
    { date: "2026-10-22", minutes: 600 },
  ];

  it("compara con la semana pasada hasta el mismo día", () => {
    // Hoy miércoles 28: cuenta lun 19 y mié 21, no el jueves 22.
    expect(compareWeekHours(thisWeek, lastWeek, "2026-10-28")).toEqual({ thisWeek: 180, lastWeekSoFar: 90, delta: 90 });
  });

  it("el domingo compara semanas completas", () => {
    expect(compareWeekHours(thisWeek, lastWeek, "2026-11-01")).toEqual({ thisWeek: 180, lastWeekSoFar: 690, delta: -510 });
  });

  it("sin registros da cero", () => {
    expect(compareWeekHours([], [], "2026-10-26")).toEqual({ thisWeek: 0, lastWeekSoFar: 0, delta: 0 });
  });
});

describe("formatUpcomingDay", () => {
  it("dice hoy y mañana", () => {
    expect(formatUpcomingDay("2026-10-29", "2026-10-29")).toBe("Hoy");
    expect(formatUpcomingDay("2026-10-30", "2026-10-29")).toBe("Mañana");
  });

  it("usa el día de la semana dentro de los próximos 7 días y agrega el mes después", () => {
    expect(formatUpcomingDay("2026-11-02", "2026-10-29")).toBe("Lun 2");
    expect(formatUpcomingDay("2026-11-09", "2026-10-29")).toBe("Lun 9 nov");
  });
});

describe("formatRelativeTime", () => {
  // Jueves 29 oct 2026, 15:00 en Chile (UTC−3).
  const now = new Date("2026-10-29T18:00:00.000Z");

  it("minutos y horas del mismo día", () => {
    expect(formatRelativeTime("2026-10-29T17:59:40.000Z", now)).toBe("ahora");
    expect(formatRelativeTime("2026-10-29T17:55:00.000Z", now)).toBe("hace 5 min");
    expect(formatRelativeTime("2026-10-29T16:30:00.000Z", now)).toBe("hace 1 h");
    expect(formatRelativeTime("2026-10-29T03:30:00.000Z", now)).toBe("hace 14 h");
  });

  it("corta los días en hora de Chile, no en UTC", () => {
    // 01:00 UTC del 29 son las 22:00 del 28 en Chile.
    expect(formatRelativeTime("2026-10-29T01:00:00.000Z", now)).toBe("ayer");
  });

  it("día de la semana en la última semana y fecha más atrás", () => {
    expect(formatRelativeTime("2026-10-26T15:00:00.000Z", now)).toBe("lun 26");
    expect(formatRelativeTime("2026-10-20T15:00:00.000Z", now)).toBe("20 oct");
    expect(formatRelativeTime("2025-12-20T15:00:00.000Z", now)).toBe("20 dic 2025");
  });

  it("un instante en el futuro (reloj desfasado) es ahora", () => {
    expect(formatRelativeTime("2026-10-29T18:05:00.000Z", now)).toBe("ahora");
  });
});

describe("eventsByZonedDay", () => {
  const days = ["2026-10-26", "2026-10-27", "2026-10-28"];
  const event = (id: string, startsAt: string, endsAt: string, allDay = false) => ({ id, allDay, startsAt, endsAt });

  it("ubica los eventos con hora según el día de Chile", () => {
    // 01:00 UTC del 28 = 22:00 del 27 en Chile.
    const late = event("a", "2026-10-28T01:00:00.000Z", "2026-10-28T02:00:00.000Z");
    const byDay = eventsByZonedDay([late], days);
    expect(byDay.get("2026-10-27")).toEqual([{ event: late, time: "22:00" }]);
    expect(byDay.get("2026-10-28")).toEqual([]);
  });

  it("lee los de día completo en UTC y los repite en cada día que cubren", () => {
    const allDay = event("b", "2026-10-26T00:00:00.000Z", "2026-10-28T00:00:00.000Z", true);
    const byDay = eventsByZonedDay([allDay], days);
    expect(byDay.get("2026-10-26")).toEqual([{ event: allDay, time: null }]);
    expect(byDay.get("2026-10-27")).toEqual([{ event: allDay, time: null }]);
    expect(byDay.get("2026-10-28")).toEqual([]);
  });

  it("pone primero los de día completo y luego por hora", () => {
    const morning = event("c", "2026-10-26T12:00:00.000Z", "2026-10-26T13:00:00.000Z");
    const allDay = event("d", "2026-10-26T00:00:00.000Z", "2026-10-27T00:00:00.000Z", true);
    const evening = event("e", "2026-10-26T21:00:00.000Z", "2026-10-26T22:00:00.000Z");
    const ids = eventsByZonedDay([evening, morning, allDay], days).get("2026-10-26")!.map((s) => s.event.id);
    expect(ids).toEqual(["d", "c", "e"]);
  });
});

describe("buildActivityFeed", () => {
  const base = { actor: { id: "ana", name: "Ana" }, self: false, project: { id: "p1", name: "San Miguel" } };

  it("ordena del más reciente al más antiguo y respeta el límite", () => {
    const items: ActivityItem[] = [
      { ...base, id: "s1", at: "2026-10-27T15:00:00.000Z", href: null, kind: "standup" },
      { ...base, id: "s2", at: "2026-10-29T15:00:00.000Z", href: null, kind: "standup" },
      { ...base, id: "s3", at: "2026-10-28T15:00:00.000Z", href: null, kind: "standup" },
    ];
    expect(buildActivityFeed(items, 2).map((i) => i.id)).toEqual(["s2", "s3"]);
  });

  it("junta los guardados de un documento por la misma persona en el mismo día", () => {
    const edit = (id: string, at: string, actor = base.actor): ActivityItem => ({
      ...base,
      actor,
      id,
      at,
      href: "/proyectos/p1/docs/kickoff",
      kind: "doc_edit",
      doc: "Kickoff",
      count: 1,
    });
    const feed = buildActivityFeed([
      edit("v1", "2026-10-29T12:00:00.000Z"),
      edit("v2", "2026-10-29T15:00:00.000Z"),
      edit("v3", "2026-10-29T16:00:00.000Z", { id: "beto", name: "Beto" }),
      edit("v4", "2026-10-28T15:00:00.000Z"),
    ]);
    expect(feed.map((i) => [i.id, i.kind === "doc_edit" && i.count])).toEqual([
      ["v3", 1],
      ["v2", 2],
      ["v4", 1],
    ]);
  });
});

describe("describeActivity", () => {
  const base = { id: "x", at: "2026-10-29T15:00:00.000Z", project: null, href: null };

  it("en tercera persona para otros y en segunda para uno mismo", () => {
    expect(describeActivity({ ...base, actor: { id: "a", name: "Ana" }, self: false, kind: "standup" })).toEqual([
      { strong: "Ana" },
      { text: " envió su StandUp" },
    ]);
    expect(describeActivity({ ...base, actor: { id: "yo", name: "Yo" }, self: true, kind: "standup" })).toEqual([
      { text: "Enviaste tu StandUp" },
    ]);
  });

  it("nombra al ex miembro cuando no hay autor", () => {
    expect(describeActivity({ ...base, actor: null, self: false, kind: "issue_open", number: 4, title: "Login falla" })).toEqual([
      { strong: "Ex miembro" },
      { text: " abrió" },
      { text: " " },
      { ref: "#4" },
      { text: " Login falla" },
    ]);
  });

  it("una tarea completada lleva su label como referencia", () => {
    const done = { ...base, kind: "task_done" as const, label: "T-03", name: "Login con GitHub" };
    expect(describeActivity({ ...done, actor: { id: "a", name: "Ana" }, self: false })).toEqual([
      { strong: "Ana" },
      { text: " completó" },
      { text: " " },
      { ref: "T-03" },
      { text: " Login con GitHub" },
    ]);
    expect(describeActivity({ ...done, actor: { id: "yo", name: "Yo" }, self: true })[0]).toEqual({ text: "Completaste" });
  });

  it("cuenta los guardados juntados y escribe las horas", () => {
    const edit = describeActivity({ ...base, actor: { id: "a", name: "Ana" }, self: false, kind: "doc_edit", doc: "Kickoff", count: 3 });
    expect(edit.at(-1)).toEqual({ text: " (3 veces)" });
    expect(describeActivity({ ...base, actor: { id: "yo", name: "Yo" }, self: true, kind: "hours", minutes: 150 })).toEqual([
      { text: "Registraste" },
      { text: " " },
      { strong: "2.5h" },
    ]);
  });
});
