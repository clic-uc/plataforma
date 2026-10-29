import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addDaysInZone,
  addMonths,
  allDayToISO,
  eventDaySpan,
  eventsByDay,
  formatEventWhen,
  instantToZonedTime,
  isAllDayRow,
  isDayKey,
  isoToAllDay,
  isoToLocalDateTime,
  layoutDayColumn,
  localDateTimeToISO,
  minutesInDay,
  monthGrid,
  monthTitle,
  parseCalendarParams,
  parseDayKey,
  todayInZone,
  toDayKey,
  weekRange,
  weekTitle,
  weeklyOccurrences,
  zonedTimeToInstant,
} from "@/lib/calendar";

// Todo en la zona de Chile: UTC−3 en verano y UTC−4 en invierno. Es donde un
// evento de día completo leído con getters locales cae el día anterior.
const originalTZ = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "America/Santiago";
});
afterAll(() => {
  if (originalTZ === undefined) delete process.env.TZ;
  else process.env.TZ = originalTZ;
});

const keys = (days: Date[]) => days.map(toDayKey);

describe("monthGrid", () => {
  it("cubre el mes con semanas lunes–domingo y devuelve el rango exclusivo", () => {
    const grid = monthGrid(parseDayKey("2026-10-13"));
    expect(grid.weeks).toHaveLength(5);
    expect(grid.weeks.every((w) => w.length === 7 && w[0].getDay() === 1)).toBe(true);
    expect(grid.from).toBe("2026-09-28");
    expect(grid.to).toBe("2026-11-02");
  });

  it("un mes que empieza en domingo necesita 6 filas", () => {
    // 1 nov 2026 es domingo.
    const grid = monthGrid(parseDayKey("2026-11-20"));
    expect(grid.weeks).toHaveLength(6);
    expect(grid.from).toBe("2026-10-26");
    expect(grid.to).toBe("2026-12-07");
  });

  it("un mes que empieza en lunes no agrega días del mes anterior", () => {
    // 1 jun 2026 es lunes.
    expect(monthGrid(parseDayKey("2026-06-10")).from).toBe("2026-06-01");
  });

  it("febrero de 28 días que empieza en lunes cabe en 4 filas", () => {
    const grid = monthGrid(parseDayKey("2027-02-01"));
    expect(grid.weeks).toHaveLength(4);
    expect(grid.from).toBe("2027-02-01");
    expect(grid.to).toBe("2027-03-01");
  });

  it("febrero bisiesto", () => {
    const grid = monthGrid(parseDayKey("2028-02-15"));
    expect(keys(grid.days)).toContain("2028-02-29");
    expect(grid.to).toBe("2028-03-06");
  });

  it("diciembre cruza al año siguiente", () => {
    const grid = monthGrid(parseDayKey("2026-12-01"));
    expect(grid.from).toBe("2026-11-30");
    expect(grid.to).toBe("2027-01-04");
  });

  it("no se descuadra con el cambio de horario (septiembre en Chile)", () => {
    const grid = monthGrid(parseDayKey("2026-09-15"));
    expect(new Set(keys(grid.days)).size).toBe(grid.days.length);
    expect(grid.days.every((d) => d.getHours() === 0 || d.getHours() === 1)).toBe(true);
  });
});

describe("weekRange / addMonths / navegación", () => {
  it("la semana va de lunes a domingo aunque cruce de mes y de año", () => {
    expect(weekRange(parseDayKey("2026-10-01"))).toMatchObject({ from: "2026-09-28", to: "2026-10-05" });
    expect(keys(weekRange(parseDayKey("2027-01-03")).days)).toEqual([
      "2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03",
    ]);
  });

  it("addMonths recorta al último día del mes destino", () => {
    expect(toDayKey(addMonths(parseDayKey("2026-01-31"), 1))).toBe("2026-02-28");
    expect(toDayKey(addMonths(parseDayKey("2026-12-15"), 1))).toBe("2027-01-15");
    expect(toDayKey(addMonths(parseDayKey("2026-01-15"), -1))).toBe("2025-12-15");
  });

  it("parseCalendarParams cae en los defaults con valores inválidos", () => {
    expect(parseCalendarParams("semana", "2026-10-14", "2026-10-13")).toEqual({ view: "semana", date: "2026-10-14" });
    expect(parseCalendarParams(undefined, undefined, "2026-10-13")).toEqual({ view: "mes", date: "2026-10-13" });
    expect(parseCalendarParams("anual", "2026-02-30", "2026-10-13")).toEqual({ view: "mes", date: "2026-10-13" });
    expect(parseCalendarParams(["semana"], ["2026-10-14"], "2026-10-13")).toEqual({ view: "mes", date: "2026-10-13" });
    expect(isDayKey("2026-10-14")).toBe(true);
  });

  it("títulos del período", () => {
    expect(monthTitle(parseDayKey("2026-10-13"))).toBe("Octubre 2026");
    expect(weekTitle(parseDayKey("2026-10-07"))).toBe("5 – 11 oct 2026");
    expect(weekTitle(parseDayKey("2026-10-01"))).toMatch(/^28 sept? – 4 oct 2026$/);
    expect(weekTitle(parseDayKey("2026-12-30"))).toBe("28 dic 2026 – 3 ene 2027");
  });
});

