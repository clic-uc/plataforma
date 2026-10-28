"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { errorMessage } from "@/lib/api/http";
import { useProjects } from "@/lib/api/projects";
import { useSaveStandup, useStandup, useTimeEntries, type StandupView, type TimeEntryView } from "@/lib/api/tiempo";
import {
  HISTORY_WEEKS,
  MAX_HISTORY_ENTRIES,
  MAX_STANDUP_LENGTH,
  buildWeekChart,
  formatEntryDate,
  formatHours,
  formatWeek,
  recentWeeks,
  todayKey,
} from "@/lib/tiempo";
import { WeekHoursChart } from "@/components/views/WeekHoursChart";
import { TimeEntryModal } from "@/components/views/TimeEntryModal";

type EntryModal = { mode: "create" } | { mode: "edit"; entry: TimeEntryView };

/** `week` es el lunes de la semana en curso en Chile, calculado en el servidor. */
export function TiempoView({ week }: { week: string }) {
  const [modal, setModal] = useState<EntryModal | null>(null);

  return (
    <section className="tiempo-layout">
      <div className="tiempo-top">
        <div className="forms-col">
          <StandupCard week={week} />
        </div>
        <div className="history-col">
          <WeekHoursCard week={week} onAdd={() => setModal({ mode: "create" })} />
        </div>
      </div>

      <HistoryCard week={week} onEdit={(entry) => setModal({ mode: "edit", entry })} />

      {modal && (
        <TimeEntryModal entry={modal.mode === "edit" ? modal.entry : undefined} onClose={() => setModal(null)} />
      )}
    </section>
  );
}

// ─── StandUp ───

function StandupCard({ week }: { week: string }) {
  const { data: standup, isPending, error } = useStandup(week);

  return (
    <div className="card" style={{ flex: 1 }}>
      <div className="card-label">StandUp Semanal</div>
      <div className="standup-week">
        Semana {formatWeek(week)}
        {!isPending && !error && (standup ? <Badge color="green">Enviado</Badge> : <Badge color="amber">Pendiente</Badge>)}
      </div>

      {error ? (
        <div className="modal-error">No se pudo cargar tu StandUp. Recarga la página.</div>
      ) : isPending ? null : (
        // La key remonta el formulario con lo guardado cada vez que cambia en el servidor.
        <StandupForm key={standup?.updatedAt ?? "nuevo"} week={week} standup={standup} />
      )}
    </div>
  );
}

function StandupForm({ week, standup }: { week: string; standup: StandupView | null }) {
  const [text, setText] = useState(standup?.text ?? "");
  const [learned, setLearned] = useState(standup?.learned ?? "");
  const mutation = useSaveStandup();

  const unchanged = !!standup && text.trim() === standup.text && (learned.trim() || null) === standup.learned;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    mutation.mutate({ weekStart: week, text, learned: learned.trim() || null });
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-field">
        <div className="f-label">¿Qué hice esta semana?</div>
        <textarea
          className="field-textarea"
          style={{ minHeight: 76 }}
          value={text}
          maxLength={MAX_STANDUP_LENGTH}
          onChange={(e) => setText(e.target.value)}
          required
        />
      </div>
      <div className="form-field">
        <div className="f-label">¿Qué aprendí?</div>
        <textarea
          className="field-textarea"
          style={{ minHeight: 60 }}
          value={learned}
          maxLength={MAX_STANDUP_LENGTH}
          onChange={(e) => setLearned(e.target.value)}
        />
      </div>

      {mutation.isError && (
        <div className="modal-error">{errorMessage(mutation.error, "No se pudo enviar el StandUp. Intenta de nuevo.")}</div>
      )}

      <button
        type="submit"
        className="btn-primary"
        style={{ width: "100%" }}
        disabled={mutation.isPending || unchanged || !text.trim()}
      >
        {mutation.isPending ? "Enviando…" : standup ? "Actualizar StandUp" : "Enviar StandUp"}
      </button>
      {standup && (
        <div className="field-hint" style={{ textAlign: "center" }}>
          Enviado el {formatEntryDate(todayKey(new Date(standup.updatedAt)))}. Puedes editarlo hasta el domingo.
        </div>
      )}
    </form>
  );
}

