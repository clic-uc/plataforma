import type { Project } from "./types";

export const projects: Project[] = [
  {
    id: "san-miguel",
    name: "Municipio San Miguel",
    client: "Municipalidad San Miguel",
    area: "Área Datos",
    description:
      "Dashboard de indicadores para gestión de servicios municipales y vecinos.",
    status: "Activo",
    statusColor: "green",
    progress: 65,
    prCount: 3,
    color: "#dc4e2a",
    teamLabel: "PROYECTOS",
    clientLabel: "Mun. San Miguel",
    teamSize: 4,
    startDate: "Feb 2026",
    docs: [
      { key: "kickoff", name: "Kickoff", filled: true, author: "JP", date: "15 feb 2026", icon: "clock" },
      { key: "requerimientos", name: "Requerimientos", filled: true, author: "CR", date: "20 may 2026", icon: "file" },
      { key: "tecnico", name: "Técnico", filled: true, author: "JP", date: "3 jun 2026", icon: "code" },
      { key: "decisiones", name: "Decisiones", filled: true, author: "JP", date: "15 may 2026", icon: "decision" },
      { key: "informe", name: "Informe", filled: false, icon: "file" },
    ],
    actas: [
      { id: "acta-1", title: "Reunión inicial con la municipalidad", date: "28 may" },
      { id: "acta-2", title: "Sprint planning — semana 22", date: "2 jun" },
      { id: "acta-3", title: "Revisión de avance con cliente", date: "6 jun" },
    ],
    features: [
      { id: "F-01", name: "Autenticación con Google OAuth UC", priority: "alta", status: "Hecho", statusColor: "green", taskCount: 3 },
      { id: "F-02", name: "Dashboard de KPIs municipales", priority: "alta", status: "En progreso", statusColor: "blue", taskCount: 4 },
      { id: "F-03", name: "Exportación de reportes en PDF", priority: "media", status: "Pendiente", statusColor: "gray", taskCount: 2 },
      { id: "F-04", name: "Integración con API municipal", priority: "media", status: "En progreso", statusColor: "blue", taskCount: 3 },
      { id: "F-05", name: "Notificaciones y alertas automáticas", priority: "baja", status: "Pendiente", statusColor: "gray", taskCount: 2 },
    ],
    tasks: [
      { id: "T-01", featureId: "F-01", name: "Configurar OAuth en Google Cloud Console", type: "feature", done: true, assigneeAccent: true, column: "listo" },
      { id: "T-02", featureId: "F-01", name: "Implementar callback de autenticación", type: "refactor", done: true, assigneeAccent: false, column: "listo" },
      { id: "T-03", featureId: "F-01", name: "Restricción de acceso a cuentas @uc.cl", type: "docs", done: true, assigneeAccent: true, column: "listo" },
      { id: "T-04", featureId: "F-02", name: "Diseñar layout del dashboard principal", type: "feature", done: false, assigneeAccent: true, column: "progreso" },
      { id: "T-05", featureId: "F-02", name: "Conectar métricas a endpoints de la API", type: "fix", done: false, assigneeAccent: false, column: "progreso" },
      { id: "T-06", featureId: "F-02", name: "Implementar gráfico de asistencia vecinal", type: "feature", done: false, assigneeAccent: false, column: "pendiente" },
      { id: "T-07", featureId: "F-04", name: "Mapear endpoints API municipal", type: "spike", done: false, assigneeAccent: true, column: "pendiente" },
      { id: "T-08", featureId: "F-03", name: "Template PDF con Puppeteer", type: "chore", done: false, assigneeAccent: false, column: "pendiente" },
    ],
  },
  {
    id: "catastro-pudahuel",
    name: "Catastro Digital Pudahuel",
    client: "Municipalidad Pudahuel",
    area: "Área Backend",
    description:
      "Sistema de catastro de bienes municipales con geolocalización y mapa interactivo.",
    status: "En pausa",
    statusColor: "amber",
    progress: 40,
    prCount: 2,
    color: "#d4a853",
    teamLabel: "PROYECTOS",
    clientLabel: "Mun. Pudahuel",
    teamSize: 4,
    startDate: "Mar 2026",
    docs: [
      { key: "kickoff", name: "Kickoff", filled: true, author: "MG", date: "10 mar 2026", icon: "clock" },
      { key: "requerimientos", name: "Requerimientos", filled: true, author: "MT", date: "28 mar 2026", icon: "file" },
      { key: "tecnico", name: "Técnico", filled: false, icon: "code" },
      { key: "decisiones", name: "Decisiones", filled: false, icon: "decision" },
      { key: "informe", name: "Informe", filled: false, icon: "file" },
    ],
    actas: [{ id: "acta-1", title: "Reunión kick-off y levantamiento de requerimientos", date: "28 may" }],
    features: [
      { id: "F-01", name: "Schema de migración de datos catastrales", priority: "alta", status: "En progreso", statusColor: "blue", taskCount: 2 },
      { id: "F-02", name: "Mapa interactivo con geolocalización", priority: "media", status: "Pendiente", statusColor: "gray", taskCount: 2 },
      { id: "F-03", name: "Carga masiva de bienes municipales", priority: "baja", status: "Pendiente", statusColor: "gray", taskCount: 1 },
    ],
    tasks: [
      { id: "T-01", featureId: "F-01", name: "Diseñar schema de migración", type: "feature", done: true, assigneeAccent: true, column: "listo" },
      { id: "T-02", featureId: "F-01", name: "Validar datos contra catastro original", type: "fix", done: false, assigneeAccent: false, column: "progreso" },
      { id: "T-03", featureId: "F-02", name: "Integrar proveedor de mapas", type: "spike", done: false, assigneeAccent: true, column: "pendiente" },
      { id: "T-04", featureId: "F-02", name: "Capa de geolocalización de bienes", type: "feature", done: false, assigneeAccent: false, column: "pendiente" },
      { id: "T-05", featureId: "F-03", name: "Script de carga masiva CSV", type: "chore", done: false, assigneeAccent: false, column: "pendiente" },
    ],
  },
  {
    id: "clic-onboarding",
    name: "CLIC · Módulo Onboarding",
    client: "Interno",
    area: "Área Full Stack",
    description:
      "Módulo de onboarding con cuestionario de habilidades y recomendaciones de recursos.",
    status: "Desarrollo",
    statusColor: "blue",
    progress: 30,
    prCount: 1,
    color: "#5e9e6a",
    teamLabel: "WEB",
    clientLabel: "Interno",
    teamSize: 2,
    startDate: "Abr 2026",
    docs: [
      { key: "kickoff", name: "Kickoff", filled: true, author: "CR", date: "2 abr 2026", icon: "clock" },
      { key: "requerimientos", name: "Requerimientos", filled: false, icon: "file" },
      { key: "tecnico", name: "Técnico", filled: false, icon: "code" },
      { key: "decisiones", name: "Decisiones", filled: false, icon: "decision" },
      { key: "informe", name: "Informe", filled: false, icon: "file" },
    ],
    actas: [],
    features: [
      { id: "F-01", name: "UI pantalla de bienvenida", priority: "alta", status: "En progreso", statusColor: "blue", taskCount: 2 },
      { id: "F-02", name: "Flujo de roles y permisos", priority: "media", status: "Pendiente", statusColor: "gray", taskCount: 2 },
    ],
    tasks: [
      { id: "T-01", featureId: "F-01", name: "UI pantalla de bienvenida", type: "feature", done: false, assigneeAccent: true, column: "progreso" },
      { id: "T-02", featureId: "F-01", name: "Cuestionario de habilidades", type: "feature", done: false, assigneeAccent: false, column: "pendiente" },
      { id: "T-03", featureId: "F-02", name: "Flujo de roles y permisos", type: "feature", done: false, assigneeAccent: true, column: "pendiente" },
      { id: "T-04", featureId: "F-02", name: "Recomendaciones según resultado", type: "docs", done: false, assigneeAccent: false, column: "pendiente" },
    ],
  },
  {
    id: "app-vecinos-la-florida",
    name: "App Vecinos La Florida",
    client: "Municipalidad La Florida",
    area: "Área Mobile",
    description: "App móvil para reportes ciudadanos y trámites con la municipalidad.",
    status: "Planificación",
    statusColor: "gray",
    progress: 5,
    prCount: 0,
    color: "#a09080",
    teamLabel: "LAB",
    clientLabel: "Mun. La Florida",
    teamSize: 5,
    startDate: "Jun 2026",
    docs: [
      { key: "kickoff", name: "Kickoff", filled: true, author: "AM", date: "1 jun 2026", icon: "clock" },
      { key: "requerimientos", name: "Requerimientos", filled: false, icon: "file" },
      { key: "tecnico", name: "Técnico", filled: false, icon: "code" },
      { key: "decisiones", name: "Decisiones", filled: false, icon: "decision" },
      { key: "informe", name: "Informe", filled: false, icon: "file" },
    ],
    actas: [{ id: "acta-1", title: "Kickoff y planificación", date: "1 jun" }],
    features: [
      { id: "F-01", name: "Levantamiento de requerimientos ciudadanos", priority: "alta", status: "Pendiente", statusColor: "gray", taskCount: 1 },
    ],
    tasks: [
      { id: "T-01", featureId: "F-01", name: "Kickoff y planificación", type: "chore", done: false, assigneeAccent: true, column: "pendiente" },
    ],
  },
];

