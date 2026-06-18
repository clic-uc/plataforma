"use client";

import Link from "next/link";
import { MenuIcon, SettingsIcon, BellIcon } from "@/components/icons";
import { useShell } from "@/components/shell/ShellProvider";
import { useBreadcrumb } from "@/lib/breadcrumbs";

export function Topbar() {
  const { toggleSidebar } = useShell();
  const bc = useBreadcrumb();

  return (
    <div className="topbar">
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button className="sb-toggle-btn" onClick={toggleSidebar} title="Colapsar/expandir sidebar">
          <MenuIcon />
        </button>
        <div className="page-heading">
          <div className="breadcrumb-bar">
            {bc.grandparent && (
              <>
                <Link href={bc.grandparent.href} className="bc-link">
                  {bc.grandparent.title}
                </Link>
                <span className="bc-sep">›</span>
              </>
            )}
            {bc.parent && (
              <>
                <Link href={bc.parent.href} className="bc-link">
                  {bc.parent.title}
                </Link>
                <span className="bc-sep">›</span>
              </>
            )}
            <span className="page-title">{bc.title}</span>
          </div>
        </div>
      </div>
      <div className="topbar-right">
        <button className="icon-btn" title="Configuración">
          <SettingsIcon />
        </button>
        <div className="icon-btn" title="Notificaciones">
          <BellIcon />
        </div>
      </div>
    </div>
  );
}
