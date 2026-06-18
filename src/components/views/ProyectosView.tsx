"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { AvatarStack } from "@/components/ui/Avatar";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { SearchIcon } from "@/components/icons";
import { projects } from "../../../prisma/seed/data/projects";

export function ProyectosView() {
  const [tab, setTab] = useState<"activos" | "archivados">("activos");
  const activos = projects.filter((p) => !p.archived);
  const archivados = projects.filter((p) => p.archived);
  const shown = tab === "activos" ? activos : archivados;

  return (
    <section>
      <div className="filter-row">
        <div className="search-mock">
          <SearchIcon />
          <span>Buscar proyecto…</span>
        </div>
        <div className="tabs" style={{ margin: 0 }}>
          <div className={`tab-item${tab === "activos" ? " active" : ""}`} onClick={() => setTab("activos")}>
            Activos <span>{activos.length}</span>
          </div>
          <div className={`tab-item${tab === "archivados" ? " active" : ""}`} onClick={() => setTab("archivados")}>
            Archivados <span>{archivados.length}</span>
          </div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <button className="btn-primary">+ Nuevo proyecto</button>
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="ph" style={{ minHeight: 160 }}>
          <div className="ph-text">No hay proyectos archivados aún.</div>
        </div>
      ) : (
        <div className="cards-grid">
          {shown.map((p) => (
            <Link key={p.id} href={`/proyectos/${p.id}`} className="pcard">
              <div className="pcard-head">
                <div className="pcard-name">{p.name}</div>
                <Badge color={p.statusColor}>{p.status}</Badge>
              </div>
              <div className="pcard-desc">{p.description}</div>
              <ProgressBar progress={p.progress} />
              <div className="pcard-foot">
                <div className="pcard-pct">{p.progress}% completado</div>
                <div className="gh-pill">
                  <div className="gh-dot" style={{ background: p.prCount > 0 ? "#e07328" : "var(--badge-green-fg)" }} />
                  {p.prCount} {p.prCount === 1 ? "PR" : "PRs"}
                </div>
              </div>
              <div className="pcard-meta">
                <AvatarStack count={p.teamSize} accentFirst />
                <div className="pcard-labels">
                  <span className="pcard-label">{p.teamLabel}</span>
                  <span className="pcard-label">{p.clientLabel}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