describe("zona horaria", () => {
  it("todayInZone usa la fecha de Chile, no la de UTC", () => {
    // 01:30 UTC del 14 es todavía el 13 en Chile.
    expect(todayInZone("America/Santiago", new Date("2026-10-14T01:30:00Z"))).toBe("2026-10-13");
    expect(todayInZone("UTC", new Date("2026-10-14T01:30:00Z"))).toBe("2026-10-14");
  });

  it("addDaysInZone conserva la hora de reloj al cruzar el cambio de horario", () => {
    // Sábado 4 abr 2026 18:00 (UTC−3) + 7 días = 11 abr 18:00 (UTC−4).
    expect(addDaysInZone(new Date("2026-04-04T21:00:00Z"), 7, "America/Santiago").toISOString()).toBe(
      "2026-04-11T22:00:00.000Z",
    );
    // Y al revés en septiembre: 18:00 (UTC−4) → 18:00 (UTC−3).
    expect(addDaysInZone(new Date("2026-09-01T22:00:00Z"), 14, "America/Santiago").toISOString()).toBe(
      "2026-09-15T21:00:00.000Z",
    );
  });

  it("zonedTimeToInstant aplica el offset de Chile vigente ese día", () => {
    expect(zonedTimeToInstant("2026-01-15", "10:00").toISOString()).toBe("2026-01-15T13:00:00.000Z");
    expect(zonedTimeToInstant("2026-07-15", "10:00").toISOString()).toBe("2026-07-15T14:00:00.000Z");
    // El día del cambio de abril, después del cambio.
    expect(zonedTimeToInstant("2026-04-05", "18:00").toISOString()).toBe("2026-04-05T22:00:00.000Z");
  });

  it("instantToZonedTime es el inverso", () => {
    expect(instantToZonedTime(new Date("2026-07-15T14:00:00Z"))).toEqual({ date: "2026-07-15", time: "10:00" });
    expect(instantToZonedTime(new Date("2026-10-14T01:30:00Z"))).toEqual({ date: "2026-10-13", time: "22:30" });
  });
});

describe("weeklyOccurrences", () => {
  const timed = { allDay: false, startsAt: new Date("2026-10-14T21:00:00Z"), endsAt: new Date("2026-10-14T22:30:00Z") };

  it("incluye la fecha tope y conserva la duración", () => {
    const occurrences = weeklyOccurrences(timed, "2026-10-28")!;
    expect(occurrences.map((o) => o.startsAt.toISOString())).toEqual([
      "2026-10-14T21:00:00.000Z",
      "2026-10-21T21:00:00.000Z",
      "2026-10-28T21:00:00.000Z",
    ]);
    expect(occurrences.every((o) => o.endsAt.getTime() - o.startsAt.getTime() === 90 * 60 * 1000)).toBe(true);
  });

  it("una fecha tope en la misma semana deja solo el evento original", () => {
    expect(weeklyOccurrences(timed, "2026-10-20")).toHaveLength(1);
  });

  it("rechaza más de 26 semanas o una fecha tope anterior", () => {
    expect(weeklyOccurrences(timed, "2027-04-14")).toHaveLength(27);
    expect(weeklyOccurrences(timed, "2027-04-21")).toBeNull();
    expect(weeklyOccurrences(timed, "2026-10-13")).toBeNull();
  });

  it("los de día completo avanzan en días UTC exactos", () => {
    const allDay = { allDay: true, startsAt: new Date("2026-10-14T00:00:00Z"), endsAt: new Date("2026-10-15T00:00:00Z") };
    expect(weeklyOccurrences(allDay, "2026-10-21")!.map((o) => o.startsAt.toISOString())).toEqual([
      "2026-10-14T00:00:00.000Z",
      "2026-10-21T00:00:00.000Z",
    ]);
  });
});

