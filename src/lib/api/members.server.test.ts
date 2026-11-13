import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthError, requireCoordinacion, requireMember } from "@/lib/auth/guards";
import { ApiError } from "@/lib/api/errors";
import {
  approveMember,
  createInvitation,
  deleteInvitation,
  deleteMember,
  getInvitations,
  parseApproveMemberInput,
  parseCreateInvitationInput,
  parseUpdateMemberInput,
  updateMember,
} from "@/lib/api/members.server";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    member: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    invitation: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma }));
// Better Auth no se inicializa en los tests; los guards reales no se usan acá.
vi.mock("@/lib/auth", () => ({ auth: {} }));
vi.mock("@/lib/auth/guards", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/guards")>()),
  requireMember: vi.fn(),
  requireCoordinacion: vi.fn(),
}));

const coordinacion = { id: "coord", role: "COORDINACION" };
const equipo = { id: "yo", role: "EQUIPO" };

function actAs(actor: { id: string; role: string }) {
  vi.mocked(requireMember).mockResolvedValue(actor as never);
  vi.mocked(requireCoordinacion).mockImplementation(async () => {
    if (actor.role !== "COORDINACION") throw new AuthError(403, "FORBIDDEN_ROLE", "Esta acción requiere rol de coordinación");
    return actor as never;
  });
}

/** Fila mínima que getMember sabe mapear. */
function memberRow(id: string) {
  return {
    id,
    name: "Ana Rojas",
    image: null,
    email: "ana@example.com",
    role: "EQUIPO",
    status: "ACTIVO",
    level: 2,
    rank: 3,
    streak: 0,
    birthday: null,
    joinedAt: new Date(2026, 0, 1),
    skills: [],
    availability: [],
    projects: [],
    achievements: [],
    standups: [],
  };
}

const profile = { name: "Ana Rojas", birthday: "03-08", skills: ["React"], availability: ["LUN_MANANA"], rank: 3 };
const admin = { role: "EQUIPO", status: "HIATUS", level: 3 };

beforeEach(() => {
  for (const fn of [...Object.values(prisma.member), ...Object.values(prisma.invitation)]) fn.mockReset();
  vi.mocked(requireMember).mockReset();
  vi.mocked(requireCoordinacion).mockReset();
});

describe("parseUpdateMemberInput", () => {
  it("acepta el perfil solo o con los campos de coordinación", () => {
    expect(parseUpdateMemberInput({ ...profile, name: "  Ana Rojas " })).toEqual(profile);
    expect(parseUpdateMemberInput({ ...profile, admin })).toEqual({ ...profile, admin });
  });

  it("exige birthday explícito, aunque sea null", () => {
    expect(parseUpdateMemberInput({ ...profile, birthday: null })).toEqual({ ...profile, birthday: null });
    const withoutBirthday: Record<string, unknown> = { ...profile };
    delete withoutBirthday.birthday;
    expect(parseUpdateMemberInput(withoutBirthday)).toBeNull();
  });

  it("exige el rango, entero de 1 a 5", () => {
    expect(parseUpdateMemberInput({ ...profile, rank: 1 })).toEqual({ ...profile, rank: 1 });
    expect(parseUpdateMemberInput({ ...profile, rank: 5 })).toEqual({ ...profile, rank: 5 });
    for (const rank of [0, 6, 2.5, "3", null, undefined]) {
      expect(parseUpdateMemberInput({ ...profile, rank })).toBeNull();
    }
  });

  it("rechaza valores inválidos", () => {
    expect(parseUpdateMemberInput({ ...profile, name: "  " })).toBeNull();
    expect(parseUpdateMemberInput({ ...profile, birthday: "02-30" })).toBeNull();
    expect(parseUpdateMemberInput({ ...profile, skills: "React" })).toBeNull();
    expect(parseUpdateMemberInput({ ...profile, availability: ["DOM_NOCHE"] })).toBeNull();
    expect(parseUpdateMemberInput({ ...profile, admin: { ...admin, role: "ADMIN" } })).toBeNull();
    expect(parseUpdateMemberInput({ ...profile, admin: { ...admin, level: 1.5 } })).toBeNull();
    expect(parseUpdateMemberInput({ ...profile, admin: { ...admin, level: -1 } })).toBeNull();
    expect(parseUpdateMemberInput({ ...profile, admin: null })).toBeNull();
  });
});

