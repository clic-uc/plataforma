import "server-only";

import type { McpServer } from "@modelcontextprotocol/server";
import { registerCalendarTools } from "@/lib/mcp/calendar";
import { registerIssueTools } from "@/lib/mcp/issues";
import { registerMemberTools } from "@/lib/mcp/members";
import { registerProjectTools } from "@/lib/mcp/projects";
import { registerTiempoTools } from "@/lib/mcp/tiempo";

/** Contexto que el cliente MCP le pasa al modelo: lo que no se deduce de cada tool por separado. */
export const SERVER_INSTRUCTIONS = `Plataforma interna de CLIC: proyectos, tareas, calendario, miembros, horas y StandUps.

- Todas las acciones se hacen en nombre de la persona conectada (get_me), con sus permisos.
- Fechas en "YYYY-MM-DD" y horas en hora de Chile (America/Santiago). "Hoy" es la fecha de Chile.
- Features y tareas se identifican por label (F-01, T-01). Los labels se renumeran cuando alguien borra una, así que las tools que editan exigen el labelsToken de get_project; si responden que los identificadores cambiaron, vuelve a llamar a get_project.
- Una tarea está terminada cuando está en la columna LISTO. Para estar en PROGRESO o REVISION tiene que tener a alguien asignado; al sacarla de una de esas columnas, quien la tenía asignada puede registrar el tiempo que le dedicó (minutesSpent en update_task).
- Los issues se identifican por su número dentro del proyecto (#12), que nunca se renumera, así que no necesitan labelsToken. Al crear una tarea o una feature a partir de un issue, pasa su issueNumber para que quede vinculada; link_issue y unlink_issue vinculan o desvinculan features y tareas que ya existen (exigen el labelsToken, porque las direccionan por label). "Revisado" es personal: reviewed dice si la persona conectada ya vio la última actividad de un issue, y mark_issue_reviewed lo marca o desmarca.
- Antes de crear algo (un issue, una feature, una tarea, un evento…), se sugiere mostrarle el borrador completo a la persona y esperar a que lo confirme, para no iterar sobre contenido ya creado: cada edición de un issue lo marca como no revisado para los demás. Si vas a crear varias cosas, muestra el conjunto antes de crear ninguna.
- Cuando se termine el trabajo de un issue, ofrece cerrarlo (close_issue con RESUELTO y un comentario de lo que se hizo), pero no lo cierres sin que la persona lo acepte.
- Antes de editar un documento, léelo con get_document y envía el texto completo con la version recibida.`;

export function registerTools(server: McpServer): void {
  registerProjectTools(server);
  registerIssueTools(server);
  registerTiempoTools(server);
  registerCalendarTools(server);
  registerMemberTools(server);
}
