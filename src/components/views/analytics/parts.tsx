import { ApiRequestError } from "@/lib/api/http";
import { formatDayMonth } from "@/lib/api/format";
import { parseDayKey } from "@/lib/calendar";
import type { AnalyticsMember } from "@/lib/analytics";

// Piezas compartidas por las secciones de /analiticas. Todo en Tailwind con los
// tokens del proyecto (bloque @theme de globals.css).
//
// Los "!" solo aparecen en celdas de tabla: globals.css tiene `thead th` y
// `tbody td` sin @layer (padding, alineación, color, tamaño y borde inferior), y
// esas reglas ganan a cualquier utilidad de Tailwind. Cuando pasen a una capa,
// los "!" sobran y se pueden quitar.

export const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/**
 * Escala del mapa de calor: el acento sobre la superficie, de 0 (vacío) a 4.
 * El nivel 4 lleva texto en el color de la superficie para mantener el contraste
 * en claro y en oscuro.
 */
export const HEAT_CELL = [
  "bg-[color-mix(in_srgb,var(--surface-2)_55%,transparent)] text-text-3",
  "bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] text-text-1",
  "bg-[color-mix(in_srgb,var(--accent)_32%,transparent)] text-text-1",
  "bg-[color-mix(in_srgb,var(--accent)_58%,transparent)] text-text-1",
  "bg-accent text-surface",
] as const;

/** "26 oct" */
export function weekShort(week: string): string {
  return formatDayMonth(parseDayKey(week));
}

export function Panel({
  title,
  aside,
  children,
  className = "",
  flush = false,
}: {
  title?: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Sin padding lateral en el cuerpo (tablas que llegan al borde). */
  flush?: boolean;
}) {
  return (
    <section className={`min-w-0 rounded-lg border border-border bg-surface ${className}`}>
      {(title || aside) && (
        <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 pt-4">
          {title && <h2 className="text-sm font-semibold text-text-2">{title}</h2>}
          {aside && <div className="text-xs text-text-3">{aside}</div>}
        </header>
      )}
      <div className={flush ? "pt-3 pb-2" : "px-5 pt-3 pb-5"}>{children}</div>
    </section>
  );
}

export function Avatar({ member, size = "md" }: { member: Pick<AnalyticsMember, "initials" | "image">; size?: "sm" | "md" }) {
  const box = size === "sm" ? "size-5 text-2xs" : "size-6 text-2xs";
  return member.image ? (
    // <img> en vez de next/image por el mismo motivo que en UserMenu.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={member.image} alt="" className={`${box} shrink-0 rounded-full object-cover`} />
  ) : (
    <span aria-hidden className={`${box} grid shrink-0 place-items-center rounded-full bg-accent font-semibold text-white`}>
      {member.initials}
    </span>
  );
}

/** Avatar + nombre, con "Hiatus" al lado cuando corresponde. */
export function PersonCell({ member }: { member: AnalyticsMember }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Avatar member={member} />
      <span className="truncate text-sm font-medium text-text-1">{member.name}</span>
      {member.status === "HIATUS" && <span className="shrink-0 text-xs text-text-3">Hiatus</span>}
    </div>
  );
}

/** Lista corta de personas como fichas; la usan "quién falta" y la disponibilidad. */
export function PeopleChips({ members }: { members: AnalyticsMember[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {members.map((m) => (
        <li key={m.id} className="inline-flex items-center gap-1.5 rounded-full border border-border py-0.5 pr-2.5 pl-0.5 text-sm text-text-1">
          <Avatar member={m} size="sm" />
          {m.name}
        </li>
      ))}
    </ul>
  );
}

export function Figure({ value, label, tone = "default" }: { value: React.ReactNode; label: React.ReactNode; tone?: "default" | "muted" }) {
  return (
    <div className="min-w-0">
      <div className={`font-condensed text-2xl font-bold tabular-nums ${tone === "muted" ? "text-text-3" : "text-text-1"}`}>{value}</div>
      <div className="mt-1 text-xs text-text-3">{label}</div>
    </div>
  );
}

export function Swatch({ className = "", color }: { className?: string; color?: string }) {
  return <span aria-hidden className={`inline-block size-2.5 shrink-0 rounded-[2px] ${className}`} style={color ? { background: color } : undefined} />;
}

/** Mensaje para un error de carga; 403 de rol se explica en vez de mostrarse crudo. */
export function LoadError({ error, what }: { error: Error; what: string }) {
  const forbidden = error instanceof ApiRequestError && error.code === "FORBIDDEN_ROLE";
  return (
    <div className="rounded-lg border border-border bg-surface px-5 py-4 text-sm text-text-2">
      {forbidden ? "Analíticas es solo para coordinación." : `No se pudo cargar ${what}. Recarga la página.`}
    </div>
  );
}

/**
 * Las tablas usan el estilo global de la app (`thead th`: 12px semibold, --text-3,
 * línea inferior; `tbody td`: 13px, padding 9px 12px, línea inferior). Estas son
 * las correcciones de borde para que la primera y la última columna se alineen
 * con el título del panel.
 */
export const firstCol = "pl-5!";
export const lastCol = "pr-5!";