describe("updateMember", () => {
  const input = parseUpdateMemberInput(profile)!;
  const inputWithAdmin = parseUpdateMemberInput({ ...profile, admin })!;

  it("deja a cada persona editar su propio perfil", async () => {
    actAs(equipo);
    prisma.member.findUnique.mockResolvedValueOnce({ id: "yo" }).mockResolvedValueOnce(memberRow("yo"));

    const result = await updateMember("yo", input);

    expect(result?.id).toBe("yo");
    expect(prisma.member.update).toHaveBeenCalledWith({
      where: { id: "yo" },
      data: {
        name: "Ana Rojas",
        birthday: new Date("2000-03-08T12:00:00.000Z"),
        skills: ["React"],
        availability: ["LUN_MANANA"],
        rank: 3,
      },
    });
  });

  it("no deja editar el perfil de otra persona sin ser coordinación", async () => {
    actAs(equipo);
    await expect(updateMember("otro", input)).rejects.toMatchObject({ status: 403, code: "FORBIDDEN_ROLE" });
    expect(prisma.member.update).not.toHaveBeenCalled();
  });

  it("no deja que alguien sin coordinación se asigne área, rol, estado o nivel", async () => {
    actAs(equipo);
    await expect(updateMember("yo", inputWithAdmin)).rejects.toMatchObject({ status: 403, code: "FORBIDDEN_ROLE" });
    expect(prisma.member.update).not.toHaveBeenCalled();
  });

  it("coordinación edita a cualquiera, incluidos los campos de coordinación", async () => {
    actAs(coordinacion);
    prisma.member.findUnique.mockResolvedValueOnce({ id: "otro" }).mockResolvedValueOnce(memberRow("otro"));

    await updateMember("otro", inputWithAdmin);

    expect(prisma.member.count).not.toHaveBeenCalled();
    expect(prisma.member.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining(admin) }),
    );
  });

  it("devuelve null si el miembro no existe o sigue pendiente", async () => {
    actAs(coordinacion);
    prisma.member.findUnique.mockResolvedValueOnce(null);
    expect(await updateMember("pendiente", input)).toBeNull();
    expect(prisma.member.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "pendiente", isVerifiedByCoordinator: true } }),
    );
  });

  it("no deja que el último coordinador se quite el rol", async () => {
    actAs(coordinacion);
    prisma.member.findUnique.mockResolvedValueOnce({ id: "coord" });
    prisma.member.count.mockResolvedValueOnce(0);

    const error = await updateMember("coord", inputWithAdmin).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: "LAST_COORDINATOR" });
    expect(prisma.member.update).not.toHaveBeenCalled();
  });

  it("deja que un coordinador se quite el rol si queda otro", async () => {
    actAs(coordinacion);
    prisma.member.findUnique.mockResolvedValueOnce({ id: "coord" }).mockResolvedValueOnce(memberRow("coord"));
    prisma.member.count.mockResolvedValueOnce(1);

    await updateMember("coord", inputWithAdmin);

    expect(prisma.member.count).toHaveBeenCalledWith({
      where: { role: "COORDINACION", isVerifiedByCoordinator: true, id: { not: "coord" } },
    });
    expect(prisma.member.update).toHaveBeenCalled();
  });
});

describe("approveMember", () => {
  it("parseApproveMemberInput valida el rol", () => {
    expect(parseApproveMemberInput({ role: "ROOKIE" })).toEqual({ role: "ROOKIE" });
    expect(parseApproveMemberInput({ role: "JEFE" })).toBeNull();
    expect(parseApproveMemberInput({})).toBeNull();
  });

  it("solo aprueba cuentas pendientes y fija rol y fecha de ingreso", async () => {
    actAs(coordinacion);
    prisma.member.updateMany.mockResolvedValueOnce({ count: 1 });
    prisma.member.findUnique.mockResolvedValueOnce(memberRow("nuevo"));

    const result = await approveMember("nuevo", { role: "ROOKIE" });

    expect(result?.id).toBe("nuevo");
    expect(prisma.member.updateMany).toHaveBeenCalledWith({
      where: { id: "nuevo", isVerifiedByCoordinator: false },
      data: { isVerifiedByCoordinator: true, role: "ROOKIE", joinedAt: expect.any(Date) },
    });
  });

  it("responde 409 si la cuenta ya estaba aprobada y null si no existe", async () => {
    actAs(coordinacion);
    prisma.member.updateMany.mockResolvedValue({ count: 0 });

    prisma.member.findUnique.mockResolvedValueOnce({ id: "viejo" });
    await expect(approveMember("viejo", { role: "ROOKIE" })).rejects.toMatchObject({
      status: 409,
      code: "NOT_PENDING",
    });

    prisma.member.findUnique.mockResolvedValueOnce(null);
    expect(await approveMember("nadie", { role: "ROOKIE" })).toBeNull();
  });

  it("es solo de coordinación", async () => {
    actAs(equipo);
    await expect(approveMember("nuevo", { role: "ROOKIE" })).rejects.toMatchObject({ status: 403 });
    expect(prisma.member.updateMany).not.toHaveBeenCalled();
  });
});

