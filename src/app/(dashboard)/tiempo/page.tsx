import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/api/query-client";
import { projectsKeys } from "@/lib/api/projects";
import { getProjects } from "@/lib/api/projects.server";
import { standupKeys, timeEntriesKeys, type TimeEntryFilter } from "@/lib/api/tiempo";
import { getStandup, getTimeEntries } from "@/lib/api/tiempo.server";
import { currentWeekStart } from "@/lib/tiempo";
import { TiempoView } from "@/components/views/TiempoView";

export const dynamic = "force-dynamic";

export default async function TiempoPage() {
  // La semana la fija el servidor en hora de Chile y el cliente la recibe como
  // prop, para que las claves del cache prefetcheado coincidan.
  const week = currentWeekStart();
  const thisWeek: TimeEntryFilter = { week, projectId: null };
  const history: TimeEntryFilter = { week: null, projectId: null };

  const queryClient = getQueryClient();
  await Promise.all([
    queryClient.prefetchQuery({ queryKey: standupKeys.week(week), queryFn: () => getStandup(week) }),
    queryClient.prefetchQuery({ queryKey: timeEntriesKeys.list(thisWeek), queryFn: () => getTimeEntries(thisWeek) }),
    queryClient.prefetchQuery({ queryKey: timeEntriesKeys.list(history), queryFn: () => getTimeEntries(history) }),
    queryClient.prefetchQuery({ queryKey: projectsKeys.list(), queryFn: getProjects }),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <TiempoView week={week} />
    </HydrationBoundary>
  );
}
