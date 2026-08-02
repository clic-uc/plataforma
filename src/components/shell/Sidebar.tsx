"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  HomeIcon,
  FolderIcon,
  ClockIcon,
  AnalyticsIcon,
  UsersIcon,
  BriefcaseIcon,
  TeamsIcon,
  MeetingIcon,
  BookIcon,
  PostulacionesIcon,
} from "@/components/icons";
import { UserMenu } from "@/components/shell/UserMenu";

interface NavItem {
  label: string;
  href?: string;
  icon: React.ReactNode;
  count?: number;
  matchPrefix?: string;
}

const principal: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: <HomeIcon className="nav-icon" /> },
  { label: "Proyectos", href: "/proyectos", icon: <FolderIcon className="nav-icon" />, count: 4, matchPrefix: "/proyectos" },
  { label: "Reporte", href: "/tiempo", icon: <ClockIcon className="nav-icon" /> },
  { label: "Analíticas", icon: <AnalyticsIcon className="nav-icon" /> },
];

const comunidad: NavItem[] = [
  { label: "Miembros", href: "/miembros", icon: <UsersIcon className="nav-icon" />, count: 18, matchPrefix: "/miembros" },
  { label: "Portafolio", icon: <BriefcaseIcon className="nav-icon" /> },
  { label: "Equipos", icon: <TeamsIcon className="nav-icon" /> },
  { label: "Reuniones", icon: <MeetingIcon className="nav-icon" /> },
];

const org: NavItem[] = [
  { label: "Recursos", icon: <BookIcon className="nav-icon" /> },
  { label: "Postulaciones", icon: <PostulacionesIcon className="nav-icon" />, count: 3 },
];

function NavRow({ item, active }: { item: NavItem; active: boolean }) {
  const content = (
    <>
      {item.icon}
      <span className="nav-lbl">{item.label}</span>
      {item.count !== undefined && <span className="nav-count">{item.count}</span>}
    </>
  );
  if (!item.href) {
    return <div className="nav-item">{content}</div>;
  }
  return (
    <Link href={item.href} className={`nav-item${active ? " active" : ""}`}>
      {content}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();

  const isActive = (item: NavItem) =>
    !!item.matchPrefix && pathname.startsWith(item.matchPrefix);

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-wordmark">
          C<em>L</em>IC
        </div>
        <div className="logo-tagline">PLATAFORMA INTERNA</div>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section">
          <div className="nav-section-label">Principal</div>
          {principal.map((item) => (
            <NavRow key={item.label} item={item} active={isActive(item)} />
          ))}
        </div>

        <div className="nav-section" style={{ marginTop: 14 }}>
          <div className="nav-section-label">Comunidad</div>
          {comunidad.map((item) => (
            <NavRow key={item.label} item={item} active={isActive(item)} />
          ))}
        </div>

        <div className="nav-section" style={{ marginTop: 14 }}>
          <div className="nav-section-label">Org.</div>
          {org.map((item) => (
            <NavRow key={item.label} item={item} active={isActive(item)} />
          ))}
        </div>
      </nav>

      <UserMenu />
    </aside>
  );
}
