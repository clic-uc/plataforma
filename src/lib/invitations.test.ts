import { describe, expect, it } from "vitest";
import { decideSignUp, githubLoginKey, normalizeGithubLogin } from "@/lib/invitations";

describe("normalizeGithubLogin", () => {
  it("quita espacios y una @ inicial, y pasa a minúsculas", () => {
    expect(normalizeGithubLogin("  @Ana-Rojas  ")).toBe("ana-rojas");
    expect(normalizeGithubLogin("octocat")).toBe("octocat");
    expect(normalizeGithubLogin("A1-b2-C3")).toBe("a1-b2-c3");
  });

  it("acepta de 1 a 39 caracteres", () => {
    expect(normalizeGithubLogin("a")).toBe("a");
    expect(normalizeGithubLogin("a".repeat(39))).toBe("a".repeat(39));
    expect(normalizeGithubLogin("a".repeat(40))).toBeNull();
  });

  it("rechaza guiones al principio, al final o dobles, y cualquier otro carácter", () => {
    for (const value of ["", "  ", "@", "-ana", "ana-", "ana--rojas", "ana_rojas", "ana.rojas", "ana rojas", "@@ana", "añá"]) {
      expect(normalizeGithubLogin(value), value).toBeNull();
    }
  });
});

describe("githubLoginKey", () => {
  it("pasa a minúsculas lo que devuelve GitHub sin validar su formato", () => {
    expect(githubLoginKey("Octo-Cat")).toBe("octo-cat");
    // Cuentas antiguas pueden tener formas que hoy no se aceptan al invitar.
    expect(githubLoginKey("old--Login-")).toBe("old--login-");
  });

  it("devuelve null si no hay login", () => {
    expect(githubLoginKey(undefined)).toBeNull();
    expect(githubLoginKey(null)).toBeNull();
    expect(githubLoginKey("")).toBeNull();
    expect(githubLoginKey(42)).toBeNull();
  });
});

describe("decideSignUp", () => {
  it("deja entrar con una invitación sin usar, con su rol", () => {
    expect(decideSignUp({ role: "EQUIPO", usedAt: null })).toEqual({ allowed: true, role: "EQUIPO" });
  });

  it("rechaza sin invitación o con una ya usada", () => {
    expect(decideSignUp(null)).toEqual({ allowed: false });
    expect(decideSignUp({ role: "EQUIPO", usedAt: new Date() })).toEqual({ allowed: false });
  });
});