describe("deleteMember", () => {
  it("borra la fila y reporta si existía", async () => {
    actAs(coordinacion);
    prisma.member.deleteMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

    expect(await deleteMember("otro")).toBe(true);
    expect(await deleteMember("nadie")).toBe(false);
    expect(prisma.member.deleteMany).toHaveBeenCalledWith({ where: { id: "otro" } });
  });

  it("no deja que coordinación se borre a sí misma", async () => {
    actAs(coordinacion);
    await expect(deleteMember("coord")).rejects.toMatchObject({ status: 422, code: "CANNOT_REMOVE_SELF" });
    expect(prisma.member.deleteMany).not.toHaveBeenCalled();
  });

  it("es solo de coordinación", async () => {
    actAs(equipo);
    await expect(deleteMember("otro")).rejects.toMatchObject({ status: 403 });
    expect(prisma.member.deleteMany).not.toHaveBeenCalled();
  });
});

describe("parseCreateInvitationInput", () => {
  it("normaliza el usuario: sin espacios, sin @ y en minúsculas", () => {
    expect(parseCreateInvitationInput({ githubLogin: "  @Ana-Rojas ", role: "EQUIPO" })).toEqual({
      githubLogin: "ana-rojas",
      role: "EQUIPO",
    });
  });

  it("rechaza usuarios inválidos, roles desconocidos y cuerpos que no son objeto", () => {
    expect(parseCreateInvitationInput({ githubLogin: "-ana", role: "ROOKIE" })).toBeNull();
    expect(parseCreateInvitationInput({ githubLogin: "ana rojas", role: "ROOKIE" })).toBeNull();
    expect(parseCreateInvitationInput({ githubLogin: "", role: "ROOKIE" })).toBeNull();
    expect(parseCreateInvitationInput({ githubLogin: 42, role: "ROOKIE" })).toBeNull();
    expect(parseCreateInvitationInput({ githubLogin: "ana", role: "ADMIN" })).toBeNull();
    expect(parseCreateInvitationInput({ githubLogin: "ana" })).toBeNull();
    expect(parseCreateInvitationInput(null)).toBeNull();
  });
});

function invitationRow(githubLogin: string, createdBy: { name: string } | null = { name: "Coordinadora" }) {
  return { id: `inv-${githubLogin}`, githubLogin, role: "ROOKIE", createdAt: new Date(2026, 10, 12), createdBy };
}

describe("getInvitations", () => {
  it("lista las sin usar y salta las de un login que ya es de un miembro", async () => {
    actAs(coordinacion);
    prisma.invitation.findMany.mockResolvedValueOnce([invitationRow("ana"), invitationRow("beto", null)]);
    // Member.githubLogin conserva las mayúsculas de GitHub.
    prisma.member.findMany.mockResolvedValueOnce([{ githubLogin: "Ana" }]);

    const result = await getInvitations();

    expect(prisma.invitation.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { usedAt: null } }));
    expect(result).toEqual([
      {
        id: "inv-beto",
        githubLogin: "beto",
        role: "Rookie",
        roleValue: "ROOKIE",
        invitedBy: null,
        createdAt: expect.any(String),
      },
    ]);
  });

  it("es solo de coordinación", async () => {
    actAs(equipo);
    await expect(getInvitations()).rejects.toMatchObject({ status: 403 });
    expect(prisma.invitation.findMany).not.toHaveBeenCalled();
  });
});

