"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { errorMessage } from "@/lib/api/http";
import { useEvents } from "@/lib/api/events";
import {
  addMonths,
  addWeeks,
  parseCalendarParams,
  parseDayKey,
  periodTitle,
  toDayKey,
  visibleRange,
  type CalendarViewMode,
} from "@/lib/calendar";
import { CalendarMonth } from "@/components/views/CalendarMonth";
import { CalendarWeek } from "@/components/views/CalendarWeek";

// ─── Hora actual ───
//
// El servidor no conoce la zona del navegador, así que todo lo que depende de la
// hora local (el día de hoy, la línea de hora actual, en qué día cae cada evento)
// se pinta recién después de hidratar. Durante el render del servidor y la
// hidratación el snapshot es null.

function subscribeToClock(onChange: () => void) {
  const id = setInterval(onChange, 15_000);
  return () => clearInterval(id);
}

/** Minuto actual (ms / 60000), o null antes de hidratar. */
function useCurrentMinute(): number | null {
  return useSyncExternalStore(
    subscribeToClock,
    () => Math.floor(Date.now() / 60_000),
    () => null,
  );
}

/**
 * La vista vive en la URL (?vista=mes|semana&fecha=YYYY-MM-DD) para que el botón
 * atrás y los links compartidos funcionen. Se navega con history.pushState, que
 * Next sincroniza con useSearchParams sin volver a pedir la página al servidor.
 */
function navigate(view: CalendarViewMode, date: string) {
  const params = new URLSearchParams({ vista: view, fecha: date });
  window.history.pushState(null, "", `?${params}`);
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

export function CalendarView({ defaultDate }: { defaultDate: string }) {
  const searchParams = useSearchParams();
  const { view, date } = parseCalendarParams(
    searchParams.get("vista") ?? undefined,
    searchParams.get("fecha") ?? undefined,
    defaultDate,
  );
  const { from, to } = visibleRange(view, date);
  const { data: events = [], error, isFetching, refetch } = useEvents(from, to);

  const currentMinute = useCurrentMinute();
  const now = currentMinute === null ? null : new Date(currentMinute * 60_000);
  const today = now ? toDayKey(now) : null;
  const shownEvents = now ? events : [];

  function shift(step: number) {
    const anchor = parseDayKey(date);
    navigate(view, toDayKey(view === "mes" ? addMonths(anchor, step) : addWeeks(anchor, step)));
  }

  function goToday() {
    navigate(view, toDayKey(new Date()));
  }

  function openCreate(day: string, minutes?: number) {
    // Los modales llegan en el paso siguiente.
    void day;
    void minutes;
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || isTyping(e.target)) return;
      if (e.key === "ArrowLeft") shift(-1);
      else if (e.key === "ArrowRight") shift(1);
      else if (e.key === "t") goToday();
      else if (e.key === "m") navigate("mes", date);
      else if (e.key === "s") navigate("semana", date);
      else return;
      e.preventDefault();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });

  return (
    <section className="cal">
      <div className="cal-toolbar">
        <div className="cal-nav">
          <button type="button" className="month-cal-arrow" onClick={() => shift(-1)} aria-label="Anterior" title="Anterior (←)">‹</button>
          <button type="button" className="btn-ghost cal-today-btn" onClick={goToday} title="Hoy (T)">Hoy</button>
          <button type="button" className="month-cal-arrow" onClick={() => shift(1)} aria-label="Siguiente" title="Siguiente (→)">›</button>
        </div>
        <h2 className="cal-title">
          {periodTitle(view, date)}
          {isFetching && <span className="cal-loading" aria-hidden>●</span>}
        </h2>
        <div className="tabs cal-view-toggle">
          <button type="button" className={`tab-item${view === "mes" ? " active" : ""}`} onClick={() => navigate("mes", date)} title="Mes (M)">
            Mes
          </button>
          <button type="button" className={`tab-item${view === "semana" ? " active" : ""}`} onClick={() => navigate("semana", date)} title="Semana (S)">
            Semana
          </button>
        </div>
        <button type="button" className="btn-primary" onClick={() => openCreate(today ?? date)}>+ Nuevo evento</button>
      </div>

      {error && (
        <div className="inline-error" role="alert">
          <span>{errorMessage(error, "No se pudieron cargar los eventos.")}</span>
          <button type="button" onClick={() => refetch()}>Reintentar</button>
        </div>
      )}

      {view === "mes" ? (
        <CalendarMonth
          date={date}
          events={shownEvents}
          today={today}
          onSelectEvent={() => {}}
          onCreateAt={openCreate}
          onOpenWeek={(day) => navigate("semana", day)}
        />
      ) : (
        <CalendarWeek
          date={date}
          events={shownEvents}
          today={today}
          nowMinutes={now ? now.getHours() * 60 + now.getMinutes() : null}
          onSelectEvent={() => {}}
          onCreateAt={openCreate}
        />
      )}
    </section>
  );
}
