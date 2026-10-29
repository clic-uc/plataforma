import Link from "next/link";
import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/api/query-client";
import { analyticsKeys, type WeekStandups } from "@/lib/api/analytics";
import { getActivityReport, getKanbanReport, getProjectsReport, getTeamReport, getWeekStandups } from "@/lib/api/analytics.server";
import { getCurrentMember } from "@/lib/auth/guards";
import { DEFAULT_RANGE } from "@/lib/analytics";
import { currentWeekStart, shiftWeek } from "@/lib/tiempo";
import { AnalyticsView } from "@/components/views/analytics/AnalyticsView";

export const dynamic = "force-dynamic";

export default async function AnaliticasPage() {
  // El rol se revisa acá y no solo en la capa de datos: prefetchQuery se traga el
  // AuthError de requireCoordinacion(), y la vista mostraría un error crudo.
  const current = await getCurrentMember();
  if (current?.role !== "COORDINACION") return <OnlyCoordination />;

  // La semana la fija el servidor en hora de Chile, como en /tiempo.
  const week = currentWeekStart();
  const previous = shiftWeek(week, -1);

  const queryClient = getQueryClient();
  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: analyticsKeys.activity(week, DEFAULT_RANGE),
      queryFn: () => getActivityReport(DEFAULT_RANGE),
    }),
    queryClient.prefetchQuery({ queryKey: analyticsKeys.standups(week), queryFn: () => getWeekStandups(week) }),
    queryClient.prefetchQuery({ queryKey: analyticsKeys.standups(previous), queryFn: () => getWeekStandups(previous) }),
    queryClient.prefetchQuery({ queryKey: analyticsKeys.projects(), queryFn: getProjectsReport }),
    queryClient.prefetchQuery({ queryKey: analyticsKeys.team(), queryFn: getTeamReport }),
    queryClient.prefetchQuery({
      queryKey: analyticsKeys.kanban(week, DEFAULT_RANGE, null),
      queryFn: () => getKanbanReport(DEFAULT_RANGE, null),
    }),
  ]);

  // Al empezar la semana casi nadie ha enviado el suyo: se abre la anterior, que
  // es la que coordinación quiere leer.
  const thisWeek = queryClient.getQueryData<WeekStandups>(analyticsKeys.standups(week));
  const initialStandupWeek = thisWeek && thisWeek.entries.length > 0 ? week : previous;

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <AnalyticsView currentWeek={week} initialStandupWeek={initialStandupWeek} />
    </HydrationBoundary>
  );
}

function OnlyCoordination() {
  return (
    <div className="mx-auto mt-6 max-w-xl rounded-lg border border-border bg-surface px-6 py-5">
      <h2 className="font-condensed text-xl font-bold text-text-1">Analíticas es solo para coordinación</h2>
      <p className="mt-2 text-sm text-text-2">
        Acá coordinación revisa las horas, los StandUps y el avance del equipo. Tus horas y tu StandUp están en{" "}
        <Link
          href="/tiempo"
          className="rounded-sm text-accent-ink underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Tiempo y StandUp
        </Link>
        .
      </p>
    </div>
  );
}
