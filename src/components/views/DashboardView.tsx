"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { errorMessage } from "@/lib/api/http";
import { formatDateTime } from "@/lib/api/format";
import {
  useDashboard,
  useDismissPendingHours,
  type ActivityItem,
  type DashboardProject,
  type DashboardSummary,
  type PendingHours,
} from "@/lib/api/dashboard";
import { useEvents, type CalendarEventView } from "@/lib/api/events";
import { useCreateTimeEntry, useTimeEntries } from "@/lib/api/tiempo";
import { KANBAN_COLUMN_OPTIONS, eventKindColor } from "@/lib/api/status";
import { instantToZonedTime, visibleRange } from "@/lib/calendar";
import {
  MAX_DESCRIPTION_LENGTH,
  buildWeekChart,
  formatHours,
  formatWeek,
  shiftWeek,
  todayKey,
  weekDays,
  type ChartSeries,
  type WeekChart,
} from "@/lib/tiempo";
import {
  compareWeekHours,
  describeActivity,
  eventsByZonedDay,
  formatRelativeTime,
  formatUpcomingDay,
  type ZonedEventSlot,
} from "@/lib/dashboard";
import { DashboardCalendarCard, EVENT_DOT } from "@/components/views/DashboardCalendarCard";
import { EventDetailModal } from "@/components/views/EventDetailModal";
import { CreateEventModal, EditEventModal } from "@/components/views/EventFormModal";
import { TimeEntryModal } from "@/components/views/TimeEntryModal";
import { HOURS_STEP_ERROR, HoursPicker, parseTimeSpent } from "@/components/ui/HoursPicker";

// ─── Hora actual ───
//
// Lo que depende de la hora se calcula en hora de Chile, así que el servidor puede
// escribirlo: durante la hidratación se usa el minuto en que renderizó el
// servidor, y después el del navegador. `clientMinute` es null hasta hidratar, para
// lo que sí depende de la zona del navegador (el calendario del mes).

function subscribeToClock(onChange: () => void) {
  const id = setInterval(onChange, 30_000);
  return () => clearInterval(id);
}

function useClientMinute(): number | null {
  return useSyncExternalStore(
    subscribeToClock,
    () => Math.floor(Date.now() / 60_000),
    () => null,
  );
}

const panel = "rounded-lg border border-border bg-surface";
const panelTitle = "text-sm font-semibold text-text-2";
const textLink = "text-sm font-medium text-accent hover:underline";

type EventModal =
  | { mode: "detail"; event: CalendarEventView }
  | { mode: "edit"; event: CalendarEventView }
  | { mode: "create"; day: string };

/** `week` y `today` son los de Chile según el servidor; `renderedAt`, el instante en que renderizó. */
export function DashboardView({ week, today: serverToday, renderedAt }: { week: string; today: string; renderedAt: number }) {
  const clientMinute = useClientMinute();
  const now = new Date((clientMinute ?? Math.floor(renderedAt / 60_000)) * 60_000);
  const today = clientMinute === null ? serverToday : todayKey(now);

  const { data: summary, error, refetch } = useDashboard(week);
  const [eventModal, setEventModal] = useState<EventModal | null>(null);
  const [loggingHours, setLoggingHours] = useState(false);

  const openEvent = (event: CalendarEventView) => setEventModal({ mode: "detail", event });

  return (
    <section className="mx-auto flex max-w-[1240px] flex-col gap-4">
      {error && (
        <div className="inline-error" role="alert">
          <span>{errorMessage(error, "No se pudo cargar el Dashboard.")}</span>
          <button type="button" onClick={() => refetch()}>Reintentar</button>
        </div>
      )}

      <WeekPanel
        week={week}
        today={today}
        now={now}
        summary={summary}
        onLogHours={() => setLoggingHours(true)}
        onOpenEvent={openEvent}
      />

      <div className="grid grid-cols-1 items-start gap-4 min-[1100px]:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          {summary && summary.pendingHours.length > 0 && <PendingHoursPanel items={summary.pendingHours} />}
          {summary && <ProjectsPanel projects={summary.projects} />}
          {summary && <ActivityPanel items={summary.activity} now={now} />}
        </div>
        <DashboardCalendarCard
          today={serverToday}
          clientMinute={clientMinute}
          onOpenEvent={openEvent}
          onCreateEvent={(day) => setEventModal({ mode: "create", day })}
        />
      </div>

      {eventModal?.mode === "detail" && (
        <EventDetailModal
          event={eventModal.event}
          onEdit={() => setEventModal({ mode: "edit", event: eventModal.event })}
          onClose={() => setEventModal(null)}
        />
      )}
      {eventModal?.mode === "edit" && <EditEventModal event={eventModal.event} onClose={() => setEventModal(null)} />}
      {eventModal?.mode === "create" && (
        <CreateEventModal day={eventModal.day} minutes={9 * 60} onClose={() => setEventModal(null)} />
      )}
      {loggingHours && <TimeEntryModal onClose={() => setLoggingHours(false)} />}
    </section>
  );
}

