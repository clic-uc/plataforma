"use client";

import { Fragment, useState } from "react";
import {
  monthCalendar,
  weekHours,
  weekDays,
  weekRangeLabel,
  weekNumberLabel,
  weekEvents,
} from "../../../prisma/seed/data/dashboard";

const DOW = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export function DashboardCalendarCard() {
  const [tab, setTab] = useState<"calendar" | "weekly">("calendar");

  const cells: { day: number; otherMonth: boolean }[] = [];
  for (let d = 1; d <= monthCalendar.daysInMonth; d++) cells.push({ day: d, otherMonth: false });
  for (let d = 1; d <= monthCalendar.trailingDays; d++) cells.push({ day: d, otherMonth: true });

  const eventsByDay = new Map(monthCalendar.events.map((e) => [e.day, e]));

  return (
    <div className="dash-cal-card">
      <div className="dash-cal-tabs-bar">
        <button className={`dash-cal-tab${tab === "calendar" ? " active" : ""}`} onClick={() => setTab("calendar")}>
          Calendario
        </button>
        <button className={`dash-cal-tab${tab === "weekly" ? " active" : ""}`} onClick={() => setTab("weekly")}>
          Vista Semanal
        </button>
      </div>

      {tab === "calendar" && (
        <div className="dash-cal-panel">
          <div className="month-cal-head">
            <div className="month-cal-nav">
              <button className="month-cal-arrow">‹</button>
              <div className="month-cal-title">{monthCalendar.title}</div>
              <button className="month-cal-arrow">›</button>
            </div>
            <div style={{ fontFamily: "var(--font-space-mono)", fontSize: 9, color: "var(--text-3)" }}>
              {monthCalendar.weekRange}
            </div>
          </div>
          <div className="month-dow-row">
            {DOW.map((d) => (
              <div key={d} className="month-dow">{d}</div>
            ))}
          </div>
          <div className="month-grid">
            {cells.map((cell, i) => {
              const ev = !cell.otherMonth ? eventsByDay.get(cell.day) : undefined;
              const isToday = !cell.otherMonth && cell.day === monthCalendar.today;
              return (
                <div key={i} className={`month-day${cell.otherMonth ? " other-m" : ""}${isToday ? " today-d" : ""}`}>
                  <div className="month-day-num">{cell.day}</div>
                  {ev && <div className={`month-ev${ev.color ? ` ev-${ev.color}` : ""}`}>{ev.label}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === "weekly" && (
        <div className="dash-cal-panel">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div className="month-cal-nav">
              <button className="month-cal-arrow">‹</button>
              <div className="month-cal-title" style={{ fontSize: 14 }}>{weekRangeLabel}</div>
              <button className="month-cal-arrow">›</button>
            </div>
            <div style={{ fontFamily: "var(--font-space-mono)", fontSize: 9, color: "var(--text-3)" }}>
              {weekNumberLabel}
            </div>
          </div>
          <div className="week-exp-wrap">
            <div className="week-exp-grid">
              <div className="week-exp-hcell" style={{ textAlign: "right", paddingRight: 6 }} />
              {weekDays.map((d) => (
                <div key={d} className="week-exp-hcell">{d}</div>
              ))}

              {weekHours.map((hour) => (
                <Fragment key={hour}>
                  <div className="week-exp-timecell">{hour}</div>
                  {Array.from({ length: 5 }).map((_, dayIdx) => {
                    const event = weekEvents.find((e) => e.hour === hour && e.day === dayIdx);
                    return (
                      <div key={`${hour}-${dayIdx}`} className="week-exp-slot">
                        {event && (
                          <div className={`week-exp-event${event.color ? ` ev-${event.color}` : ""}`}>
                            {event.label}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </Fragment>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
