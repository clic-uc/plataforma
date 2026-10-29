"use client";

import Link from "next/link";
import { MenuIcon } from "@/components/icons";
import { useShell } from "@/components/shell/ShellProvider";
import { useBreadcrumb } from "@/lib/breadcrumbs";

export function Topbar() {
  const { toggleSidebar } = useShell();
  const bc = useBreadcrumb();

  return (
    <div className="topbar">
      <div className="topbar-left">
        <button className="sb-toggle-btn" onClick={toggleSidebar} title="Colapsar/expandir sidebar" aria-label="Colapsar o expandir la barra lateral">
          <MenuIcon />
        </button>
        <div className="breadcrumb-bar">
          {bc.grandparent && (
            <>
              <Link href={bc.grandparent.href} className="bc-link">
                {bc.grandparent.title}
              </Link>
              <span className="bc-sep">/</span>
            </>
          )}
          {bc.parent && (
            <>
              <Link href={bc.parent.href} className="bc-link">
                {bc.parent.title}
              </Link>
              <span className="bc-sep">/</span>
            </>
          )}
          <h1 className="page-title">{bc.title}</h1>
        </div>
      </div>
    </div>
  );
}
