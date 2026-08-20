"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoonIcon, SunIcon, ProfileIcon, LogoutIcon } from "@/components/icons";
import { useShell } from "@/components/shell/ShellProvider";
import { authClient } from "@/lib/auth-client";
import type { CurrentMember } from "@/lib/auth/current-member";
import { getInitials } from "@/lib/api/format";
import { memberRoleLabel } from "@/lib/api/status";

export function UserMenu({ member }: { member: CurrentMember }) {
  const { theme, toggleTheme } = useShell();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  async function handleSignOut() {
    setSigningOut(true);
    await authClient.signOut();
    // replace() en vez de push(): evita que el historial devuelva al dashboard.
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="sidebar-footer" ref={ref}>
      <button className="user-avatar" onClick={() => setOpen((v) => !v)}>
        {member.image ? (
          // <img> en vez de next/image: el host avatars.githubusercontent.com
          // tendría que declararse en images.remotePatterns, y la optimización no
          // se justifica para un avatar de 30px.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={member.image} alt="" className="user-avatar-img" />
        ) : (
          getInitials(member.name)
        )}
      </button>
      <div className="user-meta">
        <div className="user-name">{member.name}</div>
        <div className="user-role">{memberRoleLabel[member.role]}</div>
      </div>

      {open && (
        <div className="user-dropdown">
          <div className="ud-label">{member.name}</div>
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
          <Link href={`/miembros/${member.id}`} className="ud-item" onClick={() => setOpen(false)}>
            <ProfileIcon />
            Ver mi perfil
          </Link>
          <hr className="ud-divider" />
          <button
            className="ud-item"
            style={{ color: "var(--text-3)" }}
            onClick={handleSignOut}
            disabled={signingOut}
          >
            <LogoutIcon />
            {signingOut ? "Cerrando…" : "Cerrar sesión"}
          </button>
        </div>
      )}
    </div>
  );
}
