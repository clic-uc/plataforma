import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { prisma } from "@/lib/prisma";
import { projects as projectsData } from "./data/projects";
import { members as membersData } from "./data/members";

const MONTHS: Record<string, number> = {
  ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5,
  jul: 6, ago: 7, sep: 8, oct: 9, nov: 10, dic: 11,
};

function parseMonthYear(s: string): Date {
  const [mon, year] = s.split(" ");
  return new Date(Number(year), MONTHS[mon.toLowerCase()], 1);
}

function parseDayMonthYear(s: string): Date {
  const [day, mon, year] = s.split(" ");
  return new Date(Number(year), MONTHS[mon.toLowerCase()], Number(day));
}

function parseDayMonth(s: string, year: number): Date {
  const [day, mon] = s.split(" ");
  return new Date(year, MONTHS[mon.toLowerCase()], Number(day));
}

// El mock no trae año de nacimiento; se fija uno arbitrario solo para
// poder persistir la fecha. Día y mes sí son los reales.
function parseBirthday(s: string): Date {
  return parseDayMonth(s, 2000);
}

function parseWeekdayDayMonthYear(s: string): Date {
  const [, day, mon, year] = s.split(" ");
  return new Date(Number(year), MONTHS[mon.toLowerCase()], Number(day));
}

const memberRoleMap: Record<string, "COORDINACION" | "EQUIPO" | "ROOKIE"> = {
  Coordinador: "COORDINACION",
  Equipo: "EQUIPO",
  Rookie: "ROOKIE",
};

const memberStatusMap: Record<string, "ACTIVO" | "HIATUS"> = {
  Activo: "ACTIVO",
  HIATUS: "HIATUS",
  // el enum actual no distingue "rookie" como estado propio; se trata como activo
  Rookie: "ACTIVO",
};

const projectStatusMap: Record<
  string,
  "ACTIVO" | "EN_PAUSA" | "PLANIFICACION" | "DESARROLLO" | "TRASPASO"
> = {
  Activo: "ACTIVO",
  "En pausa": "EN_PAUSA",
  Planificación: "PLANIFICACION",
  Desarrollo: "DESARROLLO",
};

const priorityMap: Record<string, "ALTA" | "MEDIA" | "BAJA"> = {
  alta: "ALTA",
  media: "MEDIA",
  baja: "BAJA",
};

const featureStatusMap: Record<string, "HECHO" | "EN_PROGRESO" | "PENDIENTE"> = {
  Hecho: "HECHO",
  "En progreso": "EN_PROGRESO",
  Pendiente: "PENDIENTE",
};

const taskTypeMap: Record<
  string,
  "FEATURE" | "SPIKE" | "FIX" | "REFACTOR" | "CHORE" | "DOCS"
> = {
  feature: "FEATURE",
  spike: "SPIKE",
  fix: "FIX",
  refactor: "REFACTOR",
  chore: "CHORE",
  docs: "DOCS",
};

const kanbanColumnMap: Record<
  string,
  "PENDIENTE" | "PROGRESO" | "REVISAR" | "REVISION" | "LISTO"
> = {
  pendiente: "PENDIENTE",
  progreso: "PROGRESO",
  revisar: "REVISAR",
  revision: "REVISION",
  listo: "LISTO",
};

const docSlotMap: Record<
  string,
  "KICKOFF" | "REQUERIMIENTOS" | "TECNICO" | "DECISIONES" | "INFORME"
> = {
  kickoff: "KICKOFF",
  requerimientos: "REQUERIMIENTOS",
  tecnico: "TECNICO",
  decisiones: "DECISIONES",
  informe: "INFORME",
};

