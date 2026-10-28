/**
 * Reglas de los campos editables de un miembro. Puro y client-safe: lo usan el
 * parseo del servidor y los formularios, para que ambos acepten lo mismo.
 */

export const MAX_NAME_LENGTH = 80;
export const MAX_SKILLS = 20;
export const MAX_SKILL_LENGTH = 40;
export const MAX_LEVEL = 99;

// ─── Disponibilidad ───

export const AVAILABILITY_DAYS = [
  { value: "LUN", label: "Lun" },
  { value: "MAR", label: "Mar" },
  { value: "MIE", label: "Mié" },
  { value: "JUE", label: "Jue" },
  { value: "VIE", label: "Vie" },
] as const;

export const AVAILABILITY_BLOCKS = [
  { value: "MANANA", label: "Mañana" },
  { value: "TARDE", label: "Tarde" },
  { value: "NOCHE", label: "Noche" },
] as const;

type AvailabilityDay = (typeof AVAILABILITY_DAYS)[number]["value"];
type AvailabilityBlock = (typeof AVAILABILITY_BLOCKS)[number]["value"];
export type AvailabilitySlot = `${AvailabilityDay}_${AvailabilityBlock}`;

export function availabilitySlot(day: AvailabilityDay, block: AvailabilityBlock): AvailabilitySlot {
  return `${day}_${block}`;
}

const ALL_SLOTS: readonly string[] = AVAILABILITY_DAYS.flatMap((d) =>
  AVAILABILITY_BLOCKS.map((b) => availabilitySlot(d.value, b.value)),
);

/**
 * Valida una lista de bloques y la devuelve sin duplicados y en orden de la
 * grilla (día, luego bloque). null si trae algo que no es un bloque válido.
 */
export function parseAvailability(value: unknown): AvailabilitySlot[] | null {
  if (!Array.isArray(value)) return null;
  if (!value.every((v) => typeof v === "string" && ALL_SLOTS.includes(v))) return null;
  return ALL_SLOTS.filter((slot) => value.includes(slot)) as AvailabilitySlot[];
}

/** Para leer la columna: descarta valores que ya no existen en vez de fallar. */
export function sanitizeAvailability(values: string[]): AvailabilitySlot[] {
  return ALL_SLOTS.filter((slot) => values.includes(slot)) as AvailabilitySlot[];
}

// ─── Cumpleaños ───
//
// Se guarda solo día y mes, en el año 2000 (bisiesto, para admitir el 29 de
// febrero). La fecha va a mediodía UTC y se lee con getters UTC: así ningún
// huso entre UTC-11 y UTC+11 la corre de día. Las filas antiguas del seed
// quedaron a medianoche de Chile (03:00 o 04:00 UTC), que también se leen bien.

const BIRTHDAY_YEAR = 2000;

export const MONTH_OPTIONS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
].map((label, i) => ({ value: i + 1, label }));

/** Días del mes (1-12) en el año de referencia; febrero tiene 29. */
export function daysInBirthdayMonth(month: number): number {
  return new Date(Date.UTC(BIRTHDAY_YEAR, month, 0)).getUTCDate();
}

/** "MM-DD" → { month, day }, o null si no es una fecha de cumpleaños válida. */
export function parseBirthdayValue(value: string): { month: number; day: number } | null {
  const match = /^(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > daysInBirthdayMonth(month)) return null;
  return { month, day };
}

export function toBirthdayValue(month: number, day: number): string {
  return `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function birthdayToDate(value: string): Date | null {
  const parts = parseBirthdayValue(value);
  return parts ? new Date(Date.UTC(BIRTHDAY_YEAR, parts.month - 1, parts.day, 12)) : null;
}

export function birthdayFromDate(date: Date): string {
  return toBirthdayValue(date.getUTCMonth() + 1, date.getUTCDate());
}

export function formatBirthday(date: Date): string {
  return new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short", timeZone: "UTC" })
    .format(date)
    .replace(".", "");
}

// ─── Habilidades ───

/**
 * Recorta, descarta vacías y quita duplicados sin distinguir mayúsculas
 * (conserva la primera forma escrita). null si alguna es demasiado larga o si
 * son demasiadas: mejor rechazar que truncar en silencio.
 */
export function normalizeSkills(values: string[]): string[] | null {
  const seen = new Set<string>();
  const skills: string[] = [];
  for (const raw of values) {
    const skill = raw.trim();
    if (!skill) continue;
    if (skill.length > MAX_SKILL_LENGTH) return null;
    const key = skill.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    skills.push(skill);
  }
  return skills.length <= MAX_SKILLS ? skills : null;
}
