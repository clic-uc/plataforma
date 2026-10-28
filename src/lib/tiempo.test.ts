import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  MAX_CHART_SERIES,
  OTHER_SERIES_KEY,
  buildWeekChart,
  currentWeekStart,
  dateToDayKey,
  dayKeyToDate,
  formatEntryDate,
  formatHours,
  formatWeek,
  hoursInputToMinutes,
  isValidEntryMinutes,
  isWeekStart,
  minutesToHoursInput,
  recentWeeks,
  weekDays,
  weekStartOf,
  type ChartEntry,
} from "@/lib/tiempo";

// Igual que calendar.test.ts: en Chile es donde una fecha a medianoche UTC leída
// con getters locales caería el día anterior.
const originalTZ = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "America/Santiago";
});
afterAll(() => {
  if (originalTZ === undefined) delete process.env.TZ;
  else process.env.TZ = originalTZ;
});

describe("semanas", () => {
  it("la semana empieza el lunes, también desde el domingo", () => {
    expect(weekStartOf("2026-10-13")).toBe("2026-10-12");
    expect(weekStartOf("2026-10-18")).toBe("2026-10-12");
    expect(weekStartOf("2026-10-19")).toBe("2026-10-19");
  });

  it("solo un lunes válido es inicio de semana", () => {
    expect(isWeekStart("2026-10-12")).toBe(true);
    expect(isWeekStart("2026-10-13")).toBe(false);
    expect(isWeekStart("2026-02-30")).toBe(false);
    expect(isWeekStart(null)).toBe(false);
  });

  it("la semana en curso usa el hoy de Chile, no el de UTC", () => {
    // Lunes 19 oct 02:00 UTC = domingo 18 oct 23:00 en Chile (UTC−3).
    expect(currentWeekStart(new Date("2026-10-19T02:00:00Z"))).toBe("2026-10-12");
    expect(currentWeekStart(new Date("2026-10-19T03:30:00Z"))).toBe("2026-10-19");
  });

  it("lista semanas hacia atrás y los días de una semana cruzando el mes", () => {
    expect(recentWeeks("2026-10-12", 3)).toEqual(["2026-10-12", "2026-10-05", "2026-09-28"]);
    expect(weekDays("2026-09-28")).toEqual([
      "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04",
    ]);
  });

  it("formatea la semana y la fecha de un registro", () => {
    expect(formatWeek("2026-10-12")).toBe("12 – 18 oct 2026");
    expect(formatEntryDate("2026-10-16")).toBe("Vie 16 oct");
  });
});

describe("fechas en la base", () => {
  it("guarda la clave a medianoche UTC y la recupera sin correrse de día", () => {
    const date = dayKeyToDate("2026-06-01");
    expect(date.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(dateToDayKey(date)).toBe("2026-06-01");
  });
});

describe("horas", () => {
  it("formatea minutos como horas sin ceros de más", () => {
    expect(formatHours(150)).toBe("2.5h");
    expect(formatHours(180)).toBe("3h");
    expect(formatHours(45)).toBe("0.75h");
  });

  it("acepta solo tramos de 15 minutos entre 15 min y 24 h", () => {
    expect(isValidEntryMinutes(15)).toBe(true);
    expect(isValidEntryMinutes(24 * 60)).toBe(true);
    expect(isValidEntryMinutes(0)).toBe(false);
    expect(isValidEntryMinutes(20)).toBe(false);
    expect(isValidEntryMinutes(24 * 60 + 15)).toBe(false);
    expect(isValidEntryMinutes(30.5)).toBe(false);
  });

  it("convierte lo escrito en el formulario, con punto o coma", () => {
    expect(hoursInputToMinutes("2.5")).toBe(150);
    expect(hoursInputToMinutes("2,25")).toBe(135);
    expect(hoursInputToMinutes("0.1")).toBeNull();
    expect(hoursInputToMinutes("")).toBeNull();
    expect(hoursInputToMinutes("abc")).toBeNull();
    expect(minutesToHoursInput(135)).toBe("2.25");
  });
});

describe("buildWeekChart", () => {
  const p = (id: string, name = id) => ({ id, name });
  const entry = (date: string, minutes: number, project = p("a", "Alfa")): ChartEntry => ({ date, minutes, project });

  it("suma por día y proyecto e ignora lo que cae fuera de la semana", () => {
    const chart = buildWeekChart(
      [
        entry("2026-10-12", 60),
        entry("2026-10-12", 30),
        entry("2026-10-12", 120, p("b", "Beta")),
        entry("2026-10-14", 90, p("b", "Beta")),
        entry("2026-10-19", 600),
      ],
      "2026-10-12",
    );

    expect(chart.totalMinutes).toBe(300);
    expect(chart.series.map((s) => [s.name, s.slot, s.minutes])).toEqual([
      ["Alfa", 1, 90],
      ["Beta", 2, 210],
    ]);
    expect(chart.days[0]).toMatchObject({
      label: "Lun 12",
      totalMinutes: 210,
      segments: [{ key: "a", minutes: 90 }, { key: "b", minutes: 120 }],
    });
    expect(chart.days[1].segments).toEqual([]);
  });

  it("asigna colores por nombre, no por horas", () => {
    const chart = buildWeekChart(
      [entry("2026-10-12", 600, p("z", "Zeta")), entry("2026-10-12", 15, p("a", "Alfa"))],
      "2026-10-12",
    );
    expect(chart.series.map((s) => s.name)).toEqual(["Alfa", "Zeta"]);
  });

  it("junta en Otros los proyectos de menos horas cuando hay demasiados", () => {
    const entries = Array.from({ length: MAX_CHART_SERIES + 2 }, (_, i) =>
      entry("2026-10-13", (i + 1) * 15, p(`p${i}`, `Proyecto ${i}`)),
    );
    const chart = buildWeekChart(entries, "2026-10-12");

    expect(chart.series).toHaveLength(MAX_CHART_SERIES);
    const other = chart.series.at(-1)!;
    expect(other).toMatchObject({ key: OTHER_SERIES_KEY, slot: null, minutes: 15 + 30 + 45 });
    expect(chart.days[1].segments.at(-1)).toEqual({ key: OTHER_SERIES_KEY, minutes: 90 });
    expect(chart.days[1].totalMinutes).toBe(chart.totalMinutes);
  });

  it("redondea el eje a un paso limpio", () => {
    expect(buildWeekChart([], "2026-10-12")).toMatchObject({ axisMaxHours: 1, ticks: [0, 1] });
    expect(buildWeekChart([entry("2026-10-12", 150)], "2026-10-12")).toMatchObject({ axisMaxHours: 3, ticks: [0, 1, 2, 3] });
    expect(buildWeekChart([entry("2026-10-12", 7 * 60)], "2026-10-12")).toMatchObject({ axisMaxHours: 8, ticks: [0, 2, 4, 6, 8] });
  });
});