describe("eventos en la grilla", () => {
  const ev = (id: string, startsAt: string, endsAt: string, allDay = false) => ({ id, allDay, startsAt, endsAt });

  it("un evento de día completo cae en su día en UTC−3 y en UTC−4", () => {
    // Medianoche UTC es 21:00 o 20:00 del día anterior en Chile.
    const verano = ev("v", "2026-12-24T00:00:00.000Z", "2026-12-25T00:00:00.000Z", true);
    const invierno = ev("i", "2026-07-15T00:00:00.000Z", "2026-07-16T00:00:00.000Z", true);
    expect(eventDaySpan(verano)).toEqual({ first: "2026-12-24", last: "2026-12-24" });
    expect(eventDaySpan(invierno)).toEqual({ first: "2026-07-15", last: "2026-07-15" });
  });

  it("allDayToISO / isoToAllDay son inversos y el fin es exclusivo", () => {
    const iso = allDayToISO("2026-10-14", "2026-10-16");
    expect(iso).toEqual({ startsAt: "2026-10-14T00:00:00.000Z", endsAt: "2026-10-17T00:00:00.000Z" });
    expect(isoToAllDay(iso.startsAt, iso.endsAt)).toEqual({ first: "2026-10-14", last: "2026-10-16" });
  });

  it("localDateTimeToISO / isoToLocalDateTime trabajan en hora local", () => {
    expect(localDateTimeToISO("2026-10-14", "18:00")).toBe("2026-10-14T21:00:00.000Z");
    expect(localDateTimeToISO("2026-07-15", "08:30")).toBe("2026-07-15T12:30:00.000Z");
    expect(isoToLocalDateTime("2026-07-15T12:30:00.000Z")).toEqual({ date: "2026-07-15", time: "08:30" });
  });

  it("reparte eventos de varios días y no cuenta el día en que algo termina a medianoche", () => {
    const days = weekRange(parseDayKey("2026-10-14")).days;
    const multi = ev("multi", "2026-10-13T00:00:00.000Z", "2026-10-16T00:00:00.000Z", true); // 13–15
    const nocturno = ev("noct", "2026-10-16T01:00:00.000Z", "2026-10-16T03:00:00.000Z"); // 15, 22:00–24:00
    const cruzaMedianoche = ev("cruza", "2026-10-17T01:00:00.000Z", "2026-10-17T05:00:00.000Z"); // 16 22:00 – 17 02:00
    const temprano = ev("temp", "2026-10-15T12:00:00.000Z", "2026-10-15T13:00:00.000Z"); // 15, 09:00

    const byDay = eventsByDay([temprano, nocturno, multi, cruzaMedianoche], days);
    const ids = (key: string) => byDay.get(key)!.map((e) => e.id);

    expect(ids("2026-10-12")).toEqual([]);
    expect(ids("2026-10-13")).toEqual(["multi"]);
    expect(ids("2026-10-15")).toEqual(["multi", "temp", "noct"]);
    expect(ids("2026-10-16")).toEqual(["cruza"]);
    expect(ids("2026-10-17")).toEqual(["cruza"]);
    expect(ids("2026-10-18")).toEqual([]);

    expect(isAllDayRow(multi)).toBe(true);
    expect(isAllDayRow(cruzaMedianoche)).toBe(true);
    expect(isAllDayRow(nocturno)).toBe(false);
  });

  it("minutesInDay recorta al día", () => {
    const cruza = ev("cruza", "2026-10-17T01:00:00.000Z", "2026-10-17T05:00:00.000Z");
    expect(minutesInDay(cruza, "2026-10-16")).toEqual({ start: 22 * 60, end: 24 * 60 });
    expect(minutesInDay(cruza, "2026-10-17")).toEqual({ start: 0, end: 2 * 60 });
  });

  it("formatEventWhen", () => {
    expect(formatEventWhen(ev("a", "2026-10-14T00:00:00.000Z", "2026-10-15T00:00:00.000Z", true))).toMatch(
      /^mié,? 14 oct 2026 · Todo el día$/,
    );
    expect(formatEventWhen(ev("b", "2026-10-14T00:00:00.000Z", "2026-10-17T00:00:00.000Z", true))).toBe("14 oct – 16 oct 2026");
    expect(formatEventWhen(ev("c", "2026-10-14T21:00:00.000Z", "2026-10-14T22:00:00.000Z"))).toMatch(
      /^mié,? 14 oct 2026 · 18:00 – 19:00$/,
    );
  });
});

describe("layoutDayColumn", () => {
  const item = (id: string, start: number, end: number) => ({ item: id, start, end });
  const lanes = (placements: ReturnType<typeof layoutDayColumn<string>>) =>
    Object.fromEntries(placements.map((p) => [p.item, [p.lane, p.lanes]]));

  it("eventos sin solape ocupan todo el ancho", () => {
    expect(lanes(layoutDayColumn([item("a", 540, 600), item("b", 600, 660)]))).toEqual({ a: [0, 1], b: [0, 1] });
  });

  it("dos eventos solapados se reparten el ancho", () => {
    expect(lanes(layoutDayColumn([item("a", 540, 630), item("b", 570, 660)]))).toEqual({ a: [0, 2], b: [1, 2] });
  });

  it("un carril liberado se reutiliza y el grupo encadenado comparte el ancho", () => {
    // a solapa con b, b con c; c entra en el carril que dejó a.
    const result = lanes(layoutDayColumn([item("a", 540, 600), item("b", 570, 690), item("c", 600, 660), item("d", 720, 780)]));
    expect(result).toEqual({ a: [0, 2], b: [1, 2], c: [0, 2], d: [0, 1] });
  });

  it("tres a la vez", () => {
    expect(lanes(layoutDayColumn([item("a", 540, 600), item("b", 540, 600), item("c", 550, 580)]))).toEqual({
      a: [0, 3],
      b: [1, 3],
      c: [2, 3],
    });
  });

  it("minDuration separa eventos muy cortos que en pantalla se pisarían", () => {
    expect(lanes(layoutDayColumn([item("a", 540, 545), item("b", 550, 600)]))).toEqual({ a: [0, 1], b: [0, 1] });
    expect(lanes(layoutDayColumn([item("a", 540, 545), item("b", 550, 600)], 30))).toEqual({ a: [0, 2], b: [1, 2] });
  });
});