// ─── Horas de la semana ───

function WeekHoursCard({ week, onAdd }: { week: string; onAdd: () => void }) {
  const { data: entries, error } = useTimeEntries({ week, projectId: null });
  const chart = buildWeekChart(entries ?? [], week);

  return (
    <div className="card" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <div className="card-head">
        <div className="card-label" style={{ marginBottom: 0 }}>
          Horas registradas esta semana
          {chart.totalMinutes > 0 && <span className="card-label-value">{formatHours(chart.totalMinutes)}</span>}
        </div>
        <button type="button" className="btn-primary" onClick={onAdd}>+ Registrar horas</button>
      </div>
      {error ? (
        <div className="modal-error">No se pudieron cargar las horas. Recarga la página.</div>
      ) : (
        <WeekHoursChart chart={chart} />
      )}
    </div>
  );
}

// ─── Historial ───

function HistoryCard({ week, onEdit }: { week: string; onEdit: (entry: TimeEntryView) => void }) {
  const [weekFilter, setWeekFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const { data: entries = [], error, isFetching } = useTimeEntries({
    week: weekFilter || null,
    projectId: projectFilter || null,
  });
  const { data: projects = [] } = useProjects();
  const projectOptions = [...projects].sort((a, b) => a.name.localeCompare(b.name, "es"));

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-label" style={{ marginBottom: 0 }}>Historial de horas</div>
        <div style={{ display: "flex", gap: 6 }}>
          <select
            className="filter-select"
            style={{ height: 28 }}
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            aria-label="Proyecto"
          >
            <option value="">Todos los proyectos</option>
            {projectOptions.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select
            className="filter-select"
            style={{ height: 28 }}
            value={weekFilter}
            onChange={(e) => setWeekFilter(e.target.value)}
            aria-label="Semana"
          >
            <option value="">Todas las semanas</option>
            {recentWeeks(week, HISTORY_WEEKS).map((w, i) => (
              <option key={w} value={w}>{i === 0 ? `Esta semana (${formatWeek(w)})` : formatWeek(w)}</option>
            ))}
          </select>
        </div>
      </div>

      {error ? (
        <div className="modal-error">No se pudo cargar el historial. Intenta de nuevo.</div>
      ) : (
        <table className="dir-table" style={{ opacity: isFetching ? 0.6 : 1 }}>
          <thead>
            <tr>
              <th style={{ width: 110 }}>Fecha</th>
              <th style={{ width: 180 }}>Proyecto</th>
              <th style={{ width: 64 }}>Horas</th>
              <th>Descripción</th>
              <th style={{ width: 70 }} />
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", color: "var(--text-3)", padding: "18px 12px" }}>
                  {weekFilter || projectFilter ? "Sin registros para estos filtros." : "Aún no registras horas."}
                </td>
              </tr>
            )}
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td className="hist-date">{formatEntryDate(entry.date)}</td>
                <td><span className="task-feat-tag">{entry.project.name}</span></td>
                <td className="hist-hours">{formatHours(entry.minutes)}</td>
                <td style={{ fontSize: 13, color: "var(--text-2)" }}>{entry.description}</td>
                <td style={{ textAlign: "right" }}>
                  <button type="button" className="btn-ghost btn-sm" onClick={() => onEdit(entry)}>Editar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!weekFilter && entries.length >= MAX_HISTORY_ENTRIES && (
        <div className="field-hint">Se muestran los {MAX_HISTORY_ENTRIES} registros más recientes. Filtra por semana para ver los anteriores.</div>
      )}
    </div>
  );
}
