import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/auth/guards";
import { SignOutButton } from "@/app/pendiente/SignOutButton";

export default async function PendientePage() {
  const member = await getCurrentMember();
  if (!member) redirect("/login");
  if (member.isVerified) redirect("/dashboard");

  return (
    <main className="auth-shell">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="logo-wordmark">
            C<em>L</em>IC
          </div>
          <div className="logo-tagline">PLATAFORMA INTERNA</div>
        </div>

        <h1 className="auth-title">Tu cuenta está pendiente</h1>

        <p className="auth-lead">
          Ingresaste como <strong>{member.email}</strong>. Un miembro de coordinación debe aprobar tu acceso antes de que
          puedas entrar a la plataforma.
        </p>

        <p className="auth-note">Cuando te aprueben, vuelve a cargar esta página.</p>

        <SignOutButton />
      </div>
    </main>
  );
}
