import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { withAuth } from "@/lib/api/route-handler";
import { AuthError, requireMember } from "@/lib/auth/guards";

vi.mock("@/lib/auth", () => ({ auth: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/auth/guards", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/guards")>()),
  requireMember: vi.fn(),
}));

const member = { id: "m1", name: "Ana", email: "ana@ejemplo.com", image: null, role: "EQUIPO" as const, isVerified: true };

beforeEach(() => {
  vi.mocked(requireMember).mockReset();
  vi.mocked(requireMember).mockResolvedValue(member);
});

describe("withAuth", () => {
  it("pasa los argumentos al handler y devuelve su respuesta", async () => {
    const handler = vi.fn(async (_req: Request, ctx: { params: Promise<{ id: string }> }) =>
      Response.json({ id: (await ctx.params).id }),
    );
    const res = await withAuth(handler)(new Request("http://test/api"), { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ id: "p1" });
  });

  it("autentica antes del handler: un anónimo recibe 401, no el 400 de validación", async () => {
    vi.mocked(requireMember).mockRejectedValue(new AuthError(401, "UNAUTHENTICATED", "No autenticado"));
    const handler = vi.fn(async () => Response.json({ error: "Datos inválidos" }, { status: 400 }));

    const res = await withAuth(handler)();

    expect(handler).not.toHaveBeenCalled();
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "No autenticado", code: "UNAUTHENTICATED" });
  });

  it("traduce una cuenta pendiente a 403 PENDING_APPROVAL", async () => {
    vi.mocked(requireMember).mockRejectedValue(new AuthError(403, "PENDING_APPROVAL", "Cuenta pendiente de aprobación"));
    const res = await withAuth(vi.fn())();
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ code: "PENDING_APPROVAL" });
  });

  it("traduce el AuthError que lanza la capa .server.ts (requireCoordinacion)", async () => {
    const handler = async () => {
      throw new AuthError(403, "FORBIDDEN_ROLE", "Esta acción requiere rol de coordinación");
    };
    const res = await withAuth(handler)();
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      error: "Esta acción requiere rol de coordinación",
      code: "FORBIDDEN_ROLE",
    });
  });

  it.each([
    [412, "LABELS_CHANGED"],
    [428, "PRECONDITION_REQUIRED"],
    [422, "NOT_PROJECT_MEMBER"],
    [409, "ALREADY_PROJECT_MEMBER"],
  ] as const)("traduce ApiError %i %s con su mensaje", async (status, code) => {
    const handler = async () => {
      throw new ApiError(status, code, "mensaje para la UI");
    };
    const res = await withAuth(handler)();
    expect(res.status).toBe(status);
    await expect(res.json()).resolves.toEqual({ error: "mensaje para la UI", code });
  });

  it("re-lanza cualquier otro error para que Next responda 500", async () => {
    const boom = new Error("se cayó la base");
    const handler = async () => {
      throw boom;
    };
    await expect(withAuth(handler)()).rejects.toBe(boom);
  });
});
