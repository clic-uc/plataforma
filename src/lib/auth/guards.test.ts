import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AuthError,
  assertProjectWriter,
  getCurrentMember,
  requireCoordinacion,
  requireMcpAccess,
  requireMember,
  runAsMember,
} from "@/lib/auth/guards";
import type { CurrentMember } from "@/lib/auth/current-member";

const { getSession, findUnique, findMembership } = vi.hoisted(() => ({
  getSession: vi.fn(),
  findUnique: vi.fn(),
  findMembership: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@/lib/prisma", () => ({ prisma: { member: { findUnique }, projectMember: { findUnique: findMembership } } }));

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
  findMembership.mockReset();
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

  it("dentro de runAsMember usa ese id y no lee la sesión", async () => {
    await runAsMember("m2", () => getCurrentMember());
    expect(findUnique).toHaveBeenCalledWith({ where: { id: "m2" } });
    expect(getSession).not.toHaveBeenCalled();
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

describe("assertProjectWriter", () => {
  const member = (role: CurrentMember["role"]): CurrentMember => ({
    id: "m1",
    name: "Ana",
    email: "a@b.c",
    image: null,
    role,
    isVerified: true,
  });

  it.each(["EQUIPO", "ROOKIE"] as const)("deja pasar a %s si está en el equipo del proyecto", async (role) => {
    findMembership.mockResolvedValue({ memberId: "m1" });
    await expect(assertProjectWriter(member(role), "p1")).resolves.toBeUndefined();
    expect(findMembership).toHaveBeenCalledWith({
      where: { projectId_memberId: { projectId: "p1", memberId: "m1" } },
      select: { memberId: true },
    });
  });

  it.each(["EQUIPO", "ROOKIE"] as const)("lanza 403 NOT_ON_TEAM a %s fuera del equipo", async (role) => {
    findMembership.mockResolvedValue(null);
    const error = await assertProjectWriter(member(role), "p1").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AuthError);
    expect(error).toMatchObject({ status: 403, code: "NOT_ON_TEAM" });
  });

  it("deja pasar a coordinación sin mirar el equipo", async () => {
    await expect(assertProjectWriter(member("COORDINACION"), "p1")).resolves.toBeUndefined();
    expect(findMembership).not.toHaveBeenCalled();
  });
});

describe("requireMcpAccess", () => {
  it("lanza 403 FORBIDDEN_ROLE para ROOKIE", async () => {
    findUnique.mockResolvedValue(memberRow({ role: "ROOKIE" }));
    await expect(requireMcpAccess()).rejects.toMatchObject({ status: 403, code: "FORBIDDEN_ROLE" });
  });

  it.each(["EQUIPO", "COORDINACION"])("deja pasar a %s", async (role) => {
    findUnique.mockResolvedValue(memberRow({ role }));
    await expect(requireMcpAccess()).resolves.toMatchObject({ role });
  });

  it("revisa primero la aprobación", async () => {
    findUnique.mockResolvedValue(memberRow({ role: "ROOKIE", isVerifiedByCoordinator: false }));
    await expect(requireMcpAccess()).rejects.toMatchObject({ code: "PENDING_APPROVAL" });
  });
});
