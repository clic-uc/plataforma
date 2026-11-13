"use client";

import { useState } from "react";
import type { MemberRole } from "@/generated/prisma/enums";
import { errorMessage } from "@/lib/api/http";
import { MEMBER_ROLE_OPTIONS } from "@/lib/api/status";
import {
  useCreateInvitation,
  useDeleteInvitation,
  type MemberInvitation,
} from "@/lib/api/members";
import { MAX_GITHUB_LOGIN_LENGTH, normalizeGithubLogin } from "@/lib/invitations";

/**
 * Lista de usuarios de GitHub que pueden crear una cuenta. Solo la monta
 * coordinación. Al entrar por primera vez, la cuenta nace aprobada con el rol de
 * su invitación y la invitación sale de esta lista.
 */
export function InvitationsPanel({ invitations }: { invitations: MemberInvitation[] }) {
  const [login, setLogin] = useState("");
  const [role, setRole] = useState<MemberRole>("ROOKIE");
  const [invalid, setInvalid] = useState(false);
  const create = useCreateInvitation();
  const remove = useDeleteInvitation();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const githubLogin = normalizeGithubLogin(login);
    if (!githubLogin) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    create.mutate(
      { githubLogin, role },
      {
        onSuccess: () => {
          setLogin("");
          setRole("ROOKIE");
        },
      },
    );
  }

  function handleRemove(invitation: MemberInvitation) {
    if (
      !window.confirm(
        `¿Quitar la invitación de @${invitation.githubLogin}? No podrá crear su cuenta hasta que la vuelvas a agregar.`,
      )
    ) {
      return;
    }
    remove.mutate(invitation.id);
  }

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold text-text-1">Invitaciones</h2>
        <p className="mt-1 text-sm text-text-2">
          Agrega el usuario de GitHub de la persona y comparte el enlace de ingreso. Cuando entre por primera vez, su
          cuenta se crea ya aprobada con el rol que elijas. Nadie más puede crear una cuenta.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface px-5 py-4"
      >
        <label className="flex min-w-48 flex-1 flex-col gap-1.5">
          <span className="text-xs font-semibold text-text-2">Usuario de GitHub</span>
          <input
            className="field-input"
            value={login}
            onChange={(e) => {
              setLogin(e.target.value);
              setInvalid(false);
            }}
            placeholder="usuario"
            maxLength={MAX_GITHUB_LOGIN_LENGTH + 1}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={invalid}
            required
          />
        </label>
        <label className="flex w-44 flex-col gap-1.5">
          <span className="text-xs font-semibold text-text-2">Rol</span>
          <select className="field-select" value={role} onChange={(e) => setRole(e.target.value as MemberRole)}>
            {MEMBER_ROLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn-primary" disabled={create.isPending}>
          {create.isPending ? "Agregando…" : "Agregar invitación"}
        </button>

        {(invalid || create.isError) && (
          <p className="w-full text-sm text-danger">
            {invalid
              ? "Ese no es un usuario de GitHub válido: letras, números y guiones simples, hasta 39 caracteres."
              : errorMessage(create.error, "No se pudo agregar la invitación. Intenta de nuevo.")}
          </p>
        )}
        {role === "COORDINACION" && (
          <p className="w-full text-xs text-text-2">
            Coordinación puede invitar, aprobar cuentas, cambiar roles y eliminar miembros.
          </p>
        )}
      </form>

      {remove.isError && (
        <p className="text-sm text-danger">
          {errorMessage(remove.error, "No se pudo quitar la invitación. Intenta de nuevo.")}
        </p>
      )}

      {invitations.length === 0 ? (
        <p className="text-sm text-text-3">No hay invitaciones sin usar.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <table className="dir-table">
            <thead>
              <tr>
                <th>Usuario de GitHub</th>
                <th>Rol</th>
                <th>Invitó</th>
                <th>Fecha</th>
                <th><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {invitations.map((invitation) => {
                const removing = remove.isPending && remove.variables === invitation.id;
                return (
                  <tr key={invitation.id}>
                    <td className="font-medium text-text-1!">@{invitation.githubLogin}</td>
                    <td>{invitation.role}</td>
                    <td>{invitation.invitedBy ?? <span className="text-text-3">Ex miembro</span>}</td>
                    <td className="tabular-nums">{invitation.createdAt}</td>
                    <td>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          className="btn-ghost btn-sm"
                          disabled={removing}
                          onClick={() => handleRemove(invitation)}
                        >
                          {removing ? "Quitando…" : "Quitar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
