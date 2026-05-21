import { Link, useLocation, useParams } from "react-router-dom";
import {
  Calculator,
  ClipboardCheck,
  DollarSign,
  FileText,
  FolderOpen,
  LayoutDashboard,
  PackageSearch,
  Plus,
  Ruler,
  ScanLine,
  Settings,
} from "lucide-react";
import { useProjects } from "@/hooks/useProjects";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

/**
 * App sidebar — nav for the active project (Dashboard, Take Off, Measure
 * from PDF, Pricing, Cost Breakdown, Materials, Quotation, Tracking,
 * Settings) plus a list of all the user's projects. The "active" project
 * comes from the URL (`:id` for most pages, `:projectId` on the measure /
 * review routes), so the same sidebar works everywhere.
 */
export function AppSidebar() {
  const { user } = useAuth();
  const { projects } = useProjects();
  const params = useParams<{ id?: string; projectId?: string }>();
  const activeProjectId = params.id ?? params.projectId;
  const location = useLocation();

  const navItems = activeProjectId
    ? [
        {
          title: "Dashboard",
          to: `/projects/${activeProjectId}`,
          icon: LayoutDashboard,
        },
        {
          title: "Take Off",
          to: `/projects/${activeProjectId}/takeoff`,
          icon: Ruler,
        },
        {
          title: "Measure from PDF",
          to: `/projects/${activeProjectId}/drawings`,
          icon: ScanLine,
        },
        {
          title: "Pricing & Performance",
          to: `/projects/${activeProjectId}/pricing`,
          icon: DollarSign,
        },
        {
          title: "Cost Breakdown",
          to: `/projects/${activeProjectId}/cost-breakdown`,
          icon: Calculator,
        },
        {
          title: "Materials Order",
          to: `/projects/${activeProjectId}/materials`,
          icon: PackageSearch,
        },
        {
          title: "Quotation",
          to: `/projects/${activeProjectId}/quotation`,
          icon: FileText,
        },
        {
          title: "Tracking",
          to: `/projects/${activeProjectId}/tracking`,
          icon: ClipboardCheck,
        },
        {
          title: "Settings",
          to: `/projects/${activeProjectId}/settings`,
          icon: Settings,
        },
      ]
    : [];

  if (!user) return null;

  return (
    <aside className="hidden w-60 shrink-0 border-r bg-card lg:flex lg:flex-col">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-foreground text-[11px] font-bold text-background">
          BE
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold">BE Landscapes</p>
          <p className="text-[10px] text-muted-foreground">
            Retaining Wall Estimator
          </p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-2">
        {navItems.length > 0 ? (
          <div className="mb-4 space-y-0.5">
            <p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Navigation
            </p>
            {navItems.map(({ title, to, icon: Icon }) => {
              const active = isActiveRoute(location.pathname, to);
              return (
                <Link
                  key={title}
                  to={to}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                    active
                      ? "bg-muted font-medium text-foreground"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {title}
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="px-2 py-4 text-xs text-muted-foreground">
            Open or create a project to see its nav.
          </p>
        )}

        <div className="space-y-0.5">
          <div className="flex items-center justify-between px-2 pb-1">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Projects
            </p>
            <Link
              to="/dashboard"
              title="All projects / create"
              className="text-muted-foreground hover:text-foreground"
            >
              <Plus className="h-3 w-3" />
            </Link>
          </div>
          {projects?.map((project) => {
            const active = project.id === activeProjectId;
            return (
              <Link
                key={project.id}
                to={`/projects/${project.id}`}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                )}
              >
                <FolderOpen className="h-4 w-4 shrink-0" />
                <span className="truncate">{project.name}</span>
              </Link>
            );
          })}
          {projects && projects.length === 0 && (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              No projects yet.
            </p>
          )}
        </div>
      </nav>

      <div className="border-t px-4 py-3">
        <p className="text-[10px] text-muted-foreground">
          BE Landscape Construction
        </p>
      </div>
    </aside>
  );
}

function isActiveRoute(pathname: string, to: string): boolean {
  if (to === pathname) return true;
  // The "Measure from PDF" item should also light up while the user is on
  // the per-page Review or Measure routes (which live under the same
  // project but use the older /pages/:pageId URL shape).
  if (to.endsWith("/drawings")) {
    const projectPath = to.replace(/\/drawings$/, "");
    if (
      pathname.startsWith(`${projectPath}/pages/`) ||
      pathname === to ||
      pathname.startsWith(`${to}/`)
    ) {
      return true;
    }
  }
  return false;
}
