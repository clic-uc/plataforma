"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  HomeIcon,
  FolderIcon,
  CalendarIcon,
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
import type { CurrentMember } from "@/lib/auth/current-member";
import { useProjects } from "@/lib/api/projects";
import { useMembers, usePendingMembers } from "@/lib/api/members";

interface NavItem {
  label: string;
  href?: string;
  icon: React.ReactNode;
  count?: number;
  /** Algo espera una acción de quien mira (p. ej. solicitudes por aprobar). */
  alert?: { count: number; title: string };
  matchPrefix?: string;
}

const principal: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: <HomeIcon className="nav-icon" /> },
  { label: "Proyectos", href: "/proyectos", icon: <FolderIcon className="nav-icon" />, matchPrefix: "/proyectos" },
  { label: "Calendario", href: "/calendario", icon: <CalendarIcon className="nav-icon" />, matchPrefix: "/calendario" },
  { label: "Reporte", href: "/tiempo", icon: <ClockIcon className="nav-icon" /> },
];

const comunidad: NavItem[] = [
  { label: "Miembros", href: "/miembros", icon: <UsersIcon className="nav-icon" />, matchPrefix: "/miembros" },
  { label: "Portafolio", icon: <BriefcaseIcon className="nav-icon" /> },
  { label: "Equipos", icon: <TeamsIcon className="nav-icon" /> },
  { label: "Reuniones", icon: <MeetingIcon className="nav-icon" /> },
  { label: "Recursos", icon: <BookIcon className="nav-icon" /> },
];

const coordinacion: NavItem[] = [
  { label: "Analíticas", icon: <AnalyticsIcon className="nav-icon" /> },
  { label: "Postulaciones", icon: <PostulacionesIcon className="nav-icon" />, count: 3 },
];

function NavRow({ item, active }: { item: NavItem; active: boolean }) {
  const content = (
    <>
      {item.icon}
      <span className="nav-lbl">{item.label}</span>
      {item.count !== undefined && <span className="nav-count">{item.count}</span>}
      {!!item.alert?.count && (
        <span className="nav-count nav-count-alert" title={item.alert.title}>{item.alert.count}</span>
      )}
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

export function Sidebar({ member }: { member: CurrentMember }) {
  const pathname = usePathname();
  const { data: projects } = useProjects();
  const activeProjects = projects?.filter((p) => !p.archived).length;
  const { data: members } = useMembers();
  const isCoordinacion = member.role === "COORDINACION";
  const { data: pending } = usePendingMembers({ enabled: isCoordinacion });

  const withCounts = (item: NavItem): NavItem => {
    if (item.href === "/proyectos") return { ...item, count: activeProjects };
    if (item.href === "/miembros") {
      const alert = pending?.length
        ? { count: pending.length, title: `${pending.length} ${pending.length === 1 ? "solicitud" : "solicitudes"} por aprobar` }
        : undefined;
      return { ...item, count: members?.length, alert };
    }
    return item;
  };

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
            <NavRow key={item.label} item={withCounts(item)} active={isActive(item)} />
          ))}
        </div>

        <div className="nav-section" style={{ marginTop: 14 }}>
          <div className="nav-section-label">Comunidad</div>
          {comunidad.map((item) => (
            <NavRow key={item.label} item={withCounts(item)} active={isActive(item)} />
          ))}
        </div>

        {/* Solo presentación: lo que haya detrás lo sigue protegiendo el servidor. */}
        {isCoordinacion && (
          <div className="nav-section" style={{ marginTop: 14 }}>
            <div className="nav-section-label">Coordinación</div>
            {coordinacion.map((item) => (
              <NavRow key={item.label} item={item} active={isActive(item)} />
            ))}
          </div>
        )}
      </nav>

      <UserMenu member={member} />
    </aside>
  );
}
