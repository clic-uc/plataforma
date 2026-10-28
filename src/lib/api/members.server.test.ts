import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthError, requireCoordinacion, requireMember } from "@/lib/auth/guards";
import { ApiError } from "@/lib/api/errors";
import {
  approveMember,
  deleteMember,
  parseApproveMemberInput,
  parseUpdateMemberInput,
  updateMember,
} from "@/lib/api/members.server";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    member: {
      findUnique: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
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

const profile = { name: "Ana Rojas", birthday: "03-08", skills: ["React"], availability: ["LUN_MANANA"] };
const admin = { role: "EQUIPO", status: "HIATUS", level: 3 };

beforeEach(() => {
  for (const fn of Object.values(prisma.member)) fn.mockReset();
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
