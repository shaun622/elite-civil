import { useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { NavList } from "./NavList";
import { GLOBAL_NAV, buildProjectNav, isActiveRoute } from "./nav-items";

const SIDEBAR_KEY = "takeoffmate.sidebarCollapsed";

/**
 * App sidebar — a persistent top-level Menu (Project List, Settings, Help
 * Centre) plus the nav for the active project (Dashboard, Take Off, Measure
 * from PDF, Pricing, Cost Breakdown, Materials, Quotation, Tracking,
 * Settings). The "active" project comes from the URL (`:id` for most pages,
 * `:projectId` on the measure / review routes), so the same sidebar works
 * everywhere. Shown only at `lg`+; below that the Header's hamburger opens the
 * same nav (NavList) in a drawer. The full project list lives on the Project
 * List page.
 */
export function AppSidebar() {
  const { user } = useAuth();
  const params = useParams<{ id?: string; projectId?: string }>();
  const activeProjectId = params.id ?? params.projectId;
  const location = useLocation();

  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(
    () => localStorage.getItem(SIDEBAR_KEY) === "1",
  );

  function toggleSidebar() {
    setSidebarCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const projectNav = buildProjectNav(activeProjectId);

  if (!user) return null;

  return (
    <aside
      className={cn(
        "hidden shrink-0 border-r bg-card transition-[width] duration-150 lg:flex lg:flex-col",
        sidebarCollapsed ? "w-14" : "w-60",
      )}
    >
      <div
        className={cn(
          "flex h-14 items-center border-b",
          sidebarCollapsed ? "justify-center px-0" : "gap-2 px-4",
        )}
      >
        <div className="bg-brand-gradient flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white shadow-sm">
          EC
        </div>
        {!sidebarCollapsed && (
          <>
            <div className="leading-tight">
              <p className="text-sm font-semibold">Elite Civil</p>
              <p className="text-[10px] text-muted-foreground">
                Retaining Wall Estimator
              </p>
            </div>
            <button
              type="button"
              onClick={toggleSidebar}
              title="Collapse sidebar"
              className="ml-auto rounded p-1 text-muted-foreground hover:text-foreground"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </>
        )}
      </div>

      {sidebarCollapsed ? (
        <nav className="flex flex-1 flex-col items-center gap-1 overflow-y-auto py-2">
          {GLOBAL_NAV.map(({ title, to, icon }) => (
            <RailLink
              key={title}
              to={to}
              title={title}
              icon={icon}
              active={location.pathname === to}
            />
          ))}
          {projectNav.length > 0 && <div className="my-1 h-px w-6 bg-border" />}
          {projectNav.map(({ title, to, icon }) => (
            <RailLink
              key={title}
              to={to}
              title={title}
              icon={icon}
              active={isActiveRoute(location.pathname, to)}
            />
          ))}
          <button
            type="button"
            onClick={toggleSidebar}
            title="Expand sidebar"
            className="mt-auto rounded p-2 text-muted-foreground hover:text-foreground"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        </nav>
      ) : (
        <>
          <nav className="flex-1 overflow-y-auto p-2">
            <NavList activeProjectId={activeProjectId} />
          </nav>

          <div className="flex items-center justify-between gap-2 border-t px-4 py-3 text-[10px] text-muted-foreground">
            <span>Elite Civil</span>
            <span className="tabular-nums" title="Build version">
              v{__APP_VERSION__}
            </span>
          </div>
        </>
      )}
    </aside>
  );
}

function RailLink({
  to,
  title,
  icon: Icon,
  active,
}: {
  to: string;
  title: string;
  icon: LucideIcon;
  active: boolean;
}) {
  return (
    <Link
      to={to}
      title={title}
      aria-label={title}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-md transition-colors",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4" />
    </Link>
  );
}
