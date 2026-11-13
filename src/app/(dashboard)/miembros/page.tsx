import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/api/query-client";
import { membersKeys } from "@/lib/api/members";
import { getInvitations, getMembers, getPendingMembers } from "@/lib/api/members.server";
import { getCurrentMember } from "@/lib/auth/guards";
import { MembersTableView } from "@/components/views/MembersTableView";

export const dynamic = "force-dynamic";

export default async function MiembrosPage() {
  const queryClient = getQueryClient();
  const current = await getCurrentMember();
  // Solo coordinación ve "Pendientes"; para el resto esas funciones lanzarían 403.
  const isCoordinacion = current?.role === "COORDINACION";
  await Promise.all([
    queryClient.prefetchQuery({ queryKey: membersKeys.list(), queryFn: getMembers }),
    isCoordinacion ? queryClient.prefetchQuery({ queryKey: membersKeys.pending(), queryFn: getPendingMembers }) : null,
    isCoordinacion
      ? queryClient.prefetchQuery({ queryKey: membersKeys.invitations(), queryFn: getInvitations })
      : null,
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <MembersTableView />
    </HydrationBoundary>
  );
}
