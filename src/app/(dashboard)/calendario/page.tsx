import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/api/query-client";
import { eventsKeys } from "@/lib/api/events";
import { getEvents } from "@/lib/api/events.server";
import { CALENDAR_TIME_ZONE, parseCalendarParams, todayInZone, visibleRange } from "@/lib/calendar";
import { CalendarView } from "@/components/views/CalendarView";

export const dynamic = "force-dynamic";

export default async function CalendarioPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string | string[]; fecha?: string | string[] }>;
}) {
  const { vista, fecha } = await searchParams;
  // Sin fecha en la URL se abre en el hoy de Chile; el cliente usa el mismo valor
  // para que la clave del cache prefetcheado coincida.
  const today = todayInZone(CALENDAR_TIME_ZONE);
  const { view, date } = parseCalendarParams(vista, fecha, today);
  const { from, to } = visibleRange(view, date);

  const queryClient = getQueryClient();
  await queryClient.prefetchQuery({ queryKey: eventsKeys.range(from, to), queryFn: () => getEvents(from, to) });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <CalendarView defaultDate={today} />
    </HydrationBoundary>
  );
}
