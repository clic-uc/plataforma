// Quién trabaja en un proyecto: su equipo (ProjectMember) y coordinación. Solo ellos crean,
// editan, mueven y borran tareas y features, editan documentos, crean actas y resuelven
// comentarios; ver el proyecto, comentar documentos y todo lo de issues sigue abierto a
// cualquier miembro aprobado (Plataforma Interna #32).
//
// El servidor lo hace cumplir con assertProjectWriter (src/lib/auth/guards.ts), que lee
// ProjectMember. Esta versión pura es para la UI, que ya tiene el equipo en ProjectDetail:
// solo oculta acciones, no protege nada.

export function canEditProject(member: { id: string; role: string }, team: readonly { id: string }[]): boolean {
  return member.role === "COORDINACION" || team.some((m) => m.id === member.id);
}
