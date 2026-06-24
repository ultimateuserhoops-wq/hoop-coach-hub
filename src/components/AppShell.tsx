import { Link, useRouter } from "@tanstack/react-router";
import { useRoles, useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, Users, BookOpen, ClipboardList, Trophy, Library, Settings, LogOut, Dumbbell, Blend, FolderOpen, Menu } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type NavItem = { to: string; label: string; icon: typeof Users; adminOnly?: boolean };
const nav: NavItem[] = [
  { to: "/dashboard", label: "Tổng quan", icon: LayoutDashboard },
  { to: "/students", label: "Học viên", icon: Users },
  { to: "/curriculum", label: "Giáo án AI", icon: BookOpen },
  { to: "/strength", label: "Thể lực (S&C)", icon: Dumbbell },
  { to: "/hybrid", label: "Hybrid", icon: Blend },
  { to: "/tryouts", label: "Try-out Elite", icon: ClipboardList },
  { to: "/creations", label: "My Creations", icon: FolderOpen },
  { to: "/library", label: "Thư viện", icon: Library },
  { to: "/coaches", label: "HLV", icon: Trophy, adminOnly: true },
  { to: "/settings", label: "Cài đặt", icon: Settings, adminOnly: true },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { isAdmin } = useRoles();
  const { user } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  }

  const items = nav.filter((n) => !n.adminOnly || isAdmin);

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <aside className={cn(
        "court-bg fixed inset-y-0 left-0 z-40 w-64 flex-col border-r border-sidebar-border transition-transform md:relative md:flex md:translate-x-0",
        open ? "translate-x-0 flex" : "-translate-x-full hidden md:flex"
      )}>
        <div className="px-5 py-6 border-b border-sidebar-border">
          <Link to="/dashboard" className="flex items-center gap-2 text-court-foreground">
            <div className="size-10 rounded-lg bg-primary flex items-center justify-center font-display text-xl text-primary-foreground">B</div>
            <div className="leading-tight">
              <div className="font-display text-lg">BDC</div>
              <div className="text-xs text-court-foreground/60">Basketball Centre</div>
            </div>
          </Link>
        </div>
        <nav className="flex-1 py-4 px-3 space-y-1">
          {items.map((n) => (
            <Link
              key={n.to}
              to={n.to as any}
              onClick={() => setOpen(false)}
              activeProps={{ className: "bg-primary text-primary-foreground" }}
              inactiveProps={{ className: "text-court-foreground/80 hover:bg-sidebar-accent" }}
              className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium"
            >
              <n.icon className="size-4" /> {n.label}
            </Link>
          ))}
        </nav>
        <div className="p-3 border-t border-sidebar-border">
          <div className="text-xs text-court-foreground/60 px-2 mb-2 truncate">{user?.email}</div>
          <Button onClick={signOut} variant="ghost" className="w-full justify-start text-court-foreground/80 hover:bg-sidebar-accent">
            <LogOut className="size-4" /> Đăng xuất
          </Button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden flex items-center justify-between p-4 border-b">
          <button onClick={() => setOpen(!open)} aria-label="Menu"><Menu /></button>
          <div className="flex items-center gap-2"><Dumbbell className="size-5 text-primary" /><span className="font-display">BDC</span></div>
          <div className="w-6" />
        </header>
        <main className="flex-1 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="border-b bg-card px-6 py-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
