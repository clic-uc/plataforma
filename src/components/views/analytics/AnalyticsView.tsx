"use client";

import { useState } from "react";
import { useActivityReport, useKanbanReport, useProjectsReport, useTeamReport } from "@/lib/api/analytics";
import { DEFAULT_RANGE, RANGE_OPTIONS, type RangeWeeks } from "@/lib/analytics";
import { LoadError, focusRing } from "@/components/views/analytics/parts";
import { TimeSection } from "@/components/views/analytics/TimeSection";
import { StandupsSection } from "@/components/views/analytics/StandupsSection";
import { ProjectsSection } from "@/components/views/analytics/ProjectsSection";
import { TeamSection } from "@/components/views/analytics/TeamSection";
import { KanbanSection } from "@/components/views/analytics/KanbanSection";

type Tab = "tiempo" | "standups" | "proyectos" | "kanban" | "equipo";

const TABS: { value: Tab; label: string }[] = [
  { value: "tiempo", label: "Tiempo" },
  { value: "standups", label: "StandUps" },
  { value: "proyectos", label: "Proyectos" },
  { value: "kanban", label: "Kanban" },
  { value: "equipo", label: "Equipo" },
];

/**
 * `currentWeek` es el lunes de la semana en curso en Chile y `initialStandupWeek`
 * la semana que se abre para leer; los dos los fija el servidor para que las
 * claves prefetcheadas coincidan.
 */
export function AnalyticsView({ currentWeek, initialStandupWeek }: { currentWeek: string; initialStandupWeek: string }) {
  const [tab, setTab] = useState<Tab>("tiempo");
  const [range, setRange] = useState<RangeWeeks>(DEFAULT_RANGE);
  const [standupWeek, setStandupWeek] = useState(initialStandupWeek);
  /** Filtro de proyecto de la pestaña Kanban; null = todos. */
  const [kanbanProject, setKanbanProject] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex min-h-12 flex-wrap items-end justify-between gap-3 border-b border-border">
        <div role="tablist" aria-label="Secciones" className="-mb-px flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              role="tab"
              id={`tab-${t.value}`}
              aria-selected={tab === t.value}
              aria-controls="analytics-panel"
              onClick={() => setTab(t.value)}
              className={`cursor-pointer border-b-2 px-3 pt-1 pb-2.5 text-base font-semibold transition-colors duration-150 ${focusRing} ${
                tab === t.value ? "border-accent text-text-1" : "border-transparent text-text-3 hover:text-text-1"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {(tab === "tiempo" || tab === "standups" || tab === "kanban") && (
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-text-3">
            {tab === "kanban" && (
              <KanbanProjectFilter currentWeek={currentWeek} range={range} value={kanbanProject} onChange={setKanbanProject} />
            )}
            <span id="range-label">Rango</span>
            <div role="group" aria-labelledby="range-label" className="inline-flex rounded-md border border-border bg-surface p-0.5">
              {RANGE_OPTIONS.map((weeks) => (
                <button
                  key={weeks}
                  type="button"
                  aria-pressed={range === weeks}
                  onClick={() => setRange(weeks)}
                  className={`cursor-pointer rounded-sm px-2.5 py-1 text-xs font-medium tabular-nums transition-colors duration-150 ${focusRing} ${
                    range === weeks ? "bg-accent-dim text-accent-ink" : "text-text-2 hover:text-text-1"
                  }`}
                >
                  {weeks} semanas
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div id="analytics-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === "tiempo" || tab === "standups" ? (
          <ActivityTabs tab={tab} currentWeek={currentWeek} range={range} standupWeek={standupWeek} onStandupWeek={setStandupWeek} />
        ) : tab === "proyectos" ? (
          <ProjectsTab />
        ) : tab === "kanban" ? (
          <KanbanTab currentWeek={currentWeek} range={range} projectId={kanbanProject} />
        ) : (
          <TeamTab />
        )}
      </div>
    </div>
  );
}

function Loading() {
  return <p className="px-1 py-4 text-sm text-text-3">Cargando…</p>;
}

function ActivityTabs({
  tab,
  currentWeek,
  range,
  standupWeek,
  onStandupWeek,
}: {
  tab: "tiempo" | "standups";
  currentWeek: string;
  range: RangeWeeks;
  standupWeek: string;
  onStandupWeek: (week: string) => void;
}) {
  const { data, error, isPlaceholderData } = useActivityReport(currentWeek, range);
  if (error) return <LoadError error={error} what={tab === "tiempo" ? "las horas" : "los StandUps"} />;
  if (!data) return <Loading />;

  return (
    <div className={`transition-opacity duration-150 ${isPlaceholderData ? "opacity-60" : ""}`}>
      {tab === "tiempo" ? (
        <TimeSection report={data} />
      ) : (
        <StandupsSection report={data} week={standupWeek} onWeekChange={onStandupWeek} />
      )}
    </div>
  );
}

function ProjectsTab() {
  const { data, error } = useProjectsReport();
  if (error) return <LoadError error={error} what="los proyectos" />;
  if (!data) return <Loading />;
  return <ProjectsSection report={data} />;
}

function TeamTab() {
  const { data, error } = useTeamReport();
  if (error) return <LoadError error={error} what="el equipo" />;
  if (!data) return <Loading />;
  return <TeamSection report={data} />;
}

function KanbanTab({ currentWeek, range, projectId }: { currentWeek: string; range: RangeWeeks; projectId: string | null }) {
  const { data, error, isPlaceholderData } = useKanbanReport(currentWeek, range, projectId);
  if (error) return <LoadError error={error} what="las métricas del kanban" />;
  if (!data) return <Loading />;
  return (
    <div className={`transition-opacity duration-150 ${isPlaceholderData ? "opacity-60" : ""}`}>
      <KanbanSection report={data} />
    </div>
  );
}

/**
 * Los proyectos salen del mismo reporte (no dependen del filtro), así que el selector
 * lee la consulta que ya está en caché en vez de pedir la lista aparte.
 */
function KanbanProjectFilter({
  currentWeek,
  range,
  value,
  onChange,
}: {
  currentWeek: string;
  range: RangeWeeks;
  value: string | null;
  onChange: (projectId: string | null) => void;
}) {
  const { data } = useKanbanReport(currentWeek, range, value);
  const projects = data?.projects ?? [];
  return (
    <>
      <label htmlFor="kanban-project">Proyecto</label>
      <select
        id="kanban-project"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className={`mr-3 h-7.5 max-w-56 cursor-pointer rounded-md border border-border bg-surface px-2 text-xs font-medium text-text-1 ${focusRing}`}
      >
        <option value="">Todos</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </>
  );
}
