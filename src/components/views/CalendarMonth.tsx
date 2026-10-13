"use client";

import type { CalendarEventView } from "@/lib/api/events";
import { eventKindColor } from "@/lib/api/status";
import { WEEKDAY_SHORT, eventsByDay, formatTime, isAllDayRow, monthGrid, parseDayKey, toDayKey } from "@/lib/calendar";

const MAX_CHIPS = 3;

export function CalendarMonth({
  date,
  events,
  today,
  onSelectEvent,
  onCreateAt,
  onOpenWeek,
}: {
  /** Cualquier día del mes visible, "YYYY-MM-DD". */
  date: string;
  events: CalendarEventView[];
  /** null hasta montar en el navegador: el "hoy" del servidor puede no ser el del navegador. */
  today: string | null;
  onSelectEvent: (event: CalendarEventView) => void;
  onCreateAt: (day: string) => void;
  onOpenWeek: (day: string) => void;
}) {
  const anchor = parseDayKey(date);
  const grid = monthGrid(anchor);
  const byDay = eventsByDay(events, grid.days);

  return (
    <div className="cal-month">
      <div className="cal-month-dow">
        {WEEKDAY_SHORT.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="cal-month-grid" style={{ gridTemplateRows: `repeat(${grid.weeks.length}, minmax(96px, 1fr))` }}>
        {grid.days.map((day) => {
          const key = toDayKey(day);
          const dayEvents = byDay.get(key) ?? [];
          const visible = dayEvents.length > MAX_CHIPS ? dayEvents.slice(0, MAX_CHIPS - 1) : dayEvents;
          const hidden = dayEvents.length - visible.length;
          const otherMonth = day.getMonth() !== anchor.getMonth();

          return (
            <div
              key={key}
              className={`cal-month-day${otherMonth ? " other-month" : ""}${key === today ? " today" : ""}`}
              onClick={() => onCreateAt(key)}
            >
              <button
                type="button"
                className="cal-month-num"
                title="Ver semana"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenWeek(key);
                }}
              >
                {day.getDate()}
              </button>
              {visible.map((event) => (
                <button
                  key={event.id}
                  type="button"
                  className={`cal-chip cal-ev-${eventKindColor[event.kind]}${isAllDayRow(event) ? " block" : ""}`}
                  title={event.title}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectEvent(event);
                  }}
                >
                  {!isAllDayRow(event) && <span className="cal-chip-time">{formatTime(new Date(event.startsAt))}</span>}
                  {event.title}
                </button>
              ))}
              {hidden > 0 && (
                <button
                  type="button"
                  className="cal-more"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenWeek(key);
                  }}
                >
                  +{hidden} más
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
