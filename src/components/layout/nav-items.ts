import {
  Calculator,
  ClipboardCheck,
  DollarSign,
  FileText,
  FolderKanban,
  LayoutDashboard,
  LifeBuoy,
  PackageSearch,
  Ruler,
  ScanLine,
  Settings,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/** A single navigation entry shared by the desktop sidebar and the mobile
 *  drawer so the two can never drift. */
export type NavItem = { title: string; to: string; icon: LucideIcon };

/** Top-level menu, always present once signed in. */
export const GLOBAL_NAV: NavItem[] = [
  { title: "Project List", to: "/dashboard", icon: FolderKanban },
  { title: "Settings", to: "/settings", icon: Settings },
  { title: "Help Centre", to: "/help", icon: LifeBuoy },
];

/** The per-project navigation for the active project, or `[]` when no project
 *  is in scope. The "active" project id comes from the URL (`:id` on most
 *  pages, `:projectId` on the measure / review routes). */
export function buildProjectNav(projectId: string | undefined): NavItem[] {
  if (!projectId) return [];
  return [
    { title: "Dashboard", to: `/projects/${projectId}`, icon: LayoutDashboard },
    {
      title: "Measure from PDF",
      to: `/projects/${projectId}/drawings`,
      icon: ScanLine,
    },
    { title: "Take Off", to: `/projects/${projectId}/takeoff`, icon: Ruler },
    {
      title: "Pricing & Performance",
      to: `/projects/${projectId}/pricing`,
      icon: DollarSign,
    },
    {
      title: "Cost Breakdown",
      to: `/projects/${projectId}/cost-breakdown`,
      icon: Calculator,
    },
    {
      title: "Materials Order",
      to: `/projects/${projectId}/materials`,
      icon: PackageSearch,
    },
    {
      title: "Quotation",
      to: `/projects/${projectId}/quotation`,
      icon: FileText,
    },
    {
      title: "Tracking",
      to: `/projects/${projectId}/tracking`,
      icon: ClipboardCheck,
    },
    {
      title: "Settings",
      to: `/projects/${projectId}/settings`,
      icon: Settings,
    },
  ];
}

/** Whether a nav item's route should render as active for the current path. */
export function isActiveRoute(pathname: string, to: string): boolean {
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