describe("createInvitation", () => {
  const input = { githubLogin: "ana", role: "EQUIPO" as const };

  it("crea la invitación a nombre de quien invita", async () => {
    actAs(coordinacion);
    prisma.member.findFirst.mockResolvedValueOnce(null);
    prisma.invitation.findUnique.mockResolvedValueOnce(null);
    prisma.invitation.create.mockResolvedValueOnce({ ...invitationRow("ana"), role: "EQUIPO" });

    const result = await createInvitation(input);

    expect(prisma.invitation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { githubLogin: "ana", role: "EQUIPO", createdById: "coord", createdAt: expect.any(Date), usedAt: null },
      }),
    );
    expect(result).toMatchObject({ githubLogin: "ana", roleValue: "EQUIPO", invitedBy: "Coordinadora" });
  });

  it("busca el miembro sin distinguir mayúsculas y responde 409 si ya tiene cuenta", async () => {
    actAs(coordinacion);
    prisma.member.findFirst.mockResolvedValueOnce({ id: "ana-id" });

    await expect(createInvitation(input)).rejects.toMatchObject({ status: 409, code: "ALREADY_MEMBER" });
    expect(prisma.member.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { githubLogin: { equals: "ana", mode: "insensitive" } } }),
    );
    expect(prisma.invitation.create).not.toHaveBeenCalled();
  });

  it("responde 409 si ya hay una invitación sin usar", async () => {
    actAs(coordinacion);
    prisma.member.findFirst.mockResolvedValueOnce(null);
    prisma.invitation.findUnique.mockResolvedValueOnce({ usedAt: null });

    await expect(createInvitation(input)).rejects.toMatchObject({ status: 409, code: "ALREADY_INVITED" });
    expect(prisma.invitation.create).not.toHaveBeenCalled();
    expect(prisma.invitation.update).not.toHaveBeenCalled();
  });

  it("reutiliza la invitación usada de alguien cuya cuenta se borró", async () => {
    actAs(coordinacion);
    prisma.member.findFirst.mockResolvedValueOnce(null);
    prisma.invitation.findUnique.mockResolvedValueOnce({ usedAt: new Date(2026, 9, 1) });
    prisma.invitation.update.mockResolvedValueOnce({ ...invitationRow("ana"), role: "EQUIPO" });

    await createInvitation(input);

    expect(prisma.invitation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { githubLogin: "ana" },
        data: { role: "EQUIPO", createdById: "coord", createdAt: expect.any(Date), usedAt: null },
      }),
    );
    expect(prisma.invitation.create).not.toHaveBeenCalled();
  });

  it("traduce la carrera de dos invitaciones simultáneas a 409", async () => {
    actAs(coordinacion);
    prisma.member.findFirst.mockResolvedValueOnce(null);
    prisma.invitation.findUnique.mockResolvedValueOnce(null);
    prisma.invitation.create.mockRejectedValueOnce(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }));

    await expect(createInvitation(input)).rejects.toMatchObject({ status: 409, code: "ALREADY_INVITED" });
  });

  it("es solo de coordinación", async () => {
    actAs(equipo);
    await expect(createInvitation(input)).rejects.toMatchObject({ status: 403 });
    expect(prisma.invitation.create).not.toHaveBeenCalled();
  });
});

describe("deleteInvitation", () => {
  it("borra solo invitaciones sin usar", async () => {
    actAs(coordinacion);
    prisma.invitation.deleteMany.mockResolvedValueOnce({ count: 1 });

    expect(await deleteInvitation("inv-ana")).toBe(true);
    expect(prisma.invitation.deleteMany).toHaveBeenCalledWith({ where: { id: "inv-ana", usedAt: null } });
  });

  it("responde 409 si ya se usó y false si no existe", async () => {
    actAs(coordinacion);
    prisma.invitation.deleteMany.mockResolvedValue({ count: 0 });

    prisma.invitation.findUnique.mockResolvedValueOnce({ id: "inv-ana" });
    await expect(deleteInvitation("inv-ana")).rejects.toMatchObject({ status: 409, code: "INVITATION_USED" });

    prisma.invitation.findUnique.mockResolvedValueOnce(null);
    expect(await deleteInvitation("nada")).toBe(false);
  });

  it("es solo de coordinación", async () => {
    actAs(equipo);
    await expect(deleteInvitation("inv-ana")).rejects.toMatchObject({ status: 403 });
    expect(prisma.invitation.deleteMany).not.toHaveBeenCalled();
  });
});
