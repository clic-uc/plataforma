import { ShellProvider } from "@/components/shell/ShellProvider";
import { ShellGrid } from "@/components/shell/ShellGrid";
import { Sidebar } from "@/components/shell/Sidebar";
import { Topbar } from "@/components/shell/Topbar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ShellProvider>
      <ShellGrid>
        <Sidebar />
        <div className="main">
          <Topbar />
          <div className="scroll-area">{children}</div>
        </div>
      </ShellGrid>
    </ShellProvider>
  );
}
