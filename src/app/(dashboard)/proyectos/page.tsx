import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/api/query-client";
import { projectsKeys } from "@/lib/api/projects";
import { getProjects } from "@/lib/api/projects.server";
import { ProyectosView } from "@/components/views/ProyectosView";

export const dynamic = "force-dynamic";

export default async function ProyectosPage() {
  const queryClient = getQueryClient();
  await queryClient.prefetchQuery({ queryKey: projectsKeys.list(), queryFn: getProjects });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ProyectosView />
    </HydrationBoundary>
  );
}
