"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { MemberAvatar } from "@/components/ui/Avatar";
import { AvailabilityGrid } from "@/components/ui/AvailabilityGrid";
import { EditMemberModal } from "@/components/views/EditMemberModal";
import { useCurrentMember } from "@/components/providers/CurrentMemberProvider";
import {
  StarAchievementIcon,
  SpeechAchievementIcon,
  BoltAchievementIcon,
  FileAchievementIcon,
  LockAchievementIcon,
} from "@/components/icons";
import { errorMessage } from "@/lib/api/http";
import { useDeleteMember, useMember } from "@/lib/api/members";

const achievementIcon = {
  star: StarAchievementIcon,
  speech: SpeechAchievementIcon,
  bolt: BoltAchievementIcon,
  file: FileAchievementIcon,
  lock: LockAchievementIcon,
};

function EmptyCardText({ children }: { children: React.ReactNode }) {
  return <div className="empty-line">{children}</div>;
}

export function MemberProfileView({ memberId }: { memberId: string }) {
  const router = useRouter();
  const current = useCurrentMember();
  const { data: member } = useMember(memberId);
  const deleteMember = useDeleteMember();
  const [editing, setEditing] = useState(false);
  if (!member) return null;

  const isSelf = current.id === member.id;
  const isCoordinacion = current.role === "COORDINACION";

  function handleDelete() {
    if (!member) return;
    const confirmed = window.confirm(
      `¿Eliminar a ${member.name} de la plataforma? Se borra su cuenta, sale de sus equipos y sus tareas quedan sin asignar. Esta acción no se puede deshacer.`,
    );
    if (!confirmed) return;
    deleteMember.mutate(member.id, { onSuccess: () => router.push("/miembros") });
  }

  const stars = "★".repeat(member.rankFilled) + "☆".repeat(4 - member.rankFilled);

  return (
    <section className="perfil-layout">
      <div>
        <div className="perfil-card">
          <MemberAvatar member={member} className="perfil-avatar-lg" />
          <h2 className="perfil-name">{member.name}</h2>
          <div className="perfil-role">
            {member.role}
            <Badge color={member.statusColor}>{member.status}</Badge>
          </div>

          <hr className="perfil-divider" />
          <dl className="perfil-info">
            <dt>Correo</dt>
            <dd>{member.email}</dd>
            <dt>Cumpleaños</dt>
            <dd>{member.birthday || "—"}</dd>
            <dt>Ingresó</dt>
            <dd>{member.joinedAt || "—"}</dd>
          </dl>

          <hr className="perfil-divider" />
          <div className="perfil-stats">
            <div className="perfil-stat">
              <div className="perfil-stat-val stars" aria-label={`Rango ${member.rankFilled} de 4`}>
                {member.rankFilled > 0 ? stars : "—"}
              </div>
              <div className="perfil-stat-lbl">Rango</div>
            </div>
            <div className="perfil-stat">
              <div className="perfil-stat-val">{member.level}</div>
              <div className="perfil-stat-lbl">Nivel</div>
            </div>
            <div className="perfil-stat">
              <div className="perfil-stat-val">{member.streak}</div>
              <div className="perfil-stat-lbl">Racha</div>
            </div>
          </div>

          <hr className="perfil-divider" />
          <div className="perfil-actions">
            {(isSelf || isCoordinacion) && (
              <button className="btn-primary btn-block" onClick={() => setEditing(true)}>
                {isSelf ? "Editar mi perfil" : "Editar perfil"}
              </button>
            )}
            {!isSelf && (
              <a href={`mailto:${member.email}`} className="btn-ghost btn-block">
                Enviar correo
              </a>
            )}
            {isCoordinacion && !isSelf && (
              <button
                className="btn-text-danger"
                style={{ alignSelf: "flex-start", marginTop: 4 }}
                onClick={handleDelete}
                disabled={deleteMember.isPending}
              >
                {deleteMember.isPending ? "Eliminando…" : "Eliminar miembro"}
              </button>
            )}
          </div>
          {deleteMember.isError && (
            <div className="modal-error" style={{ marginTop: 8, marginBottom: 0 }}>
              {errorMessage(deleteMember.error, "No se pudo eliminar al miembro. Intenta de nuevo.")}
            </div>
          )}
        </div>

        {editing && <EditMemberModal member={member} onClose={() => setEditing(false)} />}
      </div>

      <div className="perfil-right">
        <div className="card">
          <div className="perfil-sec">
            <div className="card-label">Proyectos{member.projects.length > 0 && <span className="label-count">{member.projects.length}</span>}</div>
            {member.projects.length === 0 && <EmptyCardText>No participa en ningún proyecto.</EmptyCardText>}
            {member.projects.map((p) => (
              <div key={p.id} className="perfil-proj-row">
                <div className="proj-dot" style={{ background: "var(--accent)" }} />
                <div className="proj-info">
                  <Link href={`/proyectos/${p.id}`} className="proj-name" style={{ display: "block" }}>{p.name}</Link>
                </div>
                <Badge color={p.statusColor}>{p.status}</Badge>
              </div>
            ))}
          </div>

          <div className="perfil-sec">
            <div className="card-label">Habilidades técnicas</div>
            {member.skills.length === 0 && <EmptyCardText>Sin habilidades registradas.</EmptyCardText>}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {member.skills.map((s) => (
                <span key={s} className="skill-chip">{s}</span>
              ))}
            </div>
          </div>

          <div className="perfil-sec">
            <div className="card-label">Disponibilidad semanal</div>
            {member.availability.length === 0 ? (
              <EmptyCardText>
                {isSelf ? "Aún no declaras tu disponibilidad. Agrégala desde «Editar mi perfil»." : "Sin disponibilidad declarada."}
              </EmptyCardText>
            ) : (
              <AvailabilityGrid value={member.availability} />
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-label">StandUps recientes</div>
          {member.standups.length === 0 && (
            <EmptyCardText>{isSelf ? "Aún no envías StandUps. Envía el de esta semana desde Reporte." : "Sin StandUps registrados."}</EmptyCardText>
          )}
          {member.standups.map((s, i) => (
            <div key={i} className="perfil-standup-item">
              <div className="perfil-standup-date">Semana {s.week}</div>
              <div className="perfil-standup-text">{s.text}</div>
              {s.learned && (
                <div className="perfil-standup-text perfil-standup-learned">
                  <span>Aprendí:</span> {s.learned}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="card">
          <div className="card-label">Logros</div>
          {member.achievements.length === 0 && <EmptyCardText>Todavía sin logros.</EmptyCardText>}
          <div className="perfil-achievements">
            {member.achievements.map((a) => {
              const Icon = achievementIcon[a.icon];
              return (
                <div key={a.id} className={`perfil-achievement${a.unlocked ? "" : " locked"}`} title={a.name}>
                  <div className={`perfil-achievement-icon ${a.unlocked ? "on" : "off"}`}>
                    {a.unlocked ? <Icon /> : <LockAchievementIcon />}
                  </div>
                  <div className="perfil-achievement-name">{a.name}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
