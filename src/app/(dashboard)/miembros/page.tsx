import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/api/query-client";
import { membersKeys } from "@/lib/api/members";
import { getMembers, getPendingMembers } from "@/lib/api/members.server";
import { getCurrentMember } from "@/lib/auth/guards";
import { MembersTableView } from "@/components/views/MembersTableView";

export const dynamic = "force-dynamic";

export default async function MiembrosPage() {
  const queryClient = getQueryClient();
  const current = await getCurrentMember();
  await Promise.all([
    queryClient.prefetchQuery({ queryKey: membersKeys.list(), queryFn: getMembers }),
    // Solo coordinación ve la cola; para el resto getPendingMembers lanzaría 403.
    current?.role === "COORDINACION"
      ? queryClient.prefetchQuery({ queryKey: membersKeys.pending(), queryFn: getPendingMembers })
      : null,
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <MembersTableView />
    </HydrationBoundary>
  );
}
