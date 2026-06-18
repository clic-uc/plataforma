"use client";

import { useEffect, useRef, useState } from "react";
import { MoonIcon, SunIcon, ProfileIcon, LogoutIcon } from "@/components/icons";
import { useShell } from "@/components/shell/ShellProvider";

export function UserMenu() {
  const { theme, toggleTheme } = useShell();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return (
    <div className="sidebar-footer" ref={ref}>
      <button className="user-avatar" onClick={() => setOpen((v) => !v)}>
        JP
      </button>
      <div className="user-meta">
        <div className="user-name">Arturo Herreros</div>
        <div className="user-role">Coordinación</div>
      </div>

      {open && (
        <div className="user-dropdown">
          <div className="ud-label">Arturo Herreros</div>
          <button
            className="ud-item"
            onClick={() => {
              toggleTheme();
              setOpen(false);
            }}
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
            <span>{theme === "dark" ? "Modo claro" : "Modo oscuro"}</span>
          </button>
          <button className="ud-item">
            <ProfileIcon />
            Ver mi perfil
          </button>
          <hr className="ud-divider" />
          <button className="ud-item" style={{ color: "var(--text-3)" }}>
            <LogoutIcon />
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}
