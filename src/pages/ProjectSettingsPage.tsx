import { Navigate, useParams } from "react-router-dom";

/**
 * Per-project Settings — edits the project's config (rates, materials
 * prices, engineering parameters, admin / markup). Distinct from the
 * account-level Settings page at `/settings`. Placeholder for Phase 1.
 */
export function ProjectSettingsPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <Navigate to="/dashboard" replace />;
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Project Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Project-level config — name, client, quote number, plus all the
        rates / prices that drive Pricing & Performance and Cost Breakdown.
      </p>
      <div className="mt-6 rounded-md border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
        Project Settings editor arrives in Phase 4.
      </div>
    </div>
  );
}
