import { beforeEach, describe, expect, it, vi } from "vitest";
import { admitInvitedUser, markInvitationUsed } from "@/lib/auth/invitations";
import { GITHUB_NOT_INVITED_ERROR } from "@/lib/invitations";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    invitation: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma }));

beforeEach(() => {
  for (const fn of Object.values(prisma.invitation)) fn.mockReset();
});

describe("admitInvitedUser (hook before de user.create)", () => {
  it("con invitación sin usar, crea el miembro aprobado con su rol", async () => {
    prisma.invitation.findUnique.mockResolvedValueOnce({ role: "EQUIPO", usedAt: null });

    const result = await admitInvitedUser({ githubLogin: "Ana-Rojas" });

    expect(prisma.invitation.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { githubLogin: "ana-rojas" } }),
    );
    expect(result).toEqual({
      data: { role: "EQUIPO", isVerifiedByCoordinator: true, joinedAt: expect.any(Date) },
    });
  });

  it("sin invitación lanza el APIError cuyo mensaje es el código que lee /login", async () => {
    prisma.invitation.findUnique.mockResolvedValueOnce(null);

    await expect(admitInvitedUser({ githubLogin: "intruso" })).rejects.toMatchObject({
      name: "APIError",
      message: GITHUB_NOT_INVITED_ERROR,
    });
  });

  it("rechaza una invitación ya usada", async () => {
    prisma.invitation.findUnique.mockResolvedValueOnce({ role: "EQUIPO", usedAt: new Date() });

    await expect(admitInvitedUser({ githubLogin: "ana" })).rejects.toMatchObject({ message: GITHUB_NOT_INVITED_ERROR });
  });

  it("rechaza un alta sin login de GitHub sin consultar la base", async () => {
    await expect(admitInvitedUser({})).rejects.toMatchObject({ message: GITHUB_NOT_INVITED_ERROR });
    expect(prisma.invitation.findUnique).not.toHaveBeenCalled();
  });
});

describe("markInvitationUsed (hook after de user.create)", () => {
  it("marca la invitación sin usar de ese login", async () => {
    prisma.invitation.updateMany.mockResolvedValueOnce({ count: 1 });

    await markInvitationUsed({ githubLogin: "Ana" });

    expect(prisma.invitation.updateMany).toHaveBeenCalledWith({
      where: { githubLogin: "ana", usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
  });

  it("no hace nada sin login y no propaga un fallo de la base", async () => {
    await markInvitationUsed({});
    expect(prisma.invitation.updateMany).not.toHaveBeenCalled();

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    prisma.invitation.updateMany.mockRejectedValueOnce(new Error("conexión perdida"));
    await expect(markInvitationUsed({ githubLogin: "ana" })).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
