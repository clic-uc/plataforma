"use client";

import { useShell } from "@/components/shell/ShellProvider";

export function ShellGrid({ children }: { children: React.ReactNode }) {
  const { sidebarCollapsed } = useShell();
  return <div className={`app${sidebarCollapsed ? " sb-collapsed" : ""}`}>{children}</div>;
}
