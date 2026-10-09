"use client";

import { createContext, useContext } from "react";
import type { CurrentMember } from "@/lib/auth/current-member";

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
