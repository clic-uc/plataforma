import Link from "next/link";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";
import { stats, myProjects, activityFeed } from "../../../prisma/seed/data/dashboard";
import { DashboardCalendarCard } from "@/components/views/DashboardCalendarCard";

export function DashboardView() {
  return (
    <section>
      <div className="stats-row">
        {stats.map((s) => (
          <StatCard key={s.label} stat={s} />
        ))}
      </div>

      <div className="dash-main">
        <div className="card">
          <div className="card-label">MIS PROYECTOS</div>
          {myProjects.map((p) => (
            <Link key={p.projectId} href={`/proyectos/${p.projectId}`} className="proj-row">
              <div className="proj-dot" style={{ background: p.color }} />
              <div className="proj-info">
                <div className="proj-name">{p.name}</div>
                <div className="proj-meta">{p.meta}</div>
                <div className="proj-tasks">
                  {p.tasks.map((t) => (
                    <span key={t.id} className="proj-task-chip">
                      <span className="proj-task-chip-dot" style={{ background: p.color }} />#{t.id} · {t.label}
                    </span>
                  ))}
                </div>
              </div>
              <Badge color={p.statusColor} style={{ flexShrink: 0 }}>
                {p.status}
              </Badge>
            </Link>
          ))}
          <div
            style={{
              paddingTop: 13,
              borderTop: "1px solid var(--border)",
              marginTop: 2,
              display: "flex",
              justifyContent: "flex-end",
            }}
          >
            <Link href="/proyectos" className="btn-primary" style={{ fontSize: 12, padding: "5px 11px" }}>
              Ver todos →
            </Link>
          </div>
        </div>

        <div className="card">
          <div className="card-label">Actividad reciente</div>
          {activityFeed.map((item, i) => (
            <div key={i} className="act-item">
              <div className="act-dot" />
              <div className="act-time">{item.time}</div>
              <div className="act-text">
                {item.text}
                {item.strong && <> <strong>{item.strong}</strong></>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <DashboardCalendarCard />
    </section>
  );
}
