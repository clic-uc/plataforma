"use client";

import { createContext, useContext, useEffect, useSyncExternalStore } from "react";
import { getSnapshot, getServerSnapshot, subscribe, setShellState } from "./shellStore";

interface ShellState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  theme: "light" | "dark";
  toggleTheme: () => void;
}

const ShellContext = createContext<ShellState | null>(null);

export function ShellProvider({ children }: { children: React.ReactNode }) {
  const { sidebarCollapsed, theme } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  return (
    <ShellContext.Provider
      value={{
        sidebarCollapsed,
        toggleSidebar: () => setShellState({ sidebarCollapsed: !sidebarCollapsed }),
        theme,
        toggleTheme: () => setShellState({ theme: theme === "dark" ? "light" : "dark" }),
      }}
    >
      {children}
    </ShellContext.Provider>
  );
}

export function useShell() {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used within ShellProvider");
  return ctx;
}
