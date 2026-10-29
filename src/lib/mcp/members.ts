import "server-only";

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { getMember, getMembers } from "@/lib/api/members.server";
import { requireMember } from "@/lib/auth/guards";
import { fail, json, run } from "@/lib/mcp/result";

export function registerMemberTools(server: McpServer): void {
  server.registerTool(
    "get_me",
    {
      title: "Quién soy",
      description: "La persona conectada: su id (para asignarse tareas), nombre, correo y rol.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    () =>
      run(async () => {
        const member = await requireMember();
        return json({ id: member.id, name: member.name, email: member.email, role: member.role });
      }),
  );

  server.registerTool(
    "list_members",
    {
      title: "Listar miembros",
      description: "Miembros aprobados de CLIC con su estado y los proyectos en que participan.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    () =>
      run(async () => {
        const members = await getMembers();
        return json(
          members.map((m) => ({
            id: m.id,
            name: m.name,
            email: m.email,
            status: m.statusValue,
            projects: m.projects.map((p) => p.name),
          })),
        );
      }),
  );

  server.registerTool(
    "get_member",
    {
      title: "Ver miembro",
      description:
        "Perfil de un miembro: rol, habilidades, disponibilidad semanal (bloques como LUN_MANANA), proyectos y StandUps recientes.",
      inputSchema: z.object({ memberId: z.string().describe("id del miembro (de list_members)") }),
      annotations: { readOnlyHint: true },
    },
    ({ memberId }) =>
      run(async () => {
        const member = await getMember(memberId);
        if (!member) return fail("No existe el miembro");
        return json({
          id: member.id,
          name: member.name,
          email: member.email,
          role: member.roleValue,
          status: member.statusValue,
          joinedAt: member.joinedAt,
          birthday: member.birthdayValue,
          skills: member.skills,
          availability: member.availability,
          projects: member.projects.map((p) => ({ id: p.id, name: p.name, role: p.role })),
          standups: member.standups,
        });
      }),
  );
}
