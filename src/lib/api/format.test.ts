import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  formatDayMonth,
  formatDayMonthYear,
  formatMonthYear,
  formatWeekdayDayMonthYear,
  getInitials,
  parseISODateInput,
  toISODateInput,
} from "@/lib/api/format";

// Las fechas "solo calendario" se rompen en zonas con offset negativo; se prueba
// en la de Chile para que el test falle si alguien vuelve a usar toISOString().
const originalTZ = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "America/Santiago";
});
afterAll(() => {
  process.env.TZ = originalTZ;
});

describe("getInitials", () => {
  it("usa la inicial de las dos primeras palabras", () => {
    expect(getInitials("Ana María Pérez")).toBe("AM");
    expect(getInitials("  ana   pérez ")).toBe("AP");
  });

  it("con una sola palabra usa sus dos primeras letras", () => {
    expect(getInitials("octocat")).toBe("OC");
    expect(getInitials("x")).toBe("X");
  });
});

describe("fechas de calendario", () => {
  it("parseISODateInput interpreta la fecha en hora local, no en UTC", () => {
    const date = parseISODateInput("2026-06-01");
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 5, 1]);
  });

  it("toISODateInput y parseISODateInput son inversas", () => {
    for (const value of ["2026-01-01", "2026-06-01", "2026-12-31", "2024-02-29"]) {
      expect(toISODateInput(parseISODateInput(value))).toBe(value);
    }
  });

  it("toISODateInput rellena mes y día con ceros", () => {
    expect(toISODateInput(new Date(2026, 2, 5))).toBe("2026-03-05");
  });
});

describe("formatos en es-CL", () => {
  // Función y no constante: el cuerpo del describe corre antes que beforeAll,
  // y la fecha tiene que crearse con la zona horaria ya fijada.
  const june1 = () => new Date(2026, 5, 1);

  it("formatea sin el punto de las abreviaturas", () => {
    expect(formatMonthYear(june1())).toBe("jun 2026");
    expect(formatDayMonth(june1())).toBe("1 jun");
    expect(formatDayMonthYear(june1())).toBe("1 jun 2026");
  });

  it("incluye el día de la semana y quita todos los puntos", () => {
    const formatted = formatWeekdayDayMonthYear(june1());
    expect(formatted).toMatch(/^lun/);
    expect(formatted).toContain("1 jun 2026");
    expect(formatted).not.toContain(".");
  });
});
