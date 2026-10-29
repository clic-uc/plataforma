"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MemberStatus } from "@/generated/prisma/enums";
import { Badge } from "@/components/ui/Badge";
import { MemberAvatar } from "@/components/ui/Avatar";
import { RankStars } from "@/components/ui/RankStars";
import { SearchIcon } from "@/components/icons";
import { InviteMemberModal } from "@/components/views/InviteMemberModal";
import { PendingMembersTable } from "@/components/views/PendingMembersTable";
import { useIsCoordinacion } from "@/components/providers/CurrentMemberProvider";
import { useMembers, usePendingMembers, type MemberListItem } from "@/lib/api/members";
import { normalizeSearch } from "@/lib/api/format";
import { MEMBER_STATUS_OPTIONS } from "@/lib/api/status";

function matchesSearch(member: MemberListItem, query: string): boolean {
  if (!query) return true;
  return normalizeSearch(
    [member.name, member.email, ...member.projects.map((p) => p.name)].join(" "),
  ).includes(query);
}

export function MembersTableView() {
  const router = useRouter();
  const isCoordinacion = useIsCoordinacion();
  const { data: members = [] } = useMembers();
  const { data: pending = [] } = usePendingMembers({ enabled: isCoordinacion });

  const [tab, setTab] = useState<"miembros" | "pendientes">("miembros");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<MemberStatus | "">("");
  const [inviting, setInviting] = useState(false);

  const query = normalizeSearch(search.trim());
  const shown = members.filter(
    (m) => matchesSearch(m, query) && (!status || m.statusValue === status),
  );
  const filtering = !!query || !!status;

  return (
    <section>
      {/* Vistas (pestañas) arriba; el filtro solo aplica a la lista y va debajo. */}
      <div className="utabs" style={{ marginBottom: 16 }}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "miembros"}
          className={`utab${tab === "miembros" ? " active" : ""}`}
          onClick={() => setTab("miembros")}
        >
          Miembros <span className="utab-count">{members.length}</span>
        </button>
        {isCoordinacion && (
          <button
            type="button"
            role="tab"
            aria-selected={tab === "pendientes"}
            className={`utab${tab === "pendientes" ? " active" : ""}`}
            onClick={() => setTab("pendientes")}
          >
            Pendientes <span className="utab-count">{pending.length}</span>
          </button>
        )}
        <div style={{ marginLeft: "auto", paddingBottom: 6 }}>
          <button className="btn-primary" onClick={() => setInviting(true)}>Invitar miembro</button>
        </div>
      </div>

      {inviting && <InviteMemberModal onClose={() => setInviting(false)} />}

      {tab === "pendientes" ? (
        <PendingMembersTable pending={pending} />
      ) : (
        <>
          <div className="filter-row">
            <label className="search-box">
              <SearchIcon />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre, correo o proyecto…"
                aria-label="Buscar miembro"
              />
            </label>
            <select
              className="filter-select"
              value={status}
              onChange={(e) => setStatus(e.target.value as MemberStatus | "")}
              aria-label="Estado"
            >
              <option value="">Todos los estados</option>
              {MEMBER_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {shown.length === 0 ? (
            <div className="ph">
              <div className="ph-text">
                {filtering
                  ? "Ningún miembro coincide con la búsqueda. Prueba con otro nombre o quita el filtro de estado."
                  : "Todavía no hay miembros aprobados. Invita a alguien compartiendo el enlace de ingreso."}
              </div>
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <table className="dir-table">
                <thead>
                  <tr>
                    <th>Miembro</th>
                    <th>Rango</th>
                    <th>Proyectos</th>
                    <th>Estado</th>
                    <th>Cumpleaños</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((m) => (
                    <tr key={m.id} className="clickable" onClick={() => router.push(`/miembros/${m.id}`)}>
                      <td>
                        <div className="dir-name-cell">
                          <MemberAvatar member={m} className="dir-avatar" />
                          <div>
                            <Link
                              href={`/miembros/${m.id}`}
                              className="dir-fullname"
                              style={{ textDecoration: "none" }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {m.name}
                            </Link>
                            <div className="dir-email">{m.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        {m.rankFilled > 0 ? (
                          <RankStars filled={m.rankFilled} />
                        ) : (
                          <span className="dir-empty-val" title="Sin rango asignado">—</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }} onClick={(e) => e.stopPropagation()}>
                          {m.projects.length === 0 && <span className="dir-empty-val">—</span>}
                          {m.projects.map((p) => (
                            <Link key={p.id} href={`/proyectos/${p.id}`} className="chip">
                              {p.name}
                            </Link>
                          ))}
                        </div>
                      </td>
                      <td><Badge color={m.statusColor}>{m.status}</Badge></td>
                      <td style={{ fontVariantNumeric: "tabular-nums" }}>
                        {m.birthday || <span className="dir-empty-val">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
