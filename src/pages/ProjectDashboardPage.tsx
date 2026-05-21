import { Navigate, useParams } from "react-router-dom";
import { useProject } from "@/hooks/useProjects";

/**
 * Per-project Dashboard — summary cards (Total m², Cost Total, Quote Total,
 * Projected Profit) plus per-stage breakdowns (Drilling, Posting, Wall
 * Building, Backfill, Engineering, Markup & Margin). Placeholder shell for
 * Phase 1 — wired to real numbers in Phase 4 once the BE engine is ported.
 */
export function ProjectDashboardPage() {
  const { id } = useParams<{ id: string }>();
  const { project, loading } = useProject(id);

  if (!id) return <Navigate to="/dashboard" replace />;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        {loading ? "Loading…" : (project?.name ?? "Project")}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Project overview and summary
      </p>
      <div className="mt-6 rounded-md border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
        Dashboard cards (Total m² / Cost / Quote / Profit + per-stage
        breakdowns) come online once the BE Landscapes engine is ported. For
        now, use the sidebar to jump to Take Off or Measure from PDF.
      </div>
    </div>
  );
}
