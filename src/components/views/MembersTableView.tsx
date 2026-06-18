"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { RankStars } from "@/components/ui/RankStars";
import { SearchIcon } from "@/components/icons";
import { members } from "../../../prisma/seed/data/members";

export function MembersTableView() {
  const router = useRouter();

  return (
    <section>
      <div className="dir-search-bar">
        <div className="search-mock" style={{ maxWidth: 280 }}>
          <SearchIcon />
          <span>Buscar miembro…</span>
        </div>
        <div className="select-mock"><span>Área ▾</span></div>
        <div className="select-mock"><span>Estado ▾</span></div>
        <div style={{ marginLeft: "auto" }}>
          <button className="btn-primary">+ Invitar miembro</button>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="dir-table">
          <thead>
            <tr>
              <th style={{ textAlign: "center" }}>Miembro</th>
              <th style={{ textAlign: "center" }}>Rango</th>
              <th style={{ textAlign: "center" }}>Área</th>
              <th style={{ textAlign: "center" }}>Proyectos</th>
              <th style={{ textAlign: "center" }}>Estado</th>
              <th style={{ textAlign: "center" }}>Cumpleaños</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} onClick={() => router.push(`/miembros/${m.id}`)}>
                <td>
                  <div className="dir-name-cell">
                    <div className="dir-avatar" style={{ background: m.color }}>{m.initials}</div>
                    <div>
                      <div className="dir-fullname">{m.name}</div>
                      <div className="dir-email">{m.email}</div>
                    </div>
                  </div>
                </td>
                <td><RankStars filled={m.rankFilled} number={m.rankNumber} /></td>
                <td><Badge color="blue" style={{ fontSize: 9 }}>{m.areaLabel}</Badge></td>
                <td>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }} onClick={(e) => e.stopPropagation()}>
                    {m.projectChips.map((c) => (
                      <Link key={c.projectId} href={`/proyectos/${c.projectId}`} className="proj-task-chip">
                        <span className="proj-task-chip-dot" style={{ background: c.color }} />{c.projectName}
                      </Link>
                    ))}
                  </div>
                </td>
                <td><Badge color={m.statusColor}>{m.status}</Badge></td>
                <td style={{ fontFamily: "var(--font-space-mono)", fontSize: 11 }}>{m.bday}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
