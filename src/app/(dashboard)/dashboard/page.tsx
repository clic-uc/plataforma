import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/api/query-client";
import { dashboardKeys } from "@/lib/api/dashboard";
import { getDashboard } from "@/lib/api/dashboard.server";
import { eventsKeys } from "@/lib/api/events";
import { getEvents } from "@/lib/api/events.server";
import { timeEntriesKeys, type TimeEntryFilter } from "@/lib/api/tiempo";
import { getTimeEntries } from "@/lib/api/tiempo.server";
import { visibleRange } from "@/lib/calendar";
import { currentWeekStart, shiftWeek, todayKey } from "@/lib/tiempo";
import { DashboardView } from "@/components/views/DashboardView";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  // Semana, día y minuto los fija el servidor en hora de Chile y el cliente los
  // recibe como props: las claves del cache prefetcheado coinciden y la
  // hidratación escribe lo mismo que el servidor.
  const now = new Date();
  const week = currentWeekStart(now);
  const today = todayKey(now);
  const thisWeek: TimeEntryFilter = { week, projectId: null };
  const lastWeek: TimeEntryFilter = { week: shiftWeek(week, -1), projectId: null };
  const weekRange = visibleRange("semana", week);
  const monthRange = visibleRange("mes", today);

  const queryClient = getQueryClient();
  await Promise.all([
    queryClient.prefetchQuery({ queryKey: dashboardKeys.summary(week), queryFn: () => getDashboard(now) }),
    queryClient.prefetchQuery({ queryKey: timeEntriesKeys.list(thisWeek), queryFn: () => getTimeEntries(thisWeek) }),
    queryClient.prefetchQuery({ queryKey: timeEntriesKeys.list(lastWeek), queryFn: () => getTimeEntries(lastWeek) }),
    queryClient.prefetchQuery({
      queryKey: eventsKeys.range(weekRange.from, weekRange.to),
      queryFn: () => getEvents(weekRange.from, weekRange.to),
    }),
    queryClient.prefetchQuery({
      queryKey: eventsKeys.range(monthRange.from, monthRange.to),
      queryFn: () => getEvents(monthRange.from, monthRange.to),
    }),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <DashboardView week={week} today={today} renderedAt={now.getTime()} />
    </HydrationBoundary>
  );
}
