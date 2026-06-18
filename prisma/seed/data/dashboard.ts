export interface StatCardData {
  label: string;
  value: string;
  unit?: string;
  hint: string;
  hintUp?: boolean;
  accent?: boolean;
}

export const stats: StatCardData[] = [
  { label: "Proyectos activos", value: "4", hint: "2 con actividad esta semana" },
  { label: "Horas esta semana", value: "12", unit: ".5h", hint: "↑ 3h vs semana anterior", hintUp: true, accent: true },
  { label: "Racha actual", value: "7", unit: " días", hint: "Continúa hasta el lunes" },
  { label: "Próxima reunión", value: "Lun 9", hint: "Área Datos · 18:00" },
];

export interface DashboardProjectRow {
  projectId: string;
  name: string;
  meta: string;
  color: string;
  status: string;
  statusColor: "green" | "amber" | "gray" | "blue";
  tasks: { id: string; label: string }[];
}

export const myProjects: DashboardProjectRow[] = [
  {
    projectId: "san-miguel",
    name: "Municipio San Miguel — Dashboard",
    meta: "Área Datos · 4 miembros · PR pendiente",
    color: "#dc4e2a",
    status: "Activo",
    statusColor: "green",
    tasks: [
      { id: "SM-14", label: "Revisar PRD con cliente" },
      { id: "SM-22", label: "Integrar módulo KPIs" },
    ],
  },
  {
    projectId: "catastro-pudahuel",
    name: "Catastro Digital Pudahuel",
    meta: "Área Backend · 4 miembros",
    color: "#d4a853",
    status: "En pausa",
    statusColor: "amber",
    tasks: [{ id: "CP-08", label: "Schema de migración" }],
  },
  {
    projectId: "clic-onboarding",
    name: "CLIC · Módulo Onboarding",
    meta: "Área Full Stack · 2 miembros",
    color: "#5e9e6a",
    status: "Activo",
    statusColor: "green",
    tasks: [
      { id: "CL-03", label: "UI pantalla de bienvenida" },
      { id: "CL-07", label: "Flujo de roles" },
    ],
  },
  {
    projectId: "app-vecinos-la-florida",
    name: "App Vecinos La Florida",
    meta: "Área Mobile · 5 miembros · Planificación",
    color: "#a09080",
    status: "Planificación",
    statusColor: "gray",
    tasks: [{ id: "FL-02", label: "Kickoff y planificación" }],
  },
];

export interface ActivityItem {
  time: string;
  text: string;
  strong?: string;
}

export const activityFeed: ActivityItem[] = [
  { time: "1h", text: "Carlos subió doc. al proyecto", strong: "San Miguel" },
  { time: "Ayer", text: "María hizo StandUp · Área Backend" },
  { time: "Ayer", text: "PR abierto en", strong: "Catastro Pudahuel" },
  { time: "Lun 3", text: "Ana completó módulo de habilidades en onboarding" },
  { time: "Lun 3", text: "Reunión de área registrada ·", strong: "5 asistentes" },
  { time: "Dom 2", text: "Diego registró 3h en", strong: "App La Florida" },
];

export interface MonthEvent {
  day: number;
  label: string;
  color?: "green" | "amber";
}

export const monthCalendar = {
  title: "Junio 2026",
  weekRange: "Semana 23–27",
  today: 7,
  daysInMonth: 30,
  startWeekday: 0, // Monday = 0
  trailingDays: 5,
  events: [
    { day: 2, label: "Reunión área" },
    { day: 4, label: "StandUp · SM", color: "green" },
    { day: 9, label: "Reunión área" },
    { day: 11, label: "Demo cliente", color: "green" },
    { day: 15, label: "Sprint review", color: "amber" },
    { day: 17, label: "Reunión área" },
    { day: 19, label: "StandUp · SM", color: "green" },
    { day: 22, label: "Reunión área" },
    { day: 24, label: "StandUp · SM", color: "green" },
    { day: 29, label: "Reunión área" },
  ] as MonthEvent[],
};

export interface WeekEvent {
  day: number; // 0-4, Mon-Fri
  hour: string; // matches one of weekHours
  label: string;
  color?: "green" | "amber";
}

export const weekHours = ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00"];
export const weekDays = ["LUN 9", "MAR 10", "MIÉ 11", "JUE 12", "VIE 13"];
export const weekRangeLabel = "9 – 13 Jun 2026";
export const weekNumberLabel = "Semana 24";

export const weekEvents: WeekEvent[] = [
  { day: 4, hour: "09:00", label: "Sprint planning", color: "amber" },
  { day: 0, hour: "10:00", label: "Reunión de área" },
  { day: 2, hour: "11:00", label: "Demo San Miguel", color: "green" },
  { day: 3, hour: "14:00", label: "Code review PR #22" },
  { day: 1, hour: "16:00", label: "StandUp semanal", color: "amber" },
];
