import { describe, expect, it } from "vitest";
import { ApiRequestError, assertOk, errorMessage } from "@/lib/api/http";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("assertOk", () => {
  it("no hace nada con una respuesta ok", async () => {
    await expect(assertOk(json(200, {}), "fallo")).resolves.toBeUndefined();
  });

  it("usa el mensaje del servidor cuando el rechazo trae code", async () => {
    const error = await assertOk(json(412, { error: "Cambiaron los labels", code: "LABELS_CHANGED" }), "fallo").catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ message: "Cambiaron los labels", status: 412, code: "LABELS_CHANGED" });
  });

  it("usa el mensaje genérico si el servidor no explicó el error", async () => {
    await expect(assertOk(json(404, { error: "No encontrado" }), "No se pudo guardar")).rejects.toMatchObject({
      message: "No se pudo guardar",
      code: undefined,
    });
    await expect(assertOk(new Response("<html>", { status: 500 }), "No se pudo guardar")).rejects.toMatchObject({
      message: "No se pudo guardar",
    });
  });
});

describe("errorMessage", () => {
  it("muestra el motivo del servidor solo si viene con code", () => {
    expect(errorMessage(new ApiRequestError("Requiere coordinación", 403, "FORBIDDEN_ROLE"), "genérico")).toBe(
      "Requiere coordinación",
    );
    expect(errorMessage(new ApiRequestError("No se pudo", 500), "genérico")).toBe("genérico");
    expect(errorMessage(new Error("TypeError interno"), "genérico")).toBe("genérico");
    expect(errorMessage(null, "genérico")).toBe("genérico");
  });
});