async function main() {
  // Los Member con Account de OAuth se conservan: son cuentas reales y Member es
  // también su identidad de auth, así que borrarlos eliminaría a la persona y sus
  // sesiones (FK en cascada). El resto es data de demo.
  console.log("Limpiando datos existentes...");
  await prisma.standup.deleteMany();
  await prisma.memberAchievement.deleteMany();
  await prisma.achievement.deleteMany();
  await prisma.document.deleteMany();
  await prisma.acta.deleteMany();
  await prisma.task.deleteMany();
  await prisma.feature.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.project.deleteMany();
  await prisma.member.deleteMany({ where: { accounts: { none: {} } } });

  console.log("Creando miembros...");
  const memberIdByMockId = new Map<string, string>();
  const memberIdByInitials = new Map<string, string>();

  for (const m of membersData) {
    // Un Member con cuenta real puede conservar este mismo correo (email es
    // @unique). Se reutiliza: insertar violaría el unique y actualizar
    // sobrescribiría su rol con el de la data de demo.
    const existing = await prisma.member.findUnique({
      where: { email: m.email },
      select: { id: true },
    });

    const member =
      existing ??
      (await prisma.member.create({
        data: {
          name: m.name,
          role: memberRoleMap[m.role] ?? "EQUIPO",
          area: m.area,
          email: m.email,
          birthday: parseBirthday(m.bday),
          joinedAt: parseMonthYear(m.joined),
          status: memberStatusMap[m.status] ?? "ACTIVO",
          skills: m.skills,
          level: m.level,
          streak: m.streak,
          // La data de demo se siembra ya aprobada; solo las altas por login
          // parten en false.
          isVerifiedByCoordinator: true,
        },
      }));

    memberIdByMockId.set(m.id, member.id);
    memberIdByInitials.set(m.initials, member.id);
  }

  console.log("Creando catálogo de logros...");
  const achievementIdByName = new Map<string, string>();
  for (const m of membersData) {
    for (const a of m.achievements) {
      if (!achievementIdByName.has(a.name)) {
        const created = await prisma.achievement.create({
          data: { name: a.name, icon: a.icon },
        });
        achievementIdByName.set(a.name, created.id);
      }
    }
  }

  console.log("Asignando logros a miembros...");
  for (const m of membersData) {
    const memberId = memberIdByMockId.get(m.id)!;
    for (const a of m.achievements) {
      const achievementId = achievementIdByName.get(a.name)!;
      await prisma.memberAchievement.create({
        data: {
          memberId,
          achievementId,
          unlockedAt: a.unlocked ? new Date() : null,
        },
      });
    }
  }

  console.log("Creando standups...");
  for (const m of membersData) {
    const memberId = memberIdByMockId.get(m.id)!;
    for (const s of m.standups) {
      await prisma.standup.create({
        data: {
          memberId,
          date: parseWeekdayDayMonthYear(s.date),
          text: s.text,
        },
      });
    }
  }

  console.log("Creando proyectos, features, tasks, docs y actas...");
  const projectIdByMockId = new Map<string, string>();

  for (const p of projectsData) {
    const project = await prisma.project.create({
      data: {
        name: p.name,
        client: p.client,
        area: p.area,
        description: p.description,
        status: projectStatusMap[p.status] ?? "ACTIVO",
        startDate: parseMonthYear(p.startDate),
        archived: p.archived ?? false,
      },
    });
    projectIdByMockId.set(p.id, project.id);

    const featureIdByLabel = new Map<string, string>();
    for (const f of p.features) {
      const feature = await prisma.feature.create({
        data: {
          label: f.id,
          projectId: project.id,
          name: f.name,
          priority: priorityMap[f.priority],
          status: featureStatusMap[f.status],
        },
      });
      featureIdByLabel.set(f.id, feature.id);
    }

    for (const t of p.tasks) {
      const featureId = featureIdByLabel.get(t.featureId);
      if (!featureId) continue;
      await prisma.task.create({
        data: {
          label: t.id,
          projectId: project.id,
          featureId,
          name: t.name,
          type: taskTypeMap[t.type],
          // el mock no tiene asignación real, solo un flag visual (assigneeAccent)
          active: true,
          column: kanbanColumnMap[t.column],
        },
      });
    }

    for (const d of p.docs) {
      await prisma.document.create({
        data: {
          projectId: project.id,
          authorId: d.author ? memberIdByInitials.get(d.author) ?? null : null,
          slot: docSlotMap[d.key],
          filled: d.filled,
          date: d.date ? parseDayMonthYear(d.date) : null,
        },
      });
    }

    for (const a of p.actas) {
      await prisma.acta.create({
        data: {
          projectId: project.id,
          title: a.title,
          date: parseDayMonth(a.date, 2026),
        },
      });
    }
  }

  console.log("Creando asignaciones de equipo (project_member)...");
  for (const m of membersData) {
    const memberId = memberIdByMockId.get(m.id)!;
    for (const mp of m.projects) {
      const projectId = projectIdByMockId.get(mp.projectId);
      if (!projectId) continue;
      await prisma.projectMember.create({
        data: { projectId, memberId, role: mp.role },
      });
    }
  }

  console.log("Seed completado.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
