import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LoginCard } from "@/app/login/LoginCard";
import { getCurrentMember } from "@/lib/auth/guards";
import { TEST_USERS, isTestLoginEnabled, testUsersPassword } from "@/lib/auth/test-login";

export default async function LoginPage() {
  // Valida la sesión, no la presencia de cookie. Resolver esto en el proxy
  // provoca un ciclo /login <-> /dashboard con cookies vencidas.
  const member = await getCurrentMember();
  if (member?.isVerified) redirect("/dashboard");

  return (
    <main className="auth-shell">
      <Suspense fallback={null}>
        <LoginCard testLogin={isTestLoginEnabled() ? { users: TEST_USERS, password: testUsersPassword() } : null} />
      </Suspense>
    </main>
  );
}
