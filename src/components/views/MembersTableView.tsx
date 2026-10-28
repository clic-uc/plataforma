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
import { PlaceholderBox } from "@/components/ui/PlaceholderBox";
import { useIsCoordinacion } from "@/components/providers/CurrentMemberProvider";
import { useMembers, usePendingMembers, type MemberListItem } from "@/lib/api/members";
import { DEFAULT_ACCENT_COLOR, normalizeSearch } from "@/lib/api/format";
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

  const [tab, setTab] = useState<"miembros" | "equipos" | "pendientes">("miembros");
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
      <div className="dir-search-bar">
        {tab === "miembros" && (
          <>
            <label className="search-box" style={{ maxWidth: 280 }}>
              <SearchIcon />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar miembro…"
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
          </>
        )}
        <div className="tabs" style={{ margin: 0 }}>
          <div className={`tab-item${tab === "miembros" ? " active" : ""}`} onClick={() => setTab("miembros")}>
            Lista completa <span>{members.length}</span>
          </div>
          <div className={`tab-item${tab === "equipos" ? " active" : ""}`} onClick={() => setTab("equipos")}>
            Gestionar equipos
          </div>
          {isCoordinacion && (
            <div className={`tab-item${tab === "pendientes" ? " active" : ""}`} onClick={() => setTab("pendientes")}>
              Pendientes <span>{pending.length}</span>
            </div>
          )}
        </div>
        <div style={{ marginLeft: "auto" }}>
          <button className="btn-primary" onClick={() => setInviting(true)}>+ Invitar miembro</button>
        </div>
      </div>

      {inviting && <InviteMemberModal onClose={() => setInviting(false)} />}

      {tab === "pendientes" ? (
        <PendingMembersTable pending={pending} />
      ) : tab === "equipos" ? (
        <PlaceholderBox text={<>Gestión de equipos<br />Próximamente</>} style={{ minHeight: 160 }} />
      ) : shown.length === 0 ? (
        <div className="ph" style={{ minHeight: 160 }}>
          <div className="ph-text">
            {filtering ? "Ningún miembro coincide con los filtros." : "Todavía no hay miembros aprobados."}
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="dir-table">
            <thead>
              <tr>
                <th style={{ textAlign: "center" }}>Miembro</th>
                <th style={{ textAlign: "center" }}>Rango</th>
                <th style={{ textAlign: "center" }}>Proyectos</th>
                <th style={{ textAlign: "center" }}>Estado</th>
                <th style={{ textAlign: "center" }}>Cumpleaños</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((m) => (
                <tr key={m.id} onClick={() => router.push(`/miembros/${m.id}`)}>
                  <td>
                    <div className="dir-name-cell">
                      <MemberAvatar member={m} className="dir-avatar" />
                      <div>
                        <div className="dir-fullname">{m.name}</div>
                        <div className="dir-email">{m.email}</div>
                      </div>
                    </div>
                  </td>
                  <td><RankStars filled={m.rankFilled} /></td>
                  <td>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }} onClick={(e) => e.stopPropagation()}>
                      {m.projects.map((p) => (
                        <Link key={p.id} href={`/proyectos/${p.id}`} className="proj-task-chip">
                          <span className="proj-task-chip-dot" style={{ background: DEFAULT_ACCENT_COLOR }} />{p.name}
                        </Link>
                      ))}
                    </div>
                  </td>
                  <td><Badge color={m.statusColor}>{m.status}</Badge></td>
                  <td style={{ fontFamily: "var(--font-space-mono)", fontSize: 11 }}>{m.birthday}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
