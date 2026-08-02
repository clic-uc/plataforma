import { notFound } from "next/navigation";
import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/api/query-client";
import { membersKeys } from "@/lib/api/members";
import { getMember } from "@/lib/api/members.server";
import { MemberProfileView } from "@/components/views/MemberProfileView";

export default async function MemberProfilePage({
  params,
}: {
  params: Promise<{ memberId: string }>;
}) {
  const { memberId } = await params;
  const queryClient = getQueryClient();
  const member = await queryClient.fetchQuery({
    queryKey: membersKeys.detail(memberId),
    queryFn: () => getMember(memberId),
  });
  if (!member) notFound();

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <MemberProfileView memberId={memberId} />
    </HydrationBoundary>
  );
}
