import { Link, Navigate, useParams } from "react-router-dom";
import { ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProject } from "@/hooks/useProjects";

/**
 * Take Off — manual wall-entry form + measured walls list. Placeholder
 * shell for Phase 1; real form + table land in Phase 4.
 */
export function TakeOffPage() {
  const { id } = useParams<{ id: string }>();
  const { project, loading } = useProject(id);

  if (!id) return <Navigate to="/dashboard" replace />;

  return (
    <div className="p-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Take Off</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {loading ? "Loading…" : (project?.name ?? "")}
          </p>
        </div>
        <Button asChild>
          <Link to={`/projects/${id}/drawings`} className="gap-1.5">
            <ScanLine className="h-4 w-4" />
            Measure from PDF
          </Link>
        </Button>
      </div>
      <div className="mt-6 rounded-md border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
        Manual wall entry form + combined walls table arrive in Phase 4. For
        now, use Measure from PDF to capture walls; the rest of the
        estimator reads them once Phase 2's data-model migration ships.
      </div>
    </div>
  );
}
