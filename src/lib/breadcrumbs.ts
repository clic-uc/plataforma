"use client";

import { usePathname, useParams } from "next/navigation";
import { useMember } from "@/lib/api/members";
import { useProject, useProjectDoc } from "@/lib/api/projects";

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

  // The pages prefetch these same query keys, so the names are already in the cache on arrival.
  // The hooks run unconditionally and are gated with `enabled` instead.
  const projectId = params.projectId ?? "";
  const docId = params.docId ?? "";
  const memberId = params.memberId ?? "";
  const { data: project } = useProject(projectId, { enabled: !!projectId });
  const { data: doc } = useProjectDoc(projectId, docId, { enabled: !!projectId && !!docId });
  const { data: member } = useMember(memberId, { enabled: !!memberId });

  if (pathname === "/dashboard") return { title: "Dashboard" };
  if (pathname === "/proyectos") return { title: "Gestión de Proyectos" };
  if (pathname === "/tiempo") return { title: "Tiempo & StandUp" };
  if (pathname === "/miembros") return { title: "Miembros" };

  if (params.docId && params.projectId) {
    return {
      title: doc?.title ?? "Documento",
      parent: { title: project?.name ?? "Proyecto", href: `/proyectos/${params.projectId}` },
      grandparent: { title: "Proyectos", href: "/proyectos" },
    };
  }

  if (params.projectId) {
    return {
      title: project?.name ?? "Proyecto",
      parent: { title: "Proyectos", href: "/proyectos" },
    };
  }

  if (params.memberId) {
    return {
      title: member?.name ?? "Miembro",
      parent: { title: "Miembros", href: "/miembros" },
    };
  }

  return { title: "" };
}
