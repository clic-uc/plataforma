import { notFound } from "next/navigation";
import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/api/query-client";
import { projectsKeys } from "@/lib/api/projects";
import { getProject, getProjectDoc } from "@/lib/api/projects.server";
import { DocEditorView } from "@/components/views/DocEditorView";

export default async function DocEditorPage({
  params,
}: {
  params: Promise<{ projectId: string; docId: string }>;
}) {
  const { projectId, docId } = await params;
  const queryClient = getQueryClient();

  const project = await queryClient.fetchQuery({
    queryKey: projectsKeys.detail(projectId),
    queryFn: () => getProject(projectId),
  });
  if (!project) notFound();

  const doc = await queryClient.fetchQuery({
    queryKey: projectsKeys.doc(projectId, docId),
    queryFn: () => getProjectDoc(projectId, docId),
  });
  if (!doc) notFound();

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <DocEditorView key={docId} projectId={projectId} docId={docId} />
    </HydrationBoundary>
  );
}
