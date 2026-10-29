import { useState } from "react";
import Link from "next/link";
import type { AvailabilitySlot } from "@/lib/api/member-fields";
import { AVAILABILITY_BLOCKS, AVAILABILITY_DAYS } from "@/lib/api/member-fields";
import type { AvailabilityCell, TeamReport } from "@/lib/analytics";
import { Figure, HEAT_CELL, Panel, PeopleChips, firstCol, focusRing, lastCol } from "@/components/views/analytics/parts";

/** Nivel de la celda según qué parte de los activos está disponible. */
function availabilityLevel(count: number, active: number): number {
  if (count === 0 || active === 0) return 0;
  return Math.min(4, Math.ceil((count / active) * 4));
}

export function TeamSection({ report }: { report: TeamReport }) {
  return (
    <div className="flex flex-col gap-4">
      <section className="grid grid-cols-2 gap-y-4 rounded-lg border border-border bg-surface px-5 py-4 md:grid-cols-4 md:divide-x md:divide-border">
        <Figure value={report.total} label="Miembros aprobados" />
        <div className="md:pl-5">
          <Figure value={report.active} label="Activos" />
        </div>
        <div className="md:pl-5">
          <Figure value={report.hiatus} label="En Hiatus" tone={report.hiatus === 0 ? "muted" : "default"} />
        </div>
        <div className="md:pl-5">
          <Figure
            value={report.pending}
            label={
              report.pending > 0 ? (
                <>
                  Solicitudes por aprobar ·{" "}
                  <Link href="/miembros" className={`rounded-sm text-accent-ink underline-offset-2 hover:underline ${focusRing}`}>
                    Revisar en Equipo
                  </Link>
                </>
              ) : (
                "Solicitudes por aprobar"
              )
            }
            tone={report.pending === 0 ? "muted" : "default"}
          />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Panel title="Por rol" className="self-start" flush>
          <RolesTable report={report} />
        </Panel>
        <Panel
          title="Disponibilidad del equipo"
          aside={report.active > 0 ? `${report.declared} de ${report.active} activos la declararon` : undefined}
        >
          <AvailabilityMap report={report} />
        </Panel>
      </div>
    </div>
  );
}

function RolesTable({ report }: { report: TeamReport }) {
  const td = "text-right! tabular-nums text-text-1!";
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          <th scope="col" className={firstCol}>Rol</th>
          <th scope="col" className="text-right!">Activos</th>
          <th scope="col" className="text-right!">Hiatus</th>
          <th scope="col" className={`${lastCol} text-right!`}>Total</th>
        </tr>
      </thead>
      <tbody>
        {report.byRole.map((r) => (
          <tr key={r.role}>
            <td className={`${firstCol} font-medium text-text-1!`}>{r.label}</td>
            <td className={td}>{r.active || <span className="text-text-3">–</span>}</td>
            <td className={td}>{r.hiatus || <span className="text-text-3">–</span>}</td>
            <td className={`${td} ${lastCol} font-semibold`}>{r.active + r.hiatus}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AvailabilityMap({ report }: { report: TeamReport }) {
  const bySlot = new Map(report.availability.map((c) => [c.slot, c]));
  const best = report.availability.reduce<AvailabilityCell | null>(
    (top, c) => (c.members.length > (top?.members.length ?? 0) ? c : top),
    null,
  );
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null);
  const selected = bySlot.get(selectedSlot ?? best?.slot ?? "LUN_MANANA")!;

  if (report.active === 0) return <p className="text-sm text-text-3">No hay miembros activos.</p>;

  return (
    <div className="flex flex-col gap-4">
      {report.declared === 0 ? (
        <p className="text-sm text-text-3">
          Nadie ha declarado su disponibilidad. Cada persona la marca en su perfil, en Equipo.
        </p>
      ) : (
        <>
          <table className="border-separate! border-spacing-1">
            <thead>
              <tr>
                <th className="w-20 border-b-0!" />
                {AVAILABILITY_DAYS.map((d) => (
                  <th key={d.value} scope="col" className="border-b-0! px-0! pb-0.5! text-center!">
                    {d.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {AVAILABILITY_BLOCKS.map((b) => (
                <tr key={b.value}>
                  <th scope="row" className="pr-2! text-left text-xs font-semibold text-text-3">
                    {b.label}
                  </th>
                  {AVAILABILITY_DAYS.map((d) => {
                    const cell = bySlot.get(`${d.value}_${b.value}`)!;
                    const n = cell.members.length;
                    const isSelected = cell.slot === selected.slot;
                    return (
                      <td key={d.value} className="border-b-0! p-0!">
                        <button
                          type="button"
                          onClick={() => setSelectedSlot(cell.slot)}
                          aria-pressed={isSelected}
                          aria-label={`${cell.label}: ${n} ${n === 1 ? "persona" : "personas"}`}
                          className={`grid h-10 w-full cursor-pointer place-items-center rounded-sm text-sm font-medium tabular-nums transition-shadow duration-150 ${
                            HEAT_CELL[availabilityLevel(n, report.active)]
                          } ${isSelected ? "ring-2 ring-accent-ink ring-offset-2 ring-offset-surface" : ""} ${focusRing}`}
                        >
                          {n}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          <div>
            <div className="mb-2 text-sm text-text-2">
              <span className="font-semibold text-text-1">{selected.label}</span> ·{" "}
              {selected.members.length === 0
                ? "nadie disponible"
                : `${selected.members.length} de ${report.active} activos`}
            </div>
            {selected.members.length > 0 && <PeopleChips members={selected.members} />}
          </div>
        </>
      )}

      {report.undeclared.length > 0 && report.declared > 0 && (
        <div className="border-t border-border pt-3">
          <div className="mb-2 text-xs text-text-3">Sin disponibilidad declarada</div>
          <PeopleChips members={report.undeclared} />
        </div>
      )}
    </div>
  );
}
