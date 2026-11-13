"use client";

import { createContext, useContext } from "react";
import type { CurrentMember } from "@/lib/auth/current-member";
import { canEditProject } from "@/lib/project-access";

const CurrentMemberContext = createContext<CurrentMember | null>(null);

/**
 * Expone al árbol cliente el Member que ya resolvió (dashboard)/layout.tsx.
 *
 * Solo sirve para decidir qué mostrar (por ejemplo, esconder acciones de
 * coordinación): la autorización real la siguen haciendo los guards del servidor.
 */
export function CurrentMemberProvider({ member, children }: { member: CurrentMember; children: React.ReactNode }) {
  return <CurrentMemberContext.Provider value={member}>{children}</CurrentMemberContext.Provider>;
}

export function useCurrentMember(): CurrentMember {
  const member = useContext(CurrentMemberContext);
  if (!member) throw new Error("useCurrentMember must be used within CurrentMemberProvider");
  return member;
}

export function useIsCoordinacion(): boolean {
  return useCurrentMember().role === "COORDINACION";
}

/**
 * Si la persona trabaja en el proyecto (su equipo o coordinación): decide si se muestran
 * las acciones sobre tareas, features, documentos y actas. Con el proyecto aún sin cargar,
 * false. El servidor lo hace cumplir con assertProjectWriter.
 */
export function useCanEditProject(project: { team: readonly { id: string }[] } | undefined | null): boolean {
  const member = useCurrentMember();
  return project ? canEditProject(member, project.team) : false;
}
