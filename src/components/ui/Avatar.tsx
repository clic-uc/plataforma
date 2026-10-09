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

export function AssigneeAvatar({ assignee }: { assignee: AvatarPerson | null }) {
  return (
    <div className={`task-ava${assignee ? " accent-ava" : ""}`} title={assignee ? assignee.name : "Sin asignar"}>
      {assignee?.initials}
    </div>
  );
}
