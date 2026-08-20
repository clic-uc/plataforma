import { redirect } from "next/navigation";
import { ShellProvider } from "@/components/shell/ShellProvider";
import { ShellGrid } from "@/components/shell/ShellGrid";
import { Sidebar } from "@/components/shell/Sidebar";
import { Topbar } from "@/components/shell/Topbar";
import { getCurrentMember } from "@/lib/auth/guards";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Único punto de redirect por sesión en el árbol del dashboard: los guards de
  // la capa de datos lanzan AuthError en vez de redirigir (ver guards.ts).
  const member = await getCurrentMember();
  if (!member) redirect("/login");
  if (!member.isVerified) redirect("/pendiente");

  return (
    <ShellProvider>
      <ShellGrid>
        <Sidebar member={member} />
        <div className="main">
          <Topbar />
          <div className="scroll-area">{children}</div>
        </div>
      </ShellGrid>
    </ShellProvider>
  );
}
