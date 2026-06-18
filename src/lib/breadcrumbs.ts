"use client";

import { usePathname, useParams } from "next/navigation";
import { getProject, getDoc } from "../../prisma/seed/data/projects";
import { getMember } from "../../prisma/seed/data/members";

export interface BreadcrumbLink {
  title: string;
  href: string;
}

export interface Breadcrumb {
  title: string;
  parent?: BreadcrumbLink;
  grandparent?: BreadcrumbLink;
}

export function useBreadcrumb(): Breadcrumb {
  const pathname = usePathname();
  const params = useParams<{ projectId?: string; docId?: string; memberId?: string }>();

  if (pathname === "/dashboard") return { title: "Dashboard" };
  if (pathname === "/proyectos") return { title: "Gestión de Proyectos" };
  if (pathname === "/tiempo") return { title: "Tiempo & StandUp" };
  if (pathname === "/miembros") return { title: "Miembros" };

  if (params.docId && params.projectId) {
    const project = getProject(params.projectId);
    const doc = project ? getDoc(project, params.docId) : undefined;
    return {
      title: doc?.title ?? "Documento",
      parent: { title: project?.name ?? "Proyecto", href: `/proyectos/${params.projectId}` },
      grandparent: { title: "Proyectos", href: "/proyectos" },
    };
  }

  if (params.projectId) {
    const project = getProject(params.projectId);
    return {
      title: project?.name ?? "Proyecto",
      parent: { title: "Proyectos", href: "/proyectos" },
    };
  }

  if (params.memberId) {
    const member = getMember(params.memberId);
    return {
      title: member?.name ?? "Miembro",
      parent: { title: "Miembros", href: "/miembros" },
    };
  }

  return { title: "" };
}
