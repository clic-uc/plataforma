"use client";

import { Badge } from "@/components/ui/Badge";
import { PlaceholderBox } from "@/components/ui/PlaceholderBox";
import {
  StarAchievementIcon,
  SpeechAchievementIcon,
  BoltAchievementIcon,
  FileAchievementIcon,
  LockAchievementIcon,
} from "@/components/icons";
import { useMember } from "@/lib/api/members";
import { DEFAULT_ACCENT_COLOR } from "@/lib/api/format";

const achievementIcon = {
  star: StarAchievementIcon,
  speech: SpeechAchievementIcon,
  bolt: BoltAchievementIcon,
  file: FileAchievementIcon,
  lock: LockAchievementIcon,
};

export function MemberProfileView({ memberId }: { memberId: string }) {
  const { data: member } = useMember(memberId);
  if (!member) return null;

  const filled = "★".repeat(member.rankFilled) + "☆".repeat(4 - member.rankFilled);

  return (
    <section className="perfil-layout">
      <div>
        <div className="perfil-card">
          <div className="perfil-avatar-lg" style={{ background: DEFAULT_ACCENT_COLOR }}>{member.initials}</div>
          <div className="perfil-name">{member.name}</div>
          <Badge color="blue" style={{ marginTop: 8 }}>{member.area}</Badge>
          <hr className="perfil-divider" />
          <div className="perfil-info-row"><span className="perfil-info-label">Email</span><span className="perfil-info-val" style={{ fontFamily: "var(--font-space-mono)", fontSize: 11 }}>{member.email}</span></div>
          <div className="perfil-info-row"><span className="perfil-info-label">Cumpleaños</span><span className="perfil-info-val">{member.birthday}</span></div>
          <div className="perfil-info-row"><span className="perfil-info-label">Ingresó</span><span className="perfil-info-val">{member.joinedAt}</span></div>
          <div className="perfil-info-row"><span className="perfil-info-label">Estado</span><span className="perfil-info-val"><Badge color={member.statusColor}>{member.status}</Badge></span></div>
          <hr className="perfil-divider" />
          <button className="btn-primary" style={{ width: "100%", fontSize: 12, marginBottom: 7 }}>Editar perfil</button>
          <button className="btn-ghost" style={{ width: "100%", fontSize: 12 }}>Enviar mensaje</button>
        </div>

        <div className="card" style={{ marginTop: 13, textAlign: "left" }}>
          <div className="card-label" style={{ marginBottom: 12 }}>Stats</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1px 1fr 1px 1fr", alignItems: "center", gap: 0 }}>
            <div style={{ textAlign: "center", padding: "4px 8px" }}>
              <div style={{ fontSize: 18, color: "var(--accent)", letterSpacing: 2, lineHeight: 1.2 }}>{filled}</div>
              <div style={{ fontFamily: "var(--font-space-mono)", fontSize: 8.5, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 4 }}>Rango</div>
            </div>
            <div style={{ background: "var(--border)", height: 40 }} />
            <div style={{ textAlign: "center", padding: "4px 8px" }}>
              <div style={{ fontFamily: "var(--font-barlow-condensed)", fontSize: 28, fontWeight: 700, color: "var(--text-1)", lineHeight: 1, height: 28 }}>{member.level}</div>
              <div style={{ fontFamily: "var(--font-space-mono)", fontSize: 9, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 1 }}>Nivel</div>
            </div>
            <div style={{ background: "var(--border)", height: 40 }} />
            <div style={{ textAlign: "center", padding: "4px 8px" }}>
              <div style={{ fontFamily: "var(--font-barlow-condensed)", fontSize: 28, fontWeight: 700, color: "var(--accent)", lineHeight: 1 }}>{member.streak}</div>
              <div style={{ fontFamily: "var(--font-space-mono)", fontSize: 8.5, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 1 }}>Racha</div>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginTop: 10, textAlign: "left" }}>
          <div className="card-label" style={{ marginBottom: 12 }}>Logros</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
            {member.achievements.map((a) => {
              const Icon = achievementIcon[a.icon];
              return (
                <div key={a.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, opacity: a.unlocked ? 1 : 0.32 }} title={a.name}>
                  {a.unlocked ? (
                    <div style={{ width: 38, height: 38, borderRadius: 8, background: DEFAULT_ACCENT_COLOR, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon />
                    </div>
                  ) : (
                    <div style={{ width: 38, height: 38, borderRadius: 8, background: "var(--ph-fill)", border: "1.5px dashed var(--border-dash)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <LockAchievementIcon />
                    </div>
                  )}
                  <div style={{ fontFamily: "var(--font-space-mono)", fontSize: 8, color: "var(--text-3)", textAlign: "center", lineHeight: 1.3 }}>{a.name}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="perfil-right">
        <div className="card">
          <div className="card-label">Habilidades técnicas</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {member.skills.map((s) => (
              <span key={s} className="skill-chip" style={{ fontSize: 10, padding: "3px 8px" }}>{s}</span>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-label">Proyectos</div>
          {member.projects.map((p) => (
            <div key={p.id} className="perfil-proj-row">
              <div className="proj-dot" style={{ background: DEFAULT_ACCENT_COLOR }} />
              <div className="proj-info">
                <div className="proj-name">{p.name}</div>
                <div className="proj-meta">{p.role}</div>
              </div>
              <Badge color={p.statusColor}>{p.status}</Badge>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="card-label">Disponibilidad semanal</div>
          <PlaceholderBox text={<>Grilla de bloques horarios declarados<br />Lun–Vie · mañana / tarde / noche</>} style={{ height: 80 }} />
        </div>

        <div className="card">
          <div className="card-label">StandUps recientes</div>
          {member.standups.map((s, i) => (
            <div key={i} className="perfil-standup-item">
              <div className="perfil-standup-date">{s.date}</div>
              <div className="perfil-standup-text">{s.text}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
