import { Link, useLocation } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { GLOBAL_NAV, buildProjectNav, isActiveRoute } from "./nav-items";

/**
 * The full nav list — a persistent "Menu" group plus the active project's
 * "Navigation" group. Shared by the desktop sidebar (expanded) and the mobile
 * drawer. `onNavigate` fires on every link click so a drawer can close itself.
 */
export function NavList({
  activeProjectId,
  onNavigate,
}: {
  activeProjectId?: string;
  onNavigate?: () => void;
}) {
  const location = useLocation();
  const projectNav = buildProjectNav(activeProjectId);

  return (
    <>
      <div className="mb-4 space-y-0.5">
        <p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Menu
        </p>
        {GLOBAL_NAV.map(({ title, to, icon }) => (
          <MenuLink
            key={title}
            to={to}
            icon={icon}
            label={title}
            active={location.pathname === to}
            onNavigate={onNavigate}
          />
        ))}
      </div>

      {projectNav.length > 0 ? (
        <div className="space-y-0.5">
          <p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Navigation
          </p>
          {projectNav.map(({ title, to, icon }) => (
            <MenuLink
              key={title}
              to={to}
              icon={icon}
              label={title}
              active={isActiveRoute(location.pathname, to)}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ) : (
        <p className="px-2 py-4 text-xs text-muted-foreground">
          Open or create a project to see its nav.
        </p>
      )}
    </>
  );
}

function MenuLink({
  to,
  icon: Icon,
  label,
  active,
  onNavigate,
}: {
  to: string;
  icon: LucideIcon;
  label: string;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
        active
          ? "bg-primary/10 font-medium text-accent-foreground"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}