// ─── Tu semana ───

function seriesColor(series: ChartSeries | undefined): string {
  return !series || series.slot === null ? "var(--series-other)" : `var(--series-${series.slot})`;
}

function WeekPanel({
  week,
  today,
  now,
  summary,
  onLogHours,
  onOpenEvent,
}: {
  week: string;
  today: string;
  now: Date;
  summary: DashboardSummary | undefined;
  onLogHours: () => void;
  onOpenEvent: (event: CalendarEventView) => void;
}) {
  const { data: entries = [] } = useTimeEntries({ week, projectId: null });
  const { data: lastWeekEntries = [] } = useTimeEntries({ week: shiftWeek(week, -1), projectId: null });
  const range = visibleRange("semana", week);
  const { data: events = [] } = useEvents(range.from, range.to);

  const days = weekDays(week);
  const chart = buildWeekChart(entries, week);
  const hours = compareWeekHours(entries, lastWeekEntries, today);
  const eventsByDay = eventsByZonedDay(events, days);
  const sentStandup = summary?.streak.sentThisWeek;

  return (
    <section className={panel} aria-labelledby="tu-semana">
      <header className="flex flex-wrap items-center justify-between gap-3 px-5 pb-3 pt-4">
        <div className="flex items-baseline gap-2">
          <h2 id="tu-semana" className={panelTitle}>Tu semana</h2>
          <span className="text-sm tabular-nums text-text-3">{formatWeek(week)}</span>
        </div>
        <div className="flex items-center gap-2">
          {sentStandup === true && <Badge color="green">StandUp enviado</Badge>}
          <button type="button" className="btn-ghost btn-sm" onClick={onLogHours}>Registrar horas</button>
          {sentStandup === false && (
            <Link href="/tiempo" className="btn-primary btn-sm">Enviar StandUp</Link>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 border-t border-border min-[900px]:grid-cols-[230px_minmax(0,1fr)]">
        <HoursSummary chart={chart} delta={hours.delta} lastWeekSoFar={hours.lastWeekSoFar} />
        <ol className="grid grid-cols-7 border-t border-border min-[900px]:border-l min-[900px]:border-t-0" aria-label="Días de la semana">
          {chart.days.map((day) => (
            <WeekDay
              key={day.dayKey}
              day={day}
              chart={chart}
              slots={eventsByDay.get(day.dayKey) ?? []}
              isToday={day.dayKey === today}
              isPast={day.dayKey < today}
              onOpenEvent={onOpenEvent}
            />
          ))}
        </ol>
      </div>

      {summary && <WeekFigures summary={summary} today={today} now={now} />}
    </section>
  );
}

function HoursSummary({ chart, delta, lastWeekSoFar }: { chart: WeekChart; delta: number; lastWeekSoFar: number }) {
  let comparison: React.ReactNode;
  if (chart.totalMinutes === 0 && lastWeekSoFar === 0) comparison = "Aún no registras horas esta semana.";
  else if (delta > 0) comparison = <><span className="font-semibold text-ok">↑ {formatHours(delta)}</span> más que la semana pasada a esta altura</>;
  else if (delta < 0) comparison = <><span className="font-semibold text-text-2">↓ {formatHours(-delta)}</span> menos que la semana pasada a esta altura</>;
  else comparison = "Igual que la semana pasada a esta altura";

  return (
    <div className="flex flex-col gap-1 px-5 py-4">
      <div className="text-sm font-medium text-text-2">Horas registradas</div>
      <div className="font-condensed text-3xl font-bold tabular-nums text-text-1">{formatHours(chart.totalMinutes)}</div>
      <p className="text-xs text-text-3">{comparison}</p>
      {chart.series.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {chart.series.map((s) => (
            <li key={s.key} className="flex items-center gap-2 text-xs">
              <span className="size-2 shrink-0 rounded-[2px]" style={{ background: seriesColor(s) }} aria-hidden />
              <span className="min-w-0 flex-1 truncate text-text-2">{s.name}</span>
              <span className="tabular-nums text-text-1">{formatHours(s.minutes)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Alto del área de barras, en px; la barra más alta de la semana llega al tope del eje. */
const BAR_AREA_PX = 56;
const MAX_DAY_EVENTS = 3;

function WeekDay({
  day,
  chart,
  slots,
  isToday,
  isPast,
  onOpenEvent,
}: {
  day: WeekChart["days"][number];
  chart: WeekChart;
  slots: ZonedEventSlot<CalendarEventView>[];
  isToday: boolean;
  isPast: boolean;
  onOpenEvent: (event: CalendarEventView) => void;
}) {
  const seriesByKey = new Map(chart.series.map((s) => [s.key, s]));
  const barPx = (day.totalMinutes / 60 / chart.axisMaxHours) * BAR_AREA_PX;
  const shown = slots.length > MAX_DAY_EVENTS ? slots.slice(0, MAX_DAY_EVENTS - 1) : slots;
  const hidden = slots.length - shown.length;

  return (
    <li
      className={`flex min-w-0 flex-col gap-2 border-l border-border px-2 pb-3 pt-3 first:border-l-0 ${isToday ? "bg-accent-dim" : ""}`}
      aria-current={isToday ? "date" : undefined}
    >
      <div className="flex items-baseline justify-between gap-1 px-1">
        <span className={`text-xs tabular-nums ${isToday ? "font-semibold text-accent-ink" : isPast ? "text-text-3" : "text-text-2"}`}>
          {day.label}
        </span>
        {isToday && <span className="text-2xs font-semibold text-accent-ink">Hoy</span>}
      </div>

      <div
        className="flex items-end gap-1.5 border-b border-border px-1"
        style={{ height: BAR_AREA_PX }}
        title={day.totalMinutes > 0 ? `${day.label}: ${formatHours(day.totalMinutes)}` : undefined}
      >
        {day.totalMinutes > 0 && (
          <>
            <div className="flex w-3.5 flex-col-reverse overflow-hidden rounded-t-[3px]" style={{ height: barPx }} aria-hidden>
              {day.segments.map((s) => (
                <div key={s.key} style={{ flexGrow: s.minutes, background: seriesColor(seriesByKey.get(s.key)) }} />
              ))}
            </div>
            <span className="pb-0.5 text-xs font-semibold tabular-nums text-text-1">{formatHours(day.totalMinutes)}</span>
          </>
        )}
      </div>

      {slots.length > 0 && (
        <ul className="flex flex-col">
          {shown.map(({ event, time }) => (
            <li key={event.id}>
              <button
                type="button"
                onClick={() => onOpenEvent(event)}
                className="flex w-full items-baseline gap-1.5 rounded-sm px-1 py-0.5 text-left text-xs transition-colors duration-100 hover:bg-surface-2"
                title={event.title}
              >
                <span className={`size-1.5 shrink-0 -translate-y-px rounded-full ${EVENT_DOT[eventKindColor[event.kind]]}`} aria-hidden />
                {time && <span className="shrink-0 tabular-nums text-text-3">{time}</span>}
                <span className="truncate text-text-1">{event.title}</span>
              </button>
            </li>
          ))}
          {hidden > 0 && (
            <li>
              <Link
                href={`/calendario?${new URLSearchParams({ vista: "semana", fecha: day.dayKey })}`}
                className="px-1 text-xs text-text-3 hover:text-accent"
              >
                {hidden} más
              </Link>
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

function Figure({ label, value, unit, children }: { label: string; value: string; unit?: string; children: React.ReactNode }) {
  return (
    <div className="flex h-full min-w-0 flex-col gap-1 px-5 py-4">
      <div className="text-sm font-medium text-text-2">{label}</div>
      <div className="font-condensed text-2xl font-bold tabular-nums text-text-1">
        {value}
        {unit && <span className="ml-1 font-sans text-sm font-medium text-text-2">{unit}</span>}
      </div>
      <div className="text-xs text-text-3">{children}</div>
    </div>
  );
}

function WeekFigures({ summary, today, now }: { summary: DashboardSummary; today: string; now: Date }) {
  const { tasks, issues, streak, nextMeeting } = summary;
  const meetingInProgress = nextMeeting ? Date.parse(nextMeeting.startsAt) <= now.getTime() : false;

  // Las líneas entre cifras son el fondo asomando por el gap: funcionan igual en 1, 2 o 4 columnas.
  return (
    <div className="grid grid-cols-1 gap-px overflow-hidden rounded-b-lg border-t border-border bg-border sm:grid-cols-2 lg:grid-cols-4 [&>*]:bg-surface">
      <Figure label="Tareas abiertas" value={String(tasks.open)}>
        {tasks.open === 0
          ? "No tienes tareas asignadas sin terminar."
          : tasks.inReview > 0
            ? `${tasks.inReview} en revisión`
            : "Ninguna en revisión"}
      </Figure>

      <Figure label="Racha de StandUp" value={String(streak.weeks)} unit={streak.weeks === 1 ? "semana" : "semanas"}>
        {streak.sentThisWeek
          ? "Ya enviaste el StandUp de esta semana."
          : streak.weeks > 0
            ? "Envía tu StandUp antes del domingo para no cortarla."
            : "Envía tu StandUp de esta semana para empezarla."}
      </Figure>

      <Figure label="Issues sin revisar" value={String(issues.unreviewed)}>
        {issues.open === 0
          ? "No hay issues abiertos en tus proyectos."
          : issues.unreviewed === 0
            ? `Revisaste ${issues.open === 1 ? "el abierto" : `los ${issues.open} abiertos`} de tus proyectos.`
            : `De ${issues.open} ${issues.open === 1 ? "abierto" : "abiertos"} en tus proyectos.`}
      </Figure>

      {nextMeeting ? (
        <Link
          href={`/calendario?${new URLSearchParams({ vista: "semana", fecha: nextMeeting.day })}`}
          className="group min-w-0 transition-colors duration-100 hover:bg-surface-2"
        >
          <Figure label="Próxima reunión" value={meetingInProgress ? "Ahora" : formatUpcomingDay(nextMeeting.day, today)}>
            <span className="block truncate">
              {!nextMeeting.allDay && <span className="tabular-nums text-text-2">{nextMeeting.time} · </span>}
              <span className="text-text-2 group-hover:text-accent">{nextMeeting.title}</span>
              {nextMeeting.project && ` · ${nextMeeting.project.name}`}
            </span>
          </Figure>
        </Link>
      ) : (
        <Figure label="Próxima reunión" value="—">
          No hay reuniones agendadas. <Link href="/calendario" className="text-accent hover:underline">Ir al calendario</Link>
        </Figure>
      )}
    </div>
  );
}

// ─── Horas por registrar ───

/** Filas visibles antes de "Ver todas": la lista puede juntar un mes de períodos. */
const PENDING_HOURS_VISIBLE = 5;

const pendingKindColumn: Record<PendingHours["kind"], string> = {
  TRABAJO: "En progreso",
  REVISION: "En revisión",
};

/** "27 oct", "24 – 27 oct", "28 sept – 2 oct": días en Chile, iguales en el servidor y el navegador. */
function formatDayRange(first: string, last: string): string {
  const parts = (dayKey: string) => {
    const date = new Date(`${dayKey}T12:00:00Z`);
    const month = new Intl.DateTimeFormat("es-CL", { month: "short", timeZone: "UTC" }).format(date).replace(".", "");
    return { day: date.getUTCDate(), month };
  };
  const a = parts(first);
  const b = parts(last);
  if (first === last) return `${b.day} ${b.month}`;
  if (a.month === b.month && first.slice(0, 4) === last.slice(0, 4)) return `${a.day} – ${b.day} ${b.month}`;
  return `${a.day} ${a.month} – ${b.day} ${b.month}`;
}

function PendingHoursRow({ item }: { item: PendingHours }) {
  const [hours, setHours] = useState("");
  const create = useCreateTimeEntry();
  const dismiss = useDismissPendingHours();
  const { minutes, invalid } = parseTimeSpent(hours);
  const busy = create.isPending || dismiss.isPending;
  const error = create.error ?? dismiss.error;
  const period = formatDayRange(instantToZonedTime(new Date(item.from)).date, item.suggestedDate);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!minutes || busy) return;
    create.mutate({
      date: item.suggestedDate,
      projectId: item.project.id,
      minutes,
      // Igual que las horas registradas al mover la tarea.
      description: `${item.label} · ${item.name}`.slice(0, MAX_DESCRIPTION_LENGTH),
      taskId: item.taskId,
      kind: item.kind,
    });
  }

  return (
    <li className="border-t border-border py-3 first:border-t-0">
      <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="min-w-0 flex-[1_1_220px]">
          <div className="flex min-w-0 items-baseline gap-1.5">
            <span className="shrink-0 font-mono text-2xs text-text-3">{item.label}</span>
            <Link
              href={`/proyectos/${item.project.id}`}
              className="truncate text-sm font-medium text-text-1 hover:text-accent"
              title={item.name}
            >
              {item.name}
            </Link>
          </div>
          <div className="truncate text-xs text-text-3">
            {item.project.name} · {pendingKindColumn[item.kind]}{" "}
            <time dateTime={item.from} title={`${formatDateTime(new Date(item.from))} – ${formatDateTime(new Date(item.to))}`} className="tabular-nums">
              {period}
            </time>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div role="group" aria-label={`Horas para ${item.label}`}>
            <HoursPicker size="sm" hours={hours} onChange={setHours} showError={false} disabled={busy} />
          </div>
          <div className="flex items-center gap-3">
            {/* Ghost hasta que hay horas elegidas: con varias filas, solo resalta la que está lista. */}
            <button type="submit" className={`${minutes ? "btn-primary" : "btn-ghost"} btn-sm`} disabled={!minutes || busy}>
              {create.isPending ? "Registrando…" : "Registrar"}
            </button>
            <button
              type="button"
              className="text-xs text-text-3 transition-colors duration-100 hover:text-text-1 hover:underline disabled:opacity-55"
              onClick={() => dismiss.mutate(item.transitionId)}
              disabled={busy}
              title="Quitarla de la lista sin registrar horas"
            >
              {dismiss.isPending ? "Descartando…" : "Descartar"}
            </button>
          </div>
        </div>
      </form>
      {invalid && <p className="mt-1.5 text-xs text-danger">{HOURS_STEP_ERROR}</p>}
      {error && !busy && (
        <p className="mt-1.5 text-xs text-danger" role="alert">{errorMessage(error, "No se pudo guardar. Intenta de nuevo.")}</p>
      )}
    </li>
  );
}

/**
 * Períodos en que tuve una tarea en En progreso o En revisión sin registrar sus horas
 * (ver PendingHours). Solo aparece si hay alguno; muestra los primeros y el resto a pedido.
 */
function PendingHoursPanel({ items }: { items: PendingHours[] }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? items : items.slice(0, PENDING_HOURS_VISIBLE);

  return (
    <section className={panel} aria-labelledby="horas-por-registrar">
      <header className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-5 pb-2 pt-4">
        <h2 id="horas-por-registrar" className={panelTitle}>
          Horas por registrar <span className="font-medium tabular-nums text-text-3">{items.length}</span>
        </h2>
        <span className="text-xs text-text-3">tareas que tuviste en progreso o en revisión; quedan en el día en que las dejaste</span>
      </header>

      <ul className="px-5 pb-1">
        {shown.map((item) => (
          <PendingHoursRow key={item.transitionId} item={item} />
        ))}
      </ul>

      {items.length > PENDING_HOURS_VISIBLE && (
        <div className="border-t border-border px-5 py-2.5">
          <button type="button" className={textLink} aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Ver menos" : `Ver las ${items.length}`}
          </button>
        </div>
      )}
    </section>
  );
}

// ─── Mis proyectos ───

const columnLabel = new Map(KANBAN_COLUMN_OPTIONS.map((o) => [o.value, o.label]));

/** "2 issues abiertos · ● 1 sin revisar", hacia la pestaña Issues del proyecto. */
function ProjectIssues({ projectId, issues }: { projectId: string; issues: DashboardProject["issues"] }) {
  if (issues.open === 0) return <span>Sin issues abiertos</span>;

  return (
    <Link href={`/proyectos/${projectId}?tab=issues`} className="group tabular-nums hover:text-accent">
      {issues.open} {issues.open === 1 ? "issue abierto" : "issues abiertos"}
      {issues.unreviewed > 0 && (
        <>
          {" · "}
          <span className="font-semibold text-accent-ink group-hover:text-accent">
            <span className="mr-1 inline-block size-1.5 -translate-y-px rounded-full bg-accent align-middle" aria-hidden />
            {issues.unreviewed} sin revisar
          </span>
        </>
      )}
    </Link>
  );
}

function ProjectsPanel({ projects }: { projects: DashboardProject[] }) {
  return (
    <section className={panel} aria-labelledby="mis-proyectos">
      <header className="flex items-baseline justify-between gap-3 px-5 pb-2 pt-4">
        <h2 id="mis-proyectos" className={panelTitle}>
          Mis proyectos {projects.length > 0 && <span className="font-medium tabular-nums text-text-3">{projects.length}</span>}
        </h2>
        <Link href="/proyectos" className={textLink}>Ver todos los proyectos</Link>
      </header>

      {projects.length === 0 ? (
        <p className="px-5 pb-5 pt-1 text-sm text-text-3">
          No estás en el equipo de ningún proyecto. Coordinación arma los equipos desde cada proyecto.
        </p>
      ) : (
        <ul className="px-5 pb-2">
          {projects.map((project) => (
            <li key={project.id} className="border-t border-border py-3.5 first:border-t-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/proyectos/${project.id}`}
                    className="font-condensed text-xl font-bold leading-tight text-text-1 underline decoration-transparent underline-offset-4 transition-colors duration-100 hover:text-accent hover:decoration-current"
                  >
                    {project.name}
                  </Link>
                  <div className="mt-0.5 text-xs text-text-3">
                    <ProjectIssues projectId={project.id} issues={project.issues} />
                  </div>
                </div>
                <Badge color={project.statusColor} style={{ flexShrink: 0 }}>{project.status}</Badge>
              </div>

              {project.tasks.length > 0 ? (
                <ul className="mt-2.5 flex flex-wrap gap-1.5" aria-label="Mis tareas abiertas">
                  {project.tasks.map((task) => (
                    <li key={task.label} className="min-w-0 max-w-full">
                      <Link
                        href={`/proyectos/${project.id}`}
                        className="flex min-w-0 items-baseline gap-1.5 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs transition-colors duration-100 hover:border-border-dash hover:bg-surface"
                      >
                        <span className="font-mono text-2xs text-text-3">{task.label}</span>
                        <span className="truncate text-text-1">{task.name}</span>
                        {task.column !== "PENDIENTE" && (
                          <span className="shrink-0 text-text-3">· {columnLabel.get(task.column)}</span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1.5 text-xs text-text-3">No tienes tareas abiertas en este proyecto.</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ─── Actividad reciente ───

function ActivitySentence({ item }: { item: ActivityItem }) {
  return (
    <>
      {describeActivity(item).map((segment, i) =>
        "strong" in segment ? (
          <strong key={i} className="font-semibold">{segment.strong}</strong>
        ) : "ref" in segment ? (
          <span key={i} className="font-mono text-xs text-text-2">{segment.ref}</span>
        ) : (
          <span key={i}>{segment.text}</span>
        ),
      )}
    </>
  );
}

function ActivityPanel({ items, now }: { items: ActivityItem[]; now: Date }) {
  return (
    <section className={panel} aria-labelledby="actividad">
      <header className="flex items-baseline gap-2 px-5 pb-2 pt-4">
        <h2 id="actividad" className={panelTitle}>Actividad reciente</h2>
        <span className="text-xs text-text-3">en tus proyectos, últimas dos semanas</span>
      </header>

      {items.length === 0 ? (
        <p className="px-5 pb-5 pt-1 text-sm text-text-3">
          Sin movimiento en tus proyectos en las últimas dos semanas.
        </p>
      ) : (
        <ol className="px-5 pb-2">
          {items.map((item) => (
            <li key={item.id} className="flex items-baseline gap-3 border-t border-border py-2 first:border-t-0">
              <time
                dateTime={item.at}
                className="w-[68px] shrink-0 text-xs tabular-nums text-text-3"
                title={formatDateTime(new Date(item.at))}
              >
                {formatRelativeTime(item.at, now)}
              </time>
              <p className="min-w-0 flex-1 text-sm text-text-1">
                {item.href ? (
                  <Link href={item.href} className="hover:underline hover:decoration-text-3">
                    <ActivitySentence item={item} />
                  </Link>
                ) : (
                  <ActivitySentence item={item} />
                )}
                {item.project && <span className="text-text-3"> · {item.project.name}</span>}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
