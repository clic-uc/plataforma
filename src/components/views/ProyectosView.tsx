"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { AvatarStack } from "@/components/ui/Avatar";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { SearchIcon } from "@/components/icons";
import { useProjects, type ProjectListItem } from "@/lib/api/projects";
import { CreateProjectModal } from "@/components/views/CreateProjectModal";
import { useIsCoordinacion } from "@/components/providers/CurrentMemberProvider";

/** Minúsculas y sin tildes, para que "gestion" encuentre "Gestión". */
function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function matchesSearch(project: ProjectListItem, query: string): boolean {
  if (!query) return true;
  return normalize([project.name, project.client, project.area, project.description].join(" ")).includes(query);
}

export function ProyectosView() {
  const [tab, setTab] = useState<"activos" | "archivados">("activos");
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const isCoordinacion = useIsCoordinacion();
  const { data: projects = [] } = useProjects();
  const query = normalize(search.trim());
  const matching = projects.filter((p) => matchesSearch(p, query));
  const activos = matching.filter((p) => !p.archived);
  const archivados = matching.filter((p) => p.archived);
  const shown = tab === "activos" ? activos : archivados;

  const emptyText = query
    ? `Ningún proyecto ${tab === "activos" ? "activo" : "archivado"} coincide con «${search.trim()}».`
    : tab === "activos"
      ? "No hay proyectos activos."
      : "No hay proyectos archivados aún.";

  return (
    <section>
      <div className="filter-row">
        <label className="search-box">
          <SearchIcon />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar proyecto…"
            aria-label="Buscar proyecto"
          />
        </label>
        <div className="tabs" style={{ margin: 0 }}>
          <div className={`tab-item${tab === "activos" ? " active" : ""}`} onClick={() => setTab("activos")}>
            Activos <span>{activos.length}</span>
          </div>
          <div className={`tab-item${tab === "archivados" ? " active" : ""}`} onClick={() => setTab("archivados")}>
            Archivados <span>{archivados.length}</span>
          </div>
        </div>
        {isCoordinacion && (
          <div style={{ marginLeft: "auto" }}>
            <button className="btn-primary" onClick={() => setCreating(true)}>+ Nuevo proyecto</button>
          </div>
        )}
      </div>

      {creating && <CreateProjectModal onClose={() => setCreating(false)} />}

      {shown.length === 0 ? (
        <div className="ph" style={{ minHeight: 160 }}>
          <div className="ph-text">{emptyText}</div>
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
              </div>
              <div className="pcard-meta">
                <AvatarStack members={p.team} accentFirst />
                <div className="pcard-labels">
                  <span className="pcard-label">{p.area}</span>
                  <span className="pcard-label">{p.client}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
