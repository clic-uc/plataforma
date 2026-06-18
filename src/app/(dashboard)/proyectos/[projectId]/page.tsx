import { notFound } from "next/navigation";
import { getProject } from "../../../../../prisma/seed/data/projects";
import { ProjectDetailView } from "@/components/views/ProjectDetailView";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = getProject(projectId);
  if (!project) notFound();
  return <ProjectDetailView project={project} />;
}