export function getProject(id: string): Project | undefined {
  return projects.find((p) => p.id === id);
}

const docTypeMeta: Record<string, { type: string; badgeColor: "green" | "amber" | "gray" | "blue" }> = {
  kickoff: { type: "Kickoff", badgeColor: "blue" },
  requerimientos: { type: "Requerimientos", badgeColor: "green" },
  tecnico: { type: "Técnico", badgeColor: "blue" },
  decisiones: { type: "Decisiones", badgeColor: "gray" },
  informe: { type: "Informe", badgeColor: "gray" },
  acta: { type: "Acta", badgeColor: "amber" },
};

export interface DocDetail {
  title: string;
  type: string;
  badgeColor: "green" | "amber" | "gray" | "blue";
  author: string;
  date: string;
}

export function getDoc(project: Project, docId: string): DocDetail | undefined {
  const slot = project.docs.find((d) => d.key === docId && d.filled);
  if (slot) {
    return {
      title: `${slot.name} — ${project.name}`,
      type: docTypeMeta[slot.key]?.type ?? slot.name,
      badgeColor: docTypeMeta[slot.key]?.badgeColor ?? "gray",
      author: slot.author ?? "",
      date: slot.date ?? "",
    };
  }
  const acta = project.actas.find((a) => a.id === docId);
  if (acta) {
    return {
      title: acta.title,
      type: "Acta",
      badgeColor: "amber",
      author: "",
      date: acta.date,
    };
  }
  return undefined;
}
