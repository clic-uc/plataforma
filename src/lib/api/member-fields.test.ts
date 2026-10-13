import { describe, expect, it } from "vitest";
import {
  MAX_SKILLS,
  MAX_SKILL_LENGTH,
  birthdayFromDate,
  birthdayToDate,
  daysInBirthdayMonth,
  formatBirthday,
  normalizeSkills,
  parseAvailability,
  parseBirthdayValue,
  sanitizeAvailability,
} from "@/lib/api/member-fields";

describe("parseAvailability", () => {
  it("ordena según la grilla y quita duplicados", () => {
    expect(parseAvailability(["VIE_NOCHE", "LUN_TARDE", "LUN_MANANA", "LUN_TARDE"])).toEqual([
      "LUN_MANANA",
      "LUN_TARDE",
      "VIE_NOCHE",
    ]);
  });

  it("acepta la lista vacía", () => {
    expect(parseAvailability([])).toEqual([]);
  });

  it("rechaza bloques desconocidos o algo que no es una lista", () => {
    expect(parseAvailability(["SAB_MANANA"])).toBeNull();
    expect(parseAvailability(["LUN_MANANA", 3])).toBeNull();
    expect(parseAvailability("LUN_MANANA")).toBeNull();
  });

  it("sanitizeAvailability descarta en vez de fallar", () => {
    expect(sanitizeAvailability(["MAR_TARDE", "SAB_MANANA"])).toEqual(["MAR_TARDE"]);
  });
});

describe("cumpleaños", () => {
  it("valida mes y día, incluido el 29 de febrero", () => {
    expect(parseBirthdayValue("02-29")).toEqual({ month: 2, day: 29 });
    expect(parseBirthdayValue("02-30")).toBeNull();
    expect(parseBirthdayValue("04-31")).toBeNull();
    expect(parseBirthdayValue("13-01")).toBeNull();
    expect(parseBirthdayValue("1-5")).toBeNull();
  });

  it("daysInBirthdayMonth usa un año bisiesto", () => {
    expect(daysInBirthdayMonth(2)).toBe(29);
    expect(daysInBirthdayMonth(4)).toBe(30);
    expect(daysInBirthdayMonth(12)).toBe(31);
  });

  it("ida y vuelta por la fecha guardada", () => {
    const date = birthdayToDate("01-15")!;
    expect(date.toISOString()).toBe("2000-01-15T12:00:00.000Z");
    expect(birthdayFromDate(date)).toBe("01-15");
    expect(formatBirthday(date)).toBe("15 ene");
  });

  it("lee bien las filas del seed, guardadas a medianoche de Chile", () => {
    // new Date(2000, 0, 15) ejecutado en America/Santiago (UTC-3 en enero).
    const seeded = new Date("2000-01-15T03:00:00.000Z");
    expect(birthdayFromDate(seeded)).toBe("01-15");
    expect(formatBirthday(seeded)).toBe("15 ene");
  });
});

describe("normalizeSkills", () => {
  it("recorta, descarta vacías y quita duplicados sin distinguir mayúsculas", () => {
    expect(normalizeSkills([" React ", "", "python", "react", "Python ", "SQL"])).toEqual(["React", "python", "SQL"]);
  });

  it("rechaza habilidades demasiado largas o demasiadas", () => {
    expect(normalizeSkills(["x".repeat(MAX_SKILL_LENGTH + 1)])).toBeNull();
    expect(normalizeSkills(Array.from({ length: MAX_SKILLS + 1 }, (_, i) => `s${i}`))).toBeNull();
    expect(normalizeSkills(Array.from({ length: MAX_SKILLS }, (_, i) => `s${i}`))).toHaveLength(MAX_SKILLS);
  });
});
