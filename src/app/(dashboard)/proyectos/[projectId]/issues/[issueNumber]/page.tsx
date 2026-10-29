import { notFound } from "next/navigation";
import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/api/query-client";
import { projectsKeys } from "@/lib/api/projects";
import { getProject } from "@/lib/api/projects.server";
import { getIssue, parseIssueNumber } from "@/lib/api/issues.server";
import { IssueView } from "@/components/views/IssueView";

export default async function IssuePage({
  params,
}: {
  params: Promise<{ projectId: string; issueNumber: string }>;
}) {
  const { projectId, issueNumber } = await params;
  const number = parseIssueNumber(issueNumber);
  if (!number) notFound();

  const queryClient = getQueryClient();

  const project = await queryClient.fetchQuery({
    queryKey: projectsKeys.detail(projectId),
    queryFn: () => getProject(projectId),
  });
  if (!project) notFound();

  const issue = await queryClient.fetchQuery({
    queryKey: projectsKeys.issue(projectId, number),
    queryFn: () => getIssue(projectId, number),
  });
  if (!issue) notFound();

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <IssueView key={number} projectId={projectId} number={number} />
    </HydrationBoundary>
  );
}
