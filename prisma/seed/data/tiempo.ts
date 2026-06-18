export interface HistorialEntry {
  date: string;
  project: string;
  hours: string;
  description: string;
}

export const historial: HistorialEntry[] = [
  { date: "Vie 6 jun", project: "San Miguel", hours: "2.5h", description: "Módulo de autenticación OAuth UC" },
  { date: "Jue 5 jun", project: "CLIC Onboarding", hours: "3.0h", description: "Flujo del cuestionario de habilidades" },
  { date: "Mié 4 jun", project: "San Miguel", hours: "2.0h", description: "Review PR dashboard de indicadores" },
  { date: "Mar 3 jun", project: "Catastro Pudahuel", hours: "1.5h", description: "Reunión de área y planificación sprint" },
  { date: "Lun 2 jun", project: "San Miguel", hours: "3.5h", description: "Setup entorno y revisión de requerimientos" },
  { date: "Vie 30 may", project: "CLIC Onboarding", hours: "2.0h", description: "Integración con sistema de roles y permisos" },
  { date: "Jue 29 may", project: "San Miguel", hours: "4.0h", description: "Diseño base de datos KPIs municipales" },
  { date: "Mié 28 may", project: "Catastro Pudahuel", hours: "1.5h", description: "Reunión kick-off y levantamiento de requerimientos" },
];

export const standupWeek = {
  range: "Semana del 2 al 6 jun 2026",
  pending: true,
};
