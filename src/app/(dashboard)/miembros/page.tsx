import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/api/query-client";
import { membersKeys } from "@/lib/api/members";
import { getMembers } from "@/lib/api/members.server";
import { MembersTableView } from "@/components/views/MembersTableView";

export const dynamic = "force-dynamic";

export default async function MiembrosPage() {
  const queryClient = getQueryClient();
  await queryClient.prefetchQuery({ queryKey: membersKeys.list(), queryFn: getMembers });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <MembersTableView />
    </HydrationBoundary>
  );
}
