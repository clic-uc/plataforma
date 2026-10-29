"use client";

import { useState } from "react";
import Link from "next/link";
import { useEvents, type CalendarEventView } from "@/lib/api/events";
import { eventKindColor, type EventColor } from "@/lib/api/status";
import {
  WEEKDAY_SHORT,
  addMonths,
  eventDaySpan,
  eventsByDay,
  formatTime,
  monthGrid,
  monthTitle,
  parseDayKey,
  toDayKey,
} from "@/lib/calendar";
import { formatShortDay } from "@/lib/dashboard";

/** Punto de color por tipo de evento; la misma paleta que las clases .cal-ev-* del calendario. */
export const EVENT_DOT: Record<EventColor, string> = {
  accent: "bg-accent",
  green: "bg-ok",
  amber: "bg-[var(--badge-amber-fg)]",
  gray: "bg-text-3",
};

const MAX_DOTS = 3;
const MAX_LIST = 6;

function calendarHref(view: "mes" | "semana", day: string): string {
  return `/calendario?${new URLSearchParams({ vista: view, fecha: day })}`;
}

/**
 * Mes en miniatura con los eventos que quedan. Igual que /calendario, ubica los
 * eventos con la hora del navegador, así que los pinta recién después de hidratar
 * (`clientMinute` es null hasta entonces).
 */
export function DashboardCalendarCard({
  today,
  clientMinute,
  onOpenEvent,
  onCreateEvent,
}: {
  /** Hoy en Chile según el servidor: el mes que se abre. */
  today: string;
  clientMinute: number | null;
  onOpenEvent: (event: CalendarEventView) => void;
  onCreateEvent: (day: string) => void;
}) {
  const [anchor, setAnchor] = useState(today);
  const anchorDate = parseDayKey(anchor);
  const grid = monthGrid(anchorDate);
  const { data: events = [], isFetching } = useEvents(grid.from, grid.to);

  const now = clientMinute === null ? null : new Date(clientMinute * 60_000);
  const localToday = now ? toDayKey(now) : null;
  const shown = now ? events : [];
  const byDay = eventsByDay(shown, grid.days);

  const monthStart = toDayKey(new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1));
  const nextMonthStart = toDayKey(new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 1));
  const isCurrentMonth = !!localToday && localToday >= monthStart && localToday < nextMonthStart;
  const monthName = monthTitle(anchorDate).split(" ")[0].toLowerCase();

  const inMonth = shown.filter((e) => {
    const { first, last } = eventDaySpan(e);
    return last >= monthStart && first < nextMonthStart;
  });
  // En el mes en curso, solo lo que no terminó.
  const list = now && isCurrentMonth ? inMonth.filter((e) => Date.parse(e.endsAt) > now.getTime()) : inMonth;
  const listShown = list.slice(0, MAX_LIST);

  return (
    <section className="rounded-lg border border-border bg-surface" aria-labelledby="calendario-dash">
      <header className="flex items-center justify-between gap-2 px-5 pb-2 pt-4">
        <h2 id="calendario-dash" className="text-sm font-semibold text-text-2">Calendario</h2>
        <Link href={calendarHref("mes", anchor)} className="text-sm font-medium text-accent hover:underline">
          Ver calendario
        </Link>
      </header>

      <div className="px-4">
        <div className="mb-1 flex items-center justify-between">
          <button
            type="button"
            className="grid size-7 place-items-center rounded-md text-lg leading-none text-text-2 transition-colors duration-100 hover:bg-surface-2"
            onClick={() => setAnchor(toDayKey(addMonths(anchorDate, -1)))}
            aria-label="Mes anterior"
          >
            ‹
          </button>
          <div className="font-condensed text-lg font-bold text-text-1">
            {monthTitle(anchorDate)}
            {isFetching && <span className="sr-only"> (cargando)</span>}
          </div>
          <button
            type="button"
            className="grid size-7 place-items-center rounded-md text-lg leading-none text-text-2 transition-colors duration-100 hover:bg-surface-2"
            onClick={() => setAnchor(toDayKey(addMonths(anchorDate, 1)))}
            aria-label="Mes siguiente"
          >
            ›
          </button>
        </div>

        <div className="grid grid-cols-7 text-center" aria-hidden>
          {WEEKDAY_SHORT.map((d) => (
            <div key={d} className="py-1 text-2xs text-text-3">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {grid.days.map((day) => {
            const key = toDayKey(day);
            const dayEvents = byDay.get(key) ?? [];
            const otherMonth = day.getMonth() !== anchorDate.getMonth();
            const isToday = key === localToday;
            return (
              <Link
                key={key}
                href={calendarHref("semana", key)}
                className="flex h-10 flex-col items-center justify-start gap-0.5 rounded-md pt-1 transition-colors duration-100 hover:bg-surface-2"
                aria-label={`${day.getDate()} ${monthTitle(day)}${dayEvents.length ? `, ${dayEvents.length} ${dayEvents.length === 1 ? "evento" : "eventos"}` : ""}`}
              >
                <span
                  className={`grid size-6 place-items-center rounded-full text-sm tabular-nums ${
                    isToday ? "bg-accent font-semibold text-white" : otherMonth ? "text-text-3" : "text-text-1"
                  }`}
                >
                  {day.getDate()}
                </span>
                <span className="flex h-1.5 gap-0.5" aria-hidden>
                  {dayEvents.slice(0, MAX_DOTS).map((e) => (
                    <span key={e.id} className={`size-1.5 rounded-full ${EVENT_DOT[eventKindColor[e.kind]]}`} />
                  ))}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="mt-2 border-t border-border px-5 pb-4 pt-3">
        <h3 className="mb-1.5 text-xs font-semibold text-text-2">
          {isCurrentMonth ? `Lo que queda de ${monthName}` : `Eventos de ${monthName}`}
        </h3>
        {now === null ? (
          <div className="h-6" />
        ) : list.length === 0 ? (
          <p className="text-sm text-text-3">
            {isCurrentMonth && inMonth.length > 0 ? "No quedan eventos este mes." : `Sin eventos en ${monthName}.`}{" "}
            <button
              type="button"
              className="font-medium text-accent hover:underline"
              onClick={() => onCreateEvent(isCurrentMonth && localToday ? localToday : monthStart)}
            >
              Nuevo evento
            </button>
          </p>
        ) : (
          <ul className="-mx-2 flex flex-col">
            {listShown.map((event) => {
              const day = eventDaySpan(event).first;
              return (
                <li key={event.id}>
                  <button
                    type="button"
                    onClick={() => onOpenEvent(event)}
                    className="flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left transition-colors duration-100 hover:bg-surface-2"
                  >
                    <span className={`size-2 shrink-0 -translate-y-px rounded-full ${EVENT_DOT[eventKindColor[event.kind]]}`} aria-hidden />
                    <span className="w-12 shrink-0 text-xs tabular-nums text-text-2">{day === localToday ? "Hoy" : formatShortDay(day)}</span>
                    <span className="w-10 shrink-0 text-xs tabular-nums text-text-3">
                      {event.allDay ? "Día" : formatTime(new Date(event.startsAt))}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-text-1">{event.title}</span>
                  </button>
                </li>
              );
            })}
            {list.length > MAX_LIST && (
              <li className="px-2 pt-1">
                <Link href={calendarHref("mes", anchor)} className="text-xs text-text-3 hover:text-accent">
                  {list.length - MAX_LIST} más en el calendario
                </Link>
              </li>
            )}
          </ul>
        )}
      </div>
    </section>
  );
}
