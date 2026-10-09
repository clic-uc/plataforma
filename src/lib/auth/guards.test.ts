import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthError, getCurrentMember, requireCoordinacion, requireMember } from "@/lib/auth/guards";

const { getSession, findUnique } = vi.hoisted(() => ({ getSession: vi.fn(), findUnique: vi.fn() }));

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@/lib/prisma", () => ({ prisma: { member: { findUnique } } }));

/** Fila completa de Member: el guard debe devolver solo la proyección. */
function memberRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "m1",
    name: "Ana Pérez",
    email: "ana@ejemplo.com",
    emailVerified: true,
    image: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    role: "EQUIPO",
    area: "Web",
    status: "ACTIVO",
    joinedAt: new Date(),
    birthday: new Date(2000, 0, 1),
    skills: ["TypeScript"],
    level: 2,
    streak: 5,
    isVerifiedByCoordinator: true,
    ...overrides,
  };
}

beforeEach(() => {
  getSession.mockReset();
  findUnique.mockReset();
  getSession.mockResolvedValue({ user: { id: "m1" } });
  findUnique.mockResolvedValue(memberRow());
});

describe("getCurrentMember", () => {
  it("devuelve null sin sesión, sin consultar la base", async () => {
    getSession.mockResolvedValue(null);
    await expect(getCurrentMember()).resolves.toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("devuelve null si la sesión apunta a un Member que ya no existe", async () => {
    findUnique.mockResolvedValue(null);
    await expect(getCurrentMember()).resolves.toBeNull();
  });

  it("devuelve solo la proyección necesaria para autorizar y renderizar", async () => {
    await expect(getCurrentMember()).resolves.toEqual({
      id: "m1",
      name: "Ana Pérez",
      email: "ana@ejemplo.com",
      image: null,
      role: "EQUIPO",
      isVerified: true,
    });
  });

  it("toma el rol de la fila, no de la sesión", async () => {
    getSession.mockResolvedValue({ user: { id: "m1", role: "COORDINACION" } });
    await expect(getCurrentMember()).resolves.toMatchObject({ role: "EQUIPO" });
    expect(findUnique).toHaveBeenCalledWith({ where: { id: "m1" } });
  });
});

describe("requireMember", () => {
  it("lanza 401 UNAUTHENTICATED sin sesión", async () => {
    getSession.mockResolvedValue(null);
    const error = await requireMember().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AuthError);
    expect(error).toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
  });

  it("lanza 403 PENDING_APPROVAL si coordinación no aprobó la cuenta", async () => {
    findUnique.mockResolvedValue(memberRow({ isVerifiedByCoordinator: false }));
    await expect(requireMember()).rejects.toMatchObject({ status: 403, code: "PENDING_APPROVAL" });
  });

  it("devuelve al miembro aprobado", async () => {
    await expect(requireMember()).resolves.toMatchObject({ id: "m1", isVerified: true });
  });
});

describe("requireCoordinacion", () => {
  it.each(["EQUIPO", "ROOKIE"])("lanza 403 FORBIDDEN_ROLE para %s", async (role) => {
    findUnique.mockResolvedValue(memberRow({ role }));
    await expect(requireCoordinacion()).rejects.toMatchObject({ status: 403, code: "FORBIDDEN_ROLE" });
  });

  it("deja pasar a COORDINACION", async () => {
    findUnique.mockResolvedValue(memberRow({ role: "COORDINACION" }));
    await expect(requireCoordinacion()).resolves.toMatchObject({ role: "COORDINACION" });
  });

  it("revisa primero la aprobación: una cuenta pendiente no recibe FORBIDDEN_ROLE", async () => {
    findUnique.mockResolvedValue(memberRow({ role: "COORDINACION", isVerifiedByCoordinator: false }));
    await expect(requireCoordinacion()).rejects.toMatchObject({ code: "PENDING_APPROVAL" });
  });
});
