"use client";

import { useEffect, useRef } from "react";
import type { CalendarEventView } from "@/lib/api/events";
import { eventKindColor } from "@/lib/api/status";
import {
  WEEKDAY_SHORT,
  eventsByDay,
  formatTime,
  isAllDayRow,
  layoutDayColumn,
  minutesInDay,
  parseDayKey,
  toDayKey,
  weekRange,
} from "@/lib/calendar";

const HOUR_PX = 44;
const SLOT_MINUTES = 30;
const INITIAL_SCROLL_HOUR = 8;
/** Alto mínimo de un evento corto, en minutos; también se usa para calcular los solapes. */
const MIN_EVENT_MINUTES = 25;
const HOURS = Array.from({ length: 24 }, (_, h) => h);

const minutesToPx = (minutes: number) => (minutes / 60) * HOUR_PX;

export function CalendarWeek({
  date,
  events,
  today,
  nowMinutes,
  onSelectEvent,
  onCreateAt,
}: {
  /** Cualquier día de la semana visible, "YYYY-MM-DD". */
  date: string;
  events: CalendarEventView[];
  /** null hasta montar en el navegador. */
  today: string | null;
  /** Minuto del día actual, para la línea de hora. */
  nowMinutes: number | null;
  onSelectEvent: (event: CalendarEventView) => void;
  /** Sin minutos: crear un evento de día completo. */
  onCreateAt: (day: string, minutes?: number) => void;
}) {
  const { days } = weekRange(parseDayKey(date));
  const byDay = eventsByDay(events, days);
  const scrollRef = useRef<HTMLDivElement>(null);

  // La grilla cubre las 24 h, pero abre mostrando desde las 08:00.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = INITIAL_SCROLL_HOUR * HOUR_PX;
  }, []);

  function handleColumnClick(day: string, e: React.MouseEvent<HTMLDivElement>) {
    const offset = e.clientY - e.currentTarget.getBoundingClientRect().top;
    const minutes = Math.floor((offset / HOUR_PX) * (60 / SLOT_MINUTES)) * SLOT_MINUTES;
    onCreateAt(day, Math.min(Math.max(minutes, 0), 24 * 60 - SLOT_MINUTES));
  }

  return (
    <div className="cal-week" ref={scrollRef}>
      <div className="cal-week-inner">
        <div className="cal-week-sticky">
          <div className="cal-week-row cal-week-head">
            <div />
            {days.map((day, i) => {
              const key = toDayKey(day);
              return (
                <div key={key} className={`cal-week-dayhead${key === today ? " today" : ""}`}>
                  <span>{WEEKDAY_SHORT[i]}</span>
                  <span className="cal-week-daynum">{day.getDate()}</span>
                </div>
              );
            })}
          </div>

          <div className="cal-week-row cal-week-allday">
            <div className="cal-week-gutter-label">Todo el día</div>
            {days.map((day) => {
              const key = toDayKey(day);
              return (
                <div key={key} className="cal-week-allday-cell" onClick={() => onCreateAt(key)}>
                  {(byDay.get(key) ?? []).filter(isAllDayRow).map((event) => (
                    <button
                      key={event.id}
                      type="button"
                      className={`cal-chip block cal-ev-${eventKindColor[event.kind]}`}
                      title={event.title}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectEvent(event);
                      }}
                    >
                      {event.title}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        <div className="cal-week-row cal-week-body" style={{ height: 24 * HOUR_PX }}>
          <div className="cal-week-hours">
            {HOURS.slice(1).map((h) => (
              <div key={h} style={{ top: h * HOUR_PX }}>{String(h).padStart(2, "0")}:00</div>
            ))}
          </div>

          {days.map((day) => {
            const key = toDayKey(day);
            const timed = (byDay.get(key) ?? [])
              .filter((event) => !isAllDayRow(event))
              .map((event) => ({ item: event, ...minutesInDay(event, key) }));

            return (
              <div
                key={key}
                className={`cal-week-col${key === today ? " today" : ""}`}
                style={{ backgroundSize: `100% ${HOUR_PX}px` }}
                onClick={(e) => handleColumnClick(key, e)}
              >
                {layoutDayColumn(timed, MIN_EVENT_MINUTES).map(({ item: event, start, end, lane, lanes }) => {
                  const height = minutesToPx(Math.max(end - start, MIN_EVENT_MINUTES));
                  return (
                    <button
                      key={event.id}
                      type="button"
                      className={`cal-week-event cal-ev-${eventKindColor[event.kind]}`}
                      style={{
                        top: minutesToPx(start),
                        height,
                        left: `calc(${(lane / lanes) * 100}% + 2px)`,
                        width: `calc(${100 / lanes}% - 4px)`,
                      }}
                      title={event.title}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectEvent(event);
                      }}
                    >
                      <span className="cal-week-event-title">{event.title}</span>
                      {height >= 34 && (
                        <span className="cal-week-event-time">
                          {formatTime(new Date(event.startsAt))} – {formatTime(new Date(event.endsAt))}
                        </span>
                      )}
                    </button>
                  );
                })}

                {key === today && nowMinutes !== null && (
                  <div className="cal-now-line" style={{ top: minutesToPx(nowMinutes) }} aria-hidden />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
