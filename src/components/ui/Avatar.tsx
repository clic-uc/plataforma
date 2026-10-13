interface AvatarPerson {
  id: string;
  name: string;
  initials: string;
}

export function AvatarStack({ members, accentFirst = false }: { members: AvatarPerson[]; accentFirst?: boolean }) {
  const shown = members.slice(0, 4);
  const extra = members.length - shown.length;
  return (
    <div className="avatars">
      {shown.map((m, i) => (
        <div key={m.id} className={`ava${accentFirst && i === 0 ? " accent-ava" : ""}`} title={m.name}>
          {m.initials}
        </div>
      ))}
      {extra > 0 && (
        <div className="ava" title={members.slice(4).map((m) => m.name).join(", ")}>
          +{extra}
        </div>
      )}
    </div>
  );
}

/** Foto de GitHub si la hay; si no, iniciales sobre el acento. */
export function MemberAvatar({
  member,
  className,
}: {
  member: { initials: string; image: string | null };
  className: string;
}) {
  return (
    <div className={className} style={{ background: "var(--accent)" }}>
      {member.image ? (
        // <img> en vez de next/image por el mismo motivo que en UserMenu.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={member.image} alt="" className="user-avatar-img" />
      ) : (
        member.initials
      )}
    </div>
  );
}

export function AssigneeAvatar({ assignee }: { assignee: AvatarPerson | null }) {
  return (
    <div className={`task-ava${assignee ? " accent-ava" : ""}`} title={assignee ? assignee.name : "Sin asignar"}>
      {assignee?.initials}
    </div>
  );
}
