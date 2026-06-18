import type { StatCardData } from "../../../prisma/seed/data/dashboard";

export function StatCard({ stat }: { stat: StatCardData }) {
  return (
    <div className="stat-card">
      <div className="stat-lbl">{stat.label}</div>
      <div className={`stat-val${stat.accent ? " accent" : ""}`}>
        {stat.value}
        {stat.unit && <small>{stat.unit}</small>}
      </div>
      <div className={`stat-hint${stat.hintUp ? " up" : ""}`}>{stat.hint}</div>
    </div>
  );
}
