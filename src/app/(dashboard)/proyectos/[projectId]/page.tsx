import { notFound } from "next/navigation";
import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/api/query-client";
import { projectsKeys } from "@/lib/api/projects";
import { getProject } from "@/lib/api/projects.server";
import { ProjectDetailView } from "@/components/views/ProjectDetailView";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const queryClient = getQueryClient();
  const project = await queryClient.fetchQuery({
    queryKey: projectsKeys.detail(projectId),
    queryFn: () => getProject(projectId),
  });
  if (!project) notFound();

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ProjectDetailView projectId={projectId} />
    </HydrationBoundary>
  );
}
